// الاستدعاء بالطريقة الحديثة لـ Firebase Admin
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

// الاتصال بـ Firebase
initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

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
    "أحمد": ["الأحد 6 مساءً", "الثلاثاء 8 مساءً"],
    "عمر": ["الإثنين 4 عصراً", "الأربعاء 1 ظهراً"],
    "سارة": ["الخميس 10 صباحاً", "السبت 2 ظهراً"],
    "محمود": ["الأحد 12 ظهراً", "الثلاثاء 4 عصراً", "الخميس 8 مساءً"],
    "منى": ["الإثنين 9 صباحاً", "الأربعاء 11 صباحاً"],
    "خالد": ["الجمعة 5 مساءً", "السبت 8 مساءً"],
    "ياسر": ["الأحد 2 ظهراً", "الثلاثاء 6 مساءً"],
    "نورهان": ["الإثنين 5 مساءً", "الأربعاء 7 مساءً"],
    "طارق": ["الخميس 1 ظهراً", "السبت 4 عصراً"],
    "علي": ["الأحد 9 صباحاً", "الأربعاء 9 صباحاً"]
};

// دالة الرفع
async function uploadData() {
    console.log("⏳ جاري رفع البيانات إلى Firestore...");

    try {
        // 1. رفع الأدوية
        for (const [name, data] of Object.entries(MEDICINE_DATABASE)) {
            await db.collection('medicines').doc(name).set(data);
            console.log(`✅ تم رفع دواء: ${name}`);
        }

        console.log("-----------------------------------");

        // 2. رفع الدكاترة
        for (const [name, times] of Object.entries(DOCTOR_DATABASE)) {
            await db.collection('doctors').doc(name).set({ appointments: times });
            console.log(`✅ تم رفع بيانات دكتور: ${name}`);
        }

        console.log("\n🎉 تم رفع كل البيانات بنجاح!");
        process.exit(0); 
        
    } catch (error) {
        console.error("❌ حصل خطأ أثناء الرفع:", error);
    }
}

// تشغيل الدالة
uploadData();