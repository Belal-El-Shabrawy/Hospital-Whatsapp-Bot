const express = require('express');
const router = express.Router();
const { formatArabicDate } = require('../utils/helpers');
const db = require('../config/firebase');
const processMessage = require('../services/aiEngine');
const { analyzeHospitalImage } = require('../services/visionEngine');
const findMedicineDoc = require('../services/medicineService');
const { sendWhatsAppMessage, sendInteractiveButtons, sendInteractiveList, downloadWhatsAppImage } = require('../services/whatsapp');

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "my_super_secret_token_123";
// رقم واتساب الصيدلي المسؤول عن مراجعة طلبات الروشتات قبل التأكيد النهائي (خطوة "Pharmacist confirmation" في الفلو)
const PHARMACIST_PHONE_NUMBER = process.env.PHARMACIST_PHONE_NUMBER || null;

router.get('/webhook', (req, res) => {
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
            // 1. لو المريض بعت نص عادي
            // ==========================================
            if (message.type === 'text') {
                let msgBody = message.text.body;
                console.log(`📩 رسالة نصية من ${from}: ${msgBody}`);

                const greetings = ['اهلا', 'أهلا', 'مرحبا', 'مرحباً', 'سلام', 'السلام', 'hi', 'hello', 'القائمة', 'menu'];
                const isGreeting = greetings.some(g => msgBody.toLowerCase().includes(g)) || msgBody.length <= 2;

                if (isGreeting) {
                    await sendInteractiveButtons(from, "مرحباً بك في المستشفى 🏥\nكيف يمكننا مساعدتك اليوم؟", [
                        { id: "FLOW_BOOK_DOCTOR", title: "👨‍⚕️ حجز طبيب" },
                        { id: "FLOW_PHARMACY", title: "💊 صيدلية المستشفى" },
                        { id: "FLOW_MY_APPOINTMENTS", title: "📅 مواعيدي / إلغاء" }
                    ]);
                } else {
                    const aiReply = await processMessage(msgBody, from);
                    console.log(`✅ رد الـ AI: ${aiReply}`);
                    await sendWhatsAppMessage(from, aiReply);
                }
            }

            // ==========================================
            // 2. لو المريض ضغط على زرار أو قائمة
            // ==========================================
            else if (message.type === 'interactive') {
                let interactive = message.interactive;
                let actionId = interactive.type === 'button_reply' ? interactive.button_reply.id : interactive.list_reply.id;
                console.log(`🔘 المريض اختار: ${actionId}`);

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

                else if (actionId.startsWith('SPEC_')) {
                    let selectedSpec = actionId.replace('SPEC_', '');
                    const docs = await db.collection('doctors').where('specialty', '==', selectedSpec).get();

                    let availableDays = new Set();
                    let dayMap = {};

                    docs.forEach(d => {
                        let data = d.data();
                        if (data.appointments && data.appointments.length > 0) {
                            data.appointments.forEach(timeISO => {
                                let dateKey = timeISO.split('T')[0];
                                availableDays.add(dateKey);

                                if (!dayMap[dateKey]) {
                                    dayMap[dateKey] = formatArabicDate(timeISO).split('،')[0];
                                }
                            });
                        }
                    });

                    if (availableDays.size > 0) {
                        let sortedDays = Array.from(availableDays).sort((a, b) => new Date(a) - new Date(b));
                        let rows = sortedDays.map(dateKey => ({
                            id: `DAY_${selectedSpec}_${dateKey}`,
                            title: dayMap[dateKey].substring(0, 24)
                        }));

                        await sendInteractiveList(from, `الأيام المتاحة لتخصص (${selectedSpec}):`, "اختر اليوم", [
                            { title: "الأيام المتاحة", rows: rows }
                        ]);
                    } else {
                        await sendWhatsAppMessage(from, `عذراً، لا يوجد مواعيد متاحة في تخصص ${selectedSpec} حالياً.`);
                    }
                }

                else if (actionId.startsWith('DAY_')) {
                    let parts = actionId.split('_');
                    let selectedSpec = parts[1];
                    let selectedDate = parts[2];

                    const docs = await db.collection('doctors').where('specialty', '==', selectedSpec).get();
                    let rows = [];

                    docs.forEach(d => {
                        let data = d.data();
                        if (data.appointments) {
                            let hasApptOnDate = data.appointments.some(timeISO => timeISO.startsWith(selectedDate));
                            if (hasApptOnDate) {
                                rows.push({
                                    id: `DOC_${d.id}_${selectedDate}`,
                                    title: `د. ${d.id}`,
                                    description: "متاح في هذا اليوم"
                                });
                            }
                        }
                    });

                    if (rows.length > 0) {
                        let displayDate = formatArabicDate(`${selectedDate}T12:00:00`).split('،')[0];
                        await sendInteractiveList(from, `أطباء (${selectedSpec}) المتاحين يوم ${displayDate}:`, "اختر الطبيب", [
                            { title: "قائمة الأطباء", rows: rows }
                        ]);
                    } else {
                        await sendWhatsAppMessage(from, `عذراً، لا يوجد أطباء متاحين في هذا اليوم.`);
                    }
                }

                else if (actionId.startsWith('DOC_')) {
                    let parts = actionId.split('_');
                    let doctorName = parts[1];
                    let selectedDate = parts[2];

                    const docSnap = await db.collection('doctors').doc(doctorName).get();
                    let data = docSnap.data();

                    let dayAppointments = data.appointments.filter(timeISO => timeISO.startsWith(selectedDate));

                    let rows = dayAppointments.map(timeISO => {
                        let fullArabicDate = formatArabicDate(timeISO);
                        let displayTime = fullArabicDate.split('،').pop().trim();

                        return {
                            id: `BOOK_${doctorName}_${timeISO}`,
                            title: `الساعة: ${displayTime}`.substring(0, 24)
                        };
                    });

                    if (rows.length > 0) {
                        await sendInteractiveList(from, `المواعيد المتاحة لدكتور ${doctorName}:`, "اختر الساعة", [
                            { title: "الساعات المتاحة", rows: rows }
                        ]);
                    } else {
                        await sendWhatsAppMessage(from, `عذراً، لا يوجد مواعيد متاحة حالياً لدكتور ${doctorName} في هذا اليوم.`);
                    }
                }

                else if (actionId.startsWith('BOOK_')) {
                    let parts = actionId.split('_');
                    let doctorName = parts[1];
                    let timeISO = parts.slice(2).join('_');

                    const docRef = db.collection('doctors').doc(doctorName);
                    const docSnap = await docRef.get();
                    let appointments = docSnap.data().appointments;
                    const timeIndex = appointments.indexOf(timeISO);

                    if (timeIndex > -1) {
                        appointments.splice(timeIndex, 1);
                        await docRef.update({ appointments: appointments });

                        await db.collection('reservations').add({
                            doctor: doctorName,
                            time: timeISO,
                            patient_phone: from,
                            status: "confirmed",
                            created_at: new Date()
                        });

                        let displayTime = formatArabicDate(timeISO);
                        await sendWhatsAppMessage(from, `✅ تم تأكيد حجزك بنجاح!\n👨‍⚕️ د. ${doctorName}\n🕒 الموعد: ${displayTime}\nنتمنى لك دوام الصحة.`);
                    } else {
                        await sendWhatsAppMessage(from, `❌ عذراً، هذا الموعد تم حجزه منذ قليل. يرجى اختيار موعد آخر.`);
                    }
                }

                else if (actionId === 'FLOW_MY_APPOINTMENTS') {
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
                            let displayTime = data.time.includes('T') ? formatArabicDate(data.time) : data.time;

                            rows.push({
                                id: `CANCEL_${doc.id}_${data.doctor}_${data.time}`,
                                title: `إلغاء: د. ${data.doctor}`,
                                description: `الموعد: ${displayTime}`.substring(0, 70)
                            });
                        });

                        await sendInteractiveList(from, "حجوزاتك الحالية (اختر الحجز الذي تريد إلغاءه):", "اختر الحجز", [
                            { title: "قائمة حجوزاتك", rows: rows }
                        ]);
                    }
                }

                else if (actionId.startsWith('CANCEL_')) {
                    let parts = actionId.split('_');
                    let reservationId = parts[1];
                    let doctorName = parts[2];
                    let timeISO = parts.slice(3).join('_');

                    try {
                        if (timeISO.includes('T')) {
                            const appointmentDate = new Date(timeISO);
                            const now = new Date();
                            const diffInHours = (appointmentDate - now) / (1000 * 60 * 60);

                            if (diffInHours < 24) {
                                let displayTime = formatArabicDate(timeISO);
                                await sendWhatsAppMessage(from, `⚠️ عذراً، سياسة المستشفى تمنع إلغاء الموعد قبلها بأقل من 24 ساعة.\n\nموعدك مع د. ${doctorName} (${displayTime}) متبقي عليه أقل من يوم، يرجى التواصل هاتفياً.`);
                                return res.sendStatus(200);
                            }
                        }

                        await db.collection('reservations').doc(reservationId).update({
                            status: "cancelled",
                            cancelled_at: new Date()
                        });

                        const docRef = db.collection('doctors').doc(doctorName);
                        const docSnap = await docRef.get();

                        if (docSnap.exists) {
                            let appointments = docSnap.data().appointments || [];
                            if (!appointments.includes(timeISO)) {
                                appointments.push(timeISO);
                                appointments.sort((a, b) => new Date(a) - new Date(b));
                                await docRef.update({ appointments: appointments });
                            }
                        }

                        let displayTime = timeISO.includes('T') ? formatArabicDate(timeISO) : timeISO;
                        await sendWhatsAppMessage(from, `✅ تم إلغاء حجزك مع د. ${doctorName} في موعد (${displayTime}) بنجاح.\nنتمنى لك دوام الصحة!`);
                    } catch (error) {
                        console.error("❌ خطأ في إلغاء الحجز:", error);
                        await sendWhatsAppMessage(from, "عذراً، حدث خطأ أثناء إلغاء الحجز. يرجى المحاولة لاحقاً.");
                    }
                }

                else if (actionId === 'FLOW_PHARMACY') {
                    await sendWhatsAppMessage(from, "مرحباً بك في الصيدلية 💊. أرسل اسم الدواء الذي تبحث عنه أو قم بتصوير الروشتة وسأقوم بفحصها فوراً.");
                }

                // ==========================================
                // 🆕 المريض دوس "احجز الأدوية" بعد فحص الروشتة
                // بنحول الطلب لحالة "مراجعة الصيدلي" ونبعتله رسالة فيها زرارين تأكيد/رفض (خطوة Pharmacist confirmation في الفلو)
                // ==========================================
                else if (actionId.startsWith('BOOK_ORDER_')) {
                    const orderId = actionId.replace('BOOK_ORDER_', '');
                    const orderRef = db.collection('prescription_orders').doc(orderId);
                    const orderSnap = await orderRef.get();

                    if (!orderSnap.exists || orderSnap.data().status !== 'draft') {
                        await sendWhatsAppMessage(from, "❌ عذراً، هذا الطلب لم يعد متاحاً (ربما تم التعامل معه بالفعل).");
                        return res.sendStatus(200);
                    }

                    const order = orderSnap.data();
                    await orderRef.update({ status: 'pending_pharmacist_review', requested_at: new Date() });

                    await sendWhatsAppMessage(from, "⏳ تم إرسال طلبك للصيدلي للمراجعة والتأكيد، هنبلغك فور الرد.");

                    if (PHARMACIST_PHONE_NUMBER) {
                        let itemsList = order.items.map(it => `- ${it.id.toUpperCase()} (${it.price})`).join('\n');
                        await sendInteractiveButtons(
                            PHARMACIST_PHONE_NUMBER,
                            `📋 طلب روشتة جديد يحتاج مراجعتك\nمن المريض: ${from}\n\nالأدوية:\n${itemsList}`,
                            [
                                { id: `CONFIRM_ORDER_${orderId}`, title: "✅ تأكيد الطلب" },
                                { id: `REJECT_ORDER_${orderId}`, title: "❌ رفض الطلب" }
                            ]
                        );
                    } else {
                        console.warn("⚠️ PHARMACIST_PHONE_NUMBER غير مُعرّف في .env — لن يتم إرسال الطلب لأي صيدلي للمراجعة.");
                    }
                }

                // المريض دوس "لا شكراً" بعد فحص الروشتة
                else if (actionId.startsWith('CANCEL_ORDER_')) {
                    const orderId = actionId.replace('CANCEL_ORDER_', '');
                    await db.collection('prescription_orders').doc(orderId).update({ status: 'cancelled_by_patient' });
                    await sendWhatsAppMessage(from, "تم الإلغاء. لو احتجت أي حاجة تانية أنا موجود 🙌");
                }

                // ==========================================
                // 🆕 الصيدلي (من رقمه المسجل في PHARMACIST_PHONE_NUMBER بس) بيدوس تأكيد/رفض على الطلب
                // ==========================================
                else if (actionId.startsWith('CONFIRM_ORDER_')) {
                    if (!PHARMACIST_PHONE_NUMBER || from !== PHARMACIST_PHONE_NUMBER) {
                        await sendWhatsAppMessage(from, "❌ عذراً، هذا الإجراء متاح فقط لصيدلي المستشفى المسجل.");
                        return res.sendStatus(200);
                    }

                    const orderId = actionId.replace('CONFIRM_ORDER_', '');
                    const orderRef = db.collection('prescription_orders').doc(orderId);
                    const orderSnap = await orderRef.get();

                    if (!orderSnap.exists || orderSnap.data().status !== 'pending_pharmacist_review') {
                        await sendWhatsAppMessage(from, "⚠️ هذا الطلب تمت معالجته بالفعل أو غير موجود.");
                        return res.sendStatus(200);
                    }

                    const order = orderSnap.data();

                    // بننزل المخزون فعلياً بس دلوقتي (بعد تأكيد بشري)، مش وقت الحجز الأولي من المريض
                    for (const item of order.items) {
                        const medRef = db.collection('medicines').doc(item.id);
                        const medSnap = await medRef.get();
                        if (medSnap.exists && medSnap.data().stock > 0) {
                            await medRef.update({ stock: medSnap.data().stock - 1 });
                        }
                    }

                    await orderRef.update({ status: 'confirmed', confirmed_at: new Date() });
                    await sendWhatsAppMessage(from, "✅ تم تأكيد الطلب بنجاح.");
                    await sendWhatsAppMessage(order.patient_phone, "✅ تم تأكيد طلبك من الصيدلي! تقدر تستلم أدويتك من مقر الصيدلية دلوقتي. نتمنى لك دوام الصحة 🌿");
                }

                else if (actionId.startsWith('REJECT_ORDER_')) {
                    if (!PHARMACIST_PHONE_NUMBER || from !== PHARMACIST_PHONE_NUMBER) {
                        await sendWhatsAppMessage(from, "❌ عذراً، هذا الإجراء متاح فقط لصيدلي المستشفى المسجل.");
                        return res.sendStatus(200);
                    }

                    const orderId = actionId.replace('REJECT_ORDER_', '');
                    const orderRef = db.collection('prescription_orders').doc(orderId);
                    const orderSnap = await orderRef.get();

                    if (!orderSnap.exists || orderSnap.data().status !== 'pending_pharmacist_review') {
                        await sendWhatsAppMessage(from, "⚠️ هذا الطلب تمت معالجته بالفعل أو غير موجود.");
                        return res.sendStatus(200);
                    }

                    const order = orderSnap.data();
                    await orderRef.update({ status: 'rejected', rejected_at: new Date() });
                    await sendWhatsAppMessage(from, "تم رفض الطلب ❌");
                    await sendWhatsAppMessage(order.patient_phone, "❌ عذراً، لم يتم تأكيد طلبك من الصيدلي. يرجى التواصل مع الصيدلية مباشرة للتفاصيل.");
                }
            }

            // ==========================================
            // 3. لو المريض بعت صورة (روشتة أو كارنيه تأمين)
            // ==========================================
            else if (message.type === 'image') {
                let imageId = message.image.id;
                let mimeType = message.image.mime_type || "image/jpeg";
                console.log(`📸 استلام ميديا من ${from}، جاري المعالجة...`);

                await sendWhatsAppMessage(from, "⏳ جاري قراءة الصورة وفحص البيانات، لحظات من فضلك...");

                const imageBuffer = await downloadWhatsAppImage(imageId);

                if (!imageBuffer) {
                    await sendWhatsAppMessage(from, "❌ عذراً، فشل تحميل الصورة من سيرفرات واتساب. يرجى إعادة إرسالها.");
                    return res.sendStatus(200);
                }

                const analysis = await analyzeHospitalImage(imageBuffer, mimeType);
                console.log("🧠 نتيجة تحليل الذكاء الاصطناعي للصورة:", analysis);

                if (!analysis) {
                    await sendWhatsAppMessage(from, "❌ عذراً، واجهنا صعوبة في قراءة تفاصيل الصورة. تأكد أن الإضاءة جيدة والخط واضح.");
                    return res.sendStatus(200);
                }

                if (analysis.type === 'prescription') {
                    if (!analysis.medicines || analysis.medicines.length === 0) {
                        await sendWhatsAppMessage(from, "📝 تم فحص الروشتة بنجاح، ولكن لم نتمكن من قراءة أي أسماء أدوية واضحة فيها.");
                        return res.sendStatus(200);
                    }

                    let replyMessage = "📝 **نتائج فحص الروشتة الذكي:**\nإليك الأدوية وحالة توفرها:\n\n";
                    // 🆕 هنجمع هنا الأدوية المتوفرة فقط (اللي ليها stock) عشان نبني منها طلب حجز حقيقي
                    let availableItems = [];

                    // 🔧 بدل الاستعلام القديم على مجموعة "pharmacy" وحقل "name" (اللي مش موجودين في قاعدة البيانات الحقيقية)،
                    // بنستخدم findMedicineDoc اللي هي نفس منطق المطابقة المستخدم في باقي البوت (عربي/إنجليزي/مرادفات/تشابه إملائي)
                    for (const medName of analysis.medicines) {
                        const { doc } = await findMedicineDoc(medName);

                        if (doc) {
                            const item = doc.data();
                            if (item.stock > 0) {
                                replyMessage += `✅ **${doc.id.toUpperCase()}**: متوفر (السعر: ${item.price})\n`;
                                availableItems.push({ id: doc.id, price: item.price });
                            } else {
                                replyMessage += `⚠️ **${doc.id.toUpperCase()}**: مسجل لكن غير متوفر بالمخزون حالياً.\n`;
                            }
                        } else {
                            replyMessage += `❌ **${medName.toUpperCase()}**: غير متوفر حالياً.\n`;
                        }
                    }

                    await sendWhatsAppMessage(from, replyMessage);

                    // 🆕 لو فيه أدوية متوفرة فعلاً، بننشئ "طلب روشتة" (Draft) في Firestore ونعرض زرارين للمريض
                    // بدل السؤال النصي القديم، وده اللي هيتحول بعدين لمراجعة الصيدلي (خطوة "Pharmacist confirmation")
                    if (availableItems.length > 0) {
                        const orderRef = await db.collection('prescription_orders').add({
                            patient_phone: from,
                            items: availableItems,
                            status: 'draft', // draft -> pending_pharmacist_review -> confirmed / rejected / cancelled_by_patient
                            created_at: new Date()
                        });

                        await sendInteractiveButtons(from, "💊 تحب تحجز الأدوية المتوفرة دي وتستلمها من مقر الصيدلية؟", [
                            { id: `BOOK_ORDER_${orderRef.id}`, title: "📦 احجز الأدوية" },
                            { id: `CANCEL_ORDER_${orderRef.id}`, title: "❌ لا شكراً" }
                        ]);
                    }
                }
                else if (analysis.type === 'insurance') {
                    let insuranceReply = `💳 **تم قراءة كارنيه التأمين بنجاح:**\n👤 الاسم: ${analysis.patient_name}\n🏢 الشركة: ${analysis.company}\n🔢 رقم: ${analysis.card_number}\n✅ تم تفعيل التغطية بنجاح!`;
                    await sendWhatsAppMessage(from, insuranceReply);
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