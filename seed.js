const db = require('./config/firebase');
const { MEDICINE_DATABASE, DOCTOR_DATABASE } = require('./data/seedData');

async function uploadData() {
    console.log("⏳ جاري رفع البيانات إلى Firestore...");

    try {
        for (const [name, data] of Object.entries(MEDICINE_DATABASE)) {
            await db.collection('medicines').doc(name).set(data);
            console.log(`✅ تم رفع دواء: ${name}`);
        }

        console.log("-----------------------------------");

        for (const [name, data] of Object.entries(DOCTOR_DATABASE)) {
            await db.collection('doctors').doc(name).set(data);
            console.log(`✅ تم رفع بيانات دكتور: ${name} (تخصص ${data.specialty})`);
        }

        console.log("\n🎉 تم رفع كل البيانات بنجاح!");
        process.exit(0);

    } catch (error) {
        console.error("❌ حصل خطأ أثناء الرفع:", error);
    }
}

uploadData();
