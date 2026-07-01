const express = require('express');
const router = express.Router();
const { formatArabicDate } = require('../utils/helpers');
const db = require('../config/firebase'); // استدعاء قاعدة البيانات مباشرة هنا
const processMessage = require('../services/aiEngine');
const { sendWhatsAppMessage, sendInteractiveButtons, sendInteractiveList } = require('../services/whatsapp');

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "my_super_secret_token_123";

router.get('/webhook', (req, res) => {
    // كود التحقق زي ما هو
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];
    if (mode && token && mode === 'subscribe' && token === VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

router.post('/webhook', async (req, res) => {
    let body = req.body;

    if (body.object && body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages && body.entry[0].changes[0].value.messages[0]) {
        let message = body.entry[0].changes[0].value.messages[0];
        let from = message.from;

        try {
            // ==========================================
            // 1. لو المريض بعت نص عادي (بداية المحادثة)
            // ==========================================
            if (message.type === 'text') {
                console.log(`📩 رسالة نصية من ${from}: ${message.text.body}`);
                
                // نبعتله القائمة الرئيسية فوراً
            await sendInteractiveButtons(from, "مرحباً بك في المستشفى 🏥\nكيف يمكننا مساعدتك اليوم؟", [
                { id: "FLOW_BOOK_DOCTOR", title: "👨‍⚕️ حجز طبيب" },
                { id: "FLOW_PHARMACY", title: "💊 صيدلية المستشفى" },
                { id: "FLOW_MY_APPOINTMENTS", title: "📅 مواعيدي / إلغاء" }
            ]);
            } 
            
            // ==========================================
            // 2. لو المريض ضغط على زرار أو قائمة
            // ==========================================
            else if (message.type === 'interactive') {
                let interactive = message.interactive;
                // تحديد الـ ID بناءً على هل هو زرار ولا عنصر من قائمة
                let actionId = interactive.type === 'button_reply' ? interactive.button_reply.id : interactive.list_reply.id;
                console.log(`🔘 المريض اختار: ${actionId}`);

                // --- مسار حجز الطبيب ---
                if (actionId === 'FLOW_BOOK_DOCTOR') {
                    const docs = await db.collection('doctors').get();
                    let specialties = new Set();
                    docs.forEach(d => specialties.add(d.data().specialty));
                    
                    let rows = Array.from(specialties).map(spec => ({
                        id: `SPEC_${spec}`, title: `تخصص ${spec}`
                    }));

                    await sendInteractiveList(from, "الرجاء اختيار التخصص المطلوب:", "اختر التخصص", [
                        { title: "التخصصات المتاحة", rows: rows }
                    ]);
                }
                // --- مسار عرض حجوزات المريض ---
                else if (actionId === 'FLOW_MY_APPOINTMENTS') {
                    // هندور في الداتابيز على حجوزات الرقم ده اللي لسه confirmed
                    const snapshot = await db.collection('reservations')
                        .where('patient_phone', '==', from)
                        .where('status', '==', 'confirmed')
                        .get();

                    if (snapshot.empty) {
                        await sendWhatsAppMessage(from, "ليس لديك أي حجوزات قادمة مسجلة برقمك حالياً.");
                    } else {
                        let rows = [];
                        snapshot.forEach(doc => {
                            let data = doc.data();
                            // هنخلي الـ ID شايل رقم الـ Document بتاع الحجز عشان نوصله بسهولة
                            rows.push({ 
                                id: `CANCEL_${doc.id}_${data.doctor}_${data.time}`, 
                                title: `إلغاء: ${data.doctor}`, 
                                description: `الموعد: ${data.time}` 
                            });
                        });

                        await sendInteractiveList(from, "حجوزاتك الحالية (اختر الحجز الذي تريد إلغاءه):", "اختر الحجز", [
                            { title: "قائمة حجوزاتك", rows: rows }
                        ]);
                    }
                }

                // --- مسار تنفيذ الإلغاء ---
                else if (actionId.startsWith('CANCEL_')) {
                    // الـ ID شكله: CANCEL_ReservationID_DoctorName_Time
                    let parts = actionId.split('_');
                    let reservationId = parts[1];
                    let doctorName = parts[2];
                    let time = parts.slice(3).join('_'); // عشان لو الوقت فيه مسافات

                    try {
                        // 1. تحديث حالة الحجز في الداتابيز لإلغاء
                        await db.collection('reservations').doc(reservationId).update({
                            status: "cancelled",
                            cancelled_at: new Date()
                        });

                        // 2. إرجاع الميعاد لقائمة الدكتور عشان مريض تاني يقدر يحجزه
                        const docRef = db.collection('doctors').doc(doctorName);
                        const docSnap = await docRef.get();
                        
                        if (docSnap.exists) {
                            let appointments = docSnap.data().appointments || [];
                            // نتأكد إن الميعاد مش موجود أصلاً قبل ما نضيفه
                            if (!appointments.includes(time)) {
                                appointments.push(time);
                                // ممكن نرتب المواعيد لو حابب، بس حالياً مجرد إضافته تكفي
                                await docRef.update({ appointments: appointments });
                            }
                        }

                        await sendWhatsAppMessage(from, `✅ تم إلغاء حجزك مع د. ${doctorName} في موعد (${time}) بنجاح.\nنتمنى لك دوام الصحة!`);
                    } catch (error) {
                        console.error("❌ خطأ في إلغاء الحجز:", error);
                        await sendWhatsAppMessage(from, "عذراً، حدث خطأ أثناء إلغاء الحجز. يرجى المحاولة لاحقاً.");
                    }
                }
                
                // --- اختيار التخصص (عرض الأطباء) ---
                else if (actionId.startsWith('SPEC_')) {
                    let selectedSpec = actionId.replace('SPEC_', '');
                    const docs = await db.collection('doctors').where('specialty', '==', selectedSpec).get();
                    
                    let rows = [];
                    docs.forEach(d => {
                        let data = d.data();
                        if (data.appointments && data.appointments.length > 0) {
                            rows.push({ id: `DOC_${d.id}`, title: `د. ${d.id}`, description: "متاح للحجز" });
                        }
                    });

                    if (rows.length > 0) {
                        await sendInteractiveList(from, `أطباء تخصص (${selectedSpec}) المتاحين:`, "اختر الطبيب", [
                            { title: "قائمة الأطباء", rows: rows }
                        ]);
                    } else {
                        await sendWhatsAppMessage(from, `عذراً، لا يوجد أطباء متاحين في تخصص ${selectedSpec} حالياً.`);
                    }
                }
                
                else if (actionId.startsWith('DOC_')) {
                    let doctorName = actionId.replace('DOC_', '');
                    const docSnap = await db.collection('doctors').doc(doctorName).get();
                    let data = docSnap.data();
                    
                    let rows = data.appointments.map(timeISO => {
                        let displayTime = formatArabicDate(timeISO); // تحويل التاريخ لعربي للمريض
                        return {
                            id: `BOOK_${doctorName}_${timeISO}`, // بنحفظ التاريخ الأصلي في الـ ID
                            title: displayTime.substring(0, 24) // ميتا بترفض أي Title أطول من 24 حرف
                        };
                    });

                    if (rows.length > 0) {
                        await sendInteractiveList(from, `المواعيد المتاحة لدكتور ${doctorName}:`, "اختر الموعد", [
                            { title: "المواعيد المتاحة", rows: rows }
                        ]);
                    } else {
                        await sendWhatsAppMessage(from, `عذراً، لا يوجد مواعيد متاحة حالياً لدكتور ${doctorName}.`);
                    }
                }
                
                else if (actionId.startsWith('BOOK_')) {
                    let parts = actionId.split('_');
                    let doctorName = parts[1];
                    let time = parts.slice(2).join('_'); // عشان لو الميعاد جواه مسافات

                    const docRef = db.collection('doctors').doc(doctorName);
                    const docSnap = await docRef.get();
                    let appointments = docSnap.data().appointments;
                    const timeIndex = appointments.indexOf(time);

                    if (timeIndex > -1) {
                        // حذف الميعاد من الداتابيز
                        appointments.splice(timeIndex, 1);
                        await docRef.update({ appointments: appointments });

                        // تسجيل الحجز
                        await db.collection('reservations').add({
                            doctor: doctorName, time: time, patient_phone: from, status: "confirmed", created_at: new Date()
                        });

                        await sendWhatsAppMessage(from, `✅ تم تأكيد حجزك بنجاح!\n👨‍⚕️ د. ${doctorName}\n🕒 الموعد: ${time}\nنتمنى لك دوام الصحة.`);
                    } else {
                        await sendWhatsAppMessage(from, `❌ عذراً، هذا الموعد تم حجزه منذ قليل. يرجى اختيار موعد آخر.`);
                    }
                }

                // --- مسار الصيدلية (يُرسل لـ Groq AI) ---
                else if (actionId === 'FLOW_PHARMACY') {
                    await sendWhatsAppMessage(from, "مرحباً بك في الصيدلية 💊. أرسل اسم الدواء الذي تبحث عنه وسأقوم بفحص توفره فوراً.");
                }
            }

        } catch (error) {
            console.error("❌ حدث خطأ:", error);
            await sendWhatsAppMessage(from, "عذراً، حدث خطأ فني. يرجى المحاولة لاحقاً.");
        }

        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
});

module.exports = router;