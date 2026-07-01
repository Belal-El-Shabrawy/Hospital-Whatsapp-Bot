const db = require('../config/firebase');
const findMedicineDoc = require('../services/medicineService');
const { normalizeDay } = require('../utils/helpers');

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
        return `المواعيد المتاحة للدكتور ${cleanName} هي: ${data.appointments.join('، ')}.`;
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
                    const dayAppointments = data.appointments.filter(app => app.includes(normalizedDay));
                    if (dayAppointments.length > 0) {
                        doctorsWithSchedules += `- دكتور ${doc.id}: مواعيده هي (${dayAppointments.join('، ')})\n`;
                        hasAvailableDoctors = true;
                    }
                } else {
                    doctorsWithSchedules += `- دكتور ${doc.id}: مواعيده هي (${data.appointments.join('، ')})\n`;
                    hasAvailableDoctors = true;
                }
            }
        });

        if (!hasAvailableDoctors) {
            return normalizedDay ? `عذراً، لا يوجد أطباء متاحين يوم ${normalizedDay}.` : "عذراً، جميع مواعيد الأطباء محجوزة بالكامل في الوقت الحالي.";
        }

        return doctorsWithSchedules;
    },

    book_medicine: async ({ medicine_name, quantity } = {}) => {
        if (!medicine_name) return "عايز اسم الدواء عشان أقدر أحجزه.";
        const { docRef, doc } = await findMedicineDoc(medicine_name);

        if (!doc) return "عذراً، هذا الدواء غير متوفر في المستشفى.";

        const item = doc.data();
        const reqQty = quantity || 1;

        if (item.stock >= reqQty) {
            await docRef.update({ stock: item.stock - reqQty });
            return `تم حجز عدد ${reqQty} من دواء ${doc.id} بنجاح. رصيد المخزن المتبقي: ${item.stock - reqQty}.`;
        } else {
            return `عذراً، الكمية المطلوبة غير متوفرة. المتاح في المخزن حالياً هو ${item.stock} علبة فقط.`;
        }
    },

    book_appointment: async ({ doctor_name, appointment_time, patient_phone } = {}) => {
        if (!doctor_name || !appointment_time) return "محتاج اسم الدكتور والميعاد المطلوب عشان أقدر أأكد الحجز.";
        let cleanName = doctor_name.replace(/الدكتورة|الدكتور|دكتورة|دكتور|د\./g, '').trim();

        const doctorRef = db.collection('doctors').doc(cleanName);
        const doc = await doctorRef.get();

        if (!doc.exists) return `عذراً، لم نجد طبيب باسم ${cleanName}.`;

        const doctorData = doc.data();
        let availableTimes = doctorData.appointments || [];

        const timeIndex = availableTimes.findIndex(t =>
            t.trim() === appointment_time.trim() ||
            appointment_time.includes(t) ||
            t.includes(appointment_time)
        );

        if (timeIndex === -1) {
            return `عذراً، هذا الموعد (${appointment_time}) تم حجزه مسبقاً أو غير متاح. المواعيد المتاحة حالياً هي: ${availableTimes.join('، ')}.`;
        }

        const exactTime = availableTimes[timeIndex];
        availableTimes.splice(timeIndex, 1);
        await doctorRef.update({ appointments: availableTimes });

        const reservation = {
            doctor: cleanName,
            time: exactTime,
            patient_phone: patient_phone,
            status: "confirmed",
            created_at: new Date()
        };

        await db.collection('reservations').add(reservation);
        return `تم تأكيد حجز موعد مع دكتور ${cleanName} في موعد (${exactTime}) بنجاح وتم حذف الميعاد من قائمة المتاح.`;
    }
};

module.exports = functions;
