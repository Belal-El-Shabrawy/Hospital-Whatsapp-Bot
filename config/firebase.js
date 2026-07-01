// إعداد الاتصال بـ Firebase Admin (Firestore)
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
let serviceAccount;

if (process.env.FIREBASE_CREDENTIALS) {
    // 1. لو إحنا على سيرفر Render، هيقرأ المفتاح من الـ Environment Variables
    serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
} else {
    // 2. لو إحنا على جهازك (Local)، هيقرأ الملف بتاعك عادي جداً
    serviceAccount = require('../firebase-key.json');
}

initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();

module.exports = db;
