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
    "أحمد": { specialty: "عيون", appointments: ["الأحد 6 مساءً", "الثلاثاء 8 مساءً"] },
    "عمر": { specialty: "باطنة", appointments: ["الإثنين 4 عصراً", "الأربعاء 1 ظهراً"] },
    "سارة": { specialty: "أنف وأذن", appointments: ["الخميس 10 صباحاً", "السبت 2 ظهراً"] },
    "محمود": { specialty: "عظام", appointments: ["الأحد 12 ظهراً", "الثلاثاء 4 عصراً", "الخميس 8 مساءً"] },
    "منى": { specialty: "أطفال", appointments: ["الإثنين 9 صباحاً", "الأربعاء 11 صباحاً"] },
    "خالد": { specialty: "أسنان", appointments: ["الجمعة 5 مساءً", "السبت 8 مساءً"] },
    "ياسر": { specialty: "عيون", appointments: ["الأحد 2 ظهراً", "الثلاثاء 6 مساءً"] },
    "نورهان": { specialty: "جلدية", appointments: ["الإثنين 5 مساءً", "الأربعاء 7 مساءً"] },
    "طارق": { specialty: "باطنة", appointments: ["الخميس 1 ظهراً", "السبت 4 عصراً"] },
    "علي": { specialty: "أنف وأذن", appointments: ["الأحد 9 صباحاً", "الأربعاء 9 صباحاً"] }
};
module.exports = { MEDICINE_DATABASE, DOCTOR_DATABASE };
