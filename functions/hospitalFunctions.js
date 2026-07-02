const db = require('../config/firebase');
const findMedicineDoc = require('../services/medicineService');
const { normalizeDay, formatArabicDate, getArabicWeekday } = require('../utils/helpers');

// بيدور على الميعاد المطلوب وسط قائمة مواعيد الدكتور (ISO strings)، بيقارن بالنص الخام أو بالصيغة العربية المعروضة للمريض
function findAppointmentIndex(availableTimes, appointmentTimeText) {
    const target = appointmentTimeText.trim();
    return availableTimes.findIndex(t => {
        const displayed = formatArabicDate(t);
        return (
            t.trim() === target ||
            displayed === target ||
            displayed.includes(target) ||
            target.includes(displayed) ||
            target.includes(t) ||
            t.includes(target)
        );
    });
}

// الدوال الفعلية التي ستتحدث مع Firestore، وبيناديها الـ AI حسب حاجة المريض
const functions = {
    check_medicine_stock: async ({ medicine_name } = {}) => {
        if (!medicine_name) return "عايز اسم الدواء عشان أقدر أبحث عنه.";
        const { doc } = await findMedicineDoc(medicine_name);

        if (!doc) return "هذا الدواء غير موجود في قاعدة بيانات المستشفى.";

        const item = doc.data();
        if (item.stock > 0) return `متوفر (${doc.id}). الكمية: ${item.stock}، السعر: ${item.price}.`;
        return `الدواء (${doc.id}) مسجل لكن الكمية الحالية 0 (غير متوفر).`;
    },

    get_available_appointments: async ({ doctor_name } = {}) => {
        if (!doctor_name) return "عايز اسم الدكتور اللي محتاج تعرف مواعيده.";
        let cleanName = doctor_name.replace(/الدكتورة|الدكتور|دكتورة|دكتور|د\./g, '').trim();
        const docRef = db.collection('doctors').doc(cleanName);
        const doc = await docRef.get();

        if (!doc.exists) return `لم نجد طبيب باسم ${cleanName}.`;

        const data = doc.data();
        if (!data.appointments || data.appointments.length === 0) {
            return `عذراً، لا يوجد مواعيد متاحة حالياً لدكتور ${cleanName}.`;
        }
        const displayTimes = data.appointments.map(t => formatArabicDate(t));
        return `المواعيد المتاحة للدكتور ${cleanName} هي: ${displayTimes.join('، ')}.`;
    },

    list_all_doctors: async ({ day } = {}) => {
        const snapshot = await db.collection('doctors').get();
        if (snapshot.empty) return "لا يوجد أطباء مسجلين حالياً.";

        const normalizedDay = normalizeDay(day);
        let doctorsWithSchedules = normalizedDay ? `إليك قائمة الأطباء المتاحين يوم ${normalizedDay}:\n` : "إليك قائمة الأطباء المتواجدين ومواعيدهم:\n";
        let hasAvailableDoctors = false;

        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.appointments && data.appointments.length > 0) {
                if (normalizedDay) {
                    const dayAppointments = data.appointments.filter(t => normalizeDay(getArabicWeekday(t)) === normalizedDay);
                    if (dayAppointments.length > 0) {
                        const displayTimes = dayAppointments.map(t => formatArabicDate(t));
                        doctorsWithSchedules += `- دكتور ${doc.id}${data.specialty ? ` (${data.specialty})` : ''}: مواعيده هي (${displayTimes.join('، ')})\n`;
                        hasAvailableDoctors = true;
                    }
                } else {
                    const displayTimes = data.appointments.map(t => formatArabicDate(t));
                    doctorsWithSchedules += `- دكتور ${doc.id}${data.specialty ? ` (${data.specialty})` : ''}: مواعيده هي (${displayTimes.join('، ')})\n`;
                    hasAvailableDoctors = true;
                }
            }
        });

        if (!hasAvailableDoctors) {
            return normalizedDay ? `عذراً، لا يوجد أطباء متاحين يوم ${normalizedDay}.` : "عذراً، جميع مواعيد الأطباء محجوزة بالكامل في الوقت الحالي.";
        }

        return doctorsWithSchedules;
    },

    // 🔧 بقى بيستخدم Firestore Transaction بدل قراءة الكمية وكتابتها في خطوتين منفصلتين.
    // من غير ده، لو مريضين طلبوا آخر علبة في نفس اللحظة، ممكن الاتنين ياخدوا "تم الحجز بنجاح" (Race Condition).
    book_medicine: async ({ medicine_name, quantity } = {}) => {
        if (!medicine_name) return "عايز اسم الدواء عشان أقدر أحجزه.";
        const { docRef } = await findMedicineDoc(medicine_name);

        if (!docRef) return "عذراً، هذا الدواء غير متوفر في المستشفى.";

        const reqQty = quantity || 1;

        try {
            const result = await db.runTransaction(async (transaction) => {
                const freshDoc = await transaction.get(docRef);
                if (!freshDoc.exists) return { success: false, notFound: true };

                const item = freshDoc.data();
                if (item.stock < reqQty) {
                    return { success: false, available: item.stock };
                }

                transaction.update(docRef, { stock: item.stock - reqQty });
                return { success: true, remaining: item.stock - reqQty, name: freshDoc.id };
            });

            if (result.notFound) return "عذراً، هذا الدواء غير متوفر في المستشفى.";
            if (!result.success) return `عذراً، الكمية المطلوبة غير متوفرة. المتاح في المخزن حالياً هو ${result.available} علبة فقط.`;
            return `تم حجز عدد ${reqQty} من دواء ${result.name} بنجاح. رصيد المخزن المتبقي: ${result.remaining}.`;
        } catch (error) {
            console.error("❌ خطأ أثناء حجز الدواء (transaction):", error);
            return "عذراً، حدث خطأ فني أثناء محاولة الحجز. برجاء المحاولة مرة أخرى.";
        }
    },

    // 🔧 بقى بيستخدم Firestore Transaction عشان يمنع حجز نفس الميعاد مرتين لو مريضين ضغطوا في نفس اللحظة بالظبط.
    book_appointment: async ({ doctor_name, appointment_time, patient_phone } = {}) => {
        if (!doctor_name || !appointment_time) return "محتاج اسم الدكتور والميعاد المطلوب عشان أقدر أأكد الحجز.";
        let cleanName = doctor_name.replace(/الدكتورة|الدكتور|دكتورة|دكتور|د\./g, '').trim();
        const doctorRef = db.collection('doctors').doc(cleanName);

        try {
            const result = await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(doctorRef);
                if (!doc.exists) return { status: 'not_found' };

                const doctorData = doc.data();
                let availableTimes = doctorData.appointments || [];
                const timeIndex = findAppointmentIndex(availableTimes, appointment_time);

                if (timeIndex === -1) {
                    return { status: 'unavailable', availableTimes };
                }

                const exactTime = availableTimes[timeIndex];
                availableTimes.splice(timeIndex, 1);
                transaction.update(doctorRef, { appointments: availableTimes });

                const reservationRef = db.collection('reservations').doc();
                transaction.set(reservationRef, {
                    doctor: cleanName,
                    time: exactTime,
                    patient_phone: patient_phone,
                    status: "confirmed",
                    created_at: new Date()
                });

                return { status: 'booked', exactTime };
            });

            if (result.status === 'not_found') return `عذراً، لم نجد طبيب باسم ${cleanName}.`;
            if (result.status === 'unavailable') {
                const displayTimes = result.availableTimes.map(t => formatArabicDate(t));
                return `عذراً، هذا الموعد (${appointment_time}) تم حجزه مسبقاً أو غير متاح. المواعيد المتاحة حالياً هي: ${displayTimes.join('، ')}.`;
            }
            return `تم تأكيد حجز موعد مع دكتور ${cleanName} في موعد (${formatArabicDate(result.exactTime)}) بنجاح وتم حذف الميعاد من قائمة المتاح.`;
        } catch (error) {
            console.error("❌ خطأ أثناء حجز الموعد (transaction):", error);
            return "عذراً، حدث خطأ فني أثناء محاولة الحجز. برجاء المحاولة مرة أخرى.";
        }
    }
};

module.exports = functions;