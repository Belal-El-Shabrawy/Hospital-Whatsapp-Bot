// 💊 داتا الأدوية الموسعة
const MEDICINE_DATABASE = {
    "panadol": { stock: 15, price: "50 EGP" },
    "congestal": { stock: 0, price: "30 EGP" },
    "brufen": { stock: 8, price: "45 EGP" },
    "augmentin": { stock: 20, price: "90 EGP" },
    "cataflam": { stock: 50, price: "40 EGP" },
    "comtrex": { stock: 12, price: "35 EGP" },
    "otrivin": { stock: 30, price: "25 EGP" },
    "concor": { stock: 5, price: "60 EGP" },
    "controloc": { stock: 18, price: "85 EGP" },
    "alphintern": { stock: 25, price: "45 EGP" },
    "antinal": { stock: 0, price: "20 EGP" },
    "nexium": { stock: 10, price: "120 EGP" },
    "ketofan": { stock: 40, price: "15 EGP" },
    "claritine": { stock: 7, price: "55 EGP" },
    "voltaren": { stock: 22, price: "30 EGP" }
};

// 👨‍⚕️👩‍⚕️ داتا الأطباء الموسعة
const DOCTOR_DATABASE = {
    // التواريخ مكتوبة بصيغة: YYYY-MM-DDTHH:mm:ss
    "أحمد": { specialty: "عيون", appointments: ["2026-07-05T18:00:00", "2026-07-07T20:00:00"] }, 
    "عمر": { specialty: "باطنة", appointments: ["2026-07-06T16:00:00", "2026-07-08T13:00:00"] },
    "سارة": { specialty: "أنف وأذن", appointments: ["2026-07-02T10:00:00", "2026-07-04T14:00:00"] },
    "محمود": { specialty: "عظام", appointments: ["2026-07-05T12:00:00", "2026-07-07T16:00:00", "2026-07-09T20:00:00"] },
    "منى": { specialty: "أطفال", appointments: ["2026-07-06T09:00:00", "2026-07-08T11:00:00"] },
    "خالد": { specialty: "أسنان", appointments: ["2026-07-03T17:00:00", "2026-07-04T20:00:00"] },
    "ياسر": { specialty: "عيون", appointments: ["2026-07-05T14:00:00", "2026-07-07T18:00:00"] },
    "نورهان": { specialty: "جلدية", appointments: ["2026-07-06T17:00:00", "2026-07-08T19:00:00"] },
    "طارق": { specialty: "باطنة", appointments: ["2026-07-02T13:00:00", "2026-07-04T16:00:00"] },
    "علي": { specialty: "أنف وأذن", appointments: ["2026-07-05T09:00:00", "2026-07-08T09:00:00"] }
};

// ... (نفس داتا الأدوية زي ما هي)
module.exports = { MEDICINE_DATABASE, DOCTOR_DATABASE };
