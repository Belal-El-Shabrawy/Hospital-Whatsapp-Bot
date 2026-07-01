const db = require('../config/firebase');
const levenshtein = require('../utils/levenshtein');
const { MEDICINE_SYNONYMS, ARABIC_MEDICINE_MAP } = require('../data/medicineSynonyms');

// بيدور على الدواء بكل الطرق الممكنة: عربي مباشر -> إنجليزي مطابق -> مرادف علمي -> مطابقة جزئية -> تشابه إملائي (Fuzzy)
async function findMedicineDoc(rawName) {
    const trimmedRaw = rawName.trim();
    const nameClean = trimmedRaw.toLowerCase();

    // 1. مطابقة مباشرة من الخريطة العربية (الأدق والأضمن)
    if (ARABIC_MEDICINE_MAP[trimmedRaw]) {
        const doc = await db.collection('medicines').doc(ARABIC_MEDICINE_MAP[trimmedRaw]).get();
        if (doc.exists) return { docRef: doc.ref, doc };
    }

    // 2. مطابقة مباشرة بالاسم الإنجليزي زي ما هو
    let docRef = db.collection('medicines').doc(nameClean);
    let doc = await docRef.get();
    if (doc.exists) return { docRef, doc };

    // 3. مرادف علمي (زي ibuprofen -> brufen)
    const brandName = MEDICINE_SYNONYMS[nameClean];
    if (brandName) {
        docRef = db.collection('medicines').doc(brandName);
        doc = await docRef.get();
        if (doc.exists) return { docRef, doc };
    }

    // 4. مطابقة جزئية + تشابه إملائي (بيمسك الأخطاء المطبعية القريبة زي cometrix/cometric لـ comtrex)
    const snapshot = await db.collection('medicines').get();
    let bestMatch = null;
    let bestDistance = Infinity;
    for (const d of snapshot.docs) {
        if (d.id.includes(nameClean) || nameClean.includes(d.id)) {
            return { docRef: d.ref, doc: d };
        }
        const dist = levenshtein(nameClean, d.id);
        if (dist < bestDistance) {
            bestDistance = dist;
            bestMatch = d;
        }
    }
    // عتبة التشابه: يسمح بغلطتين-تلاتة إملائية بحد أقصى، وبس لو الاسم مش قصير جداً (عشان منغلطش بين أسماء قصيرة مختلفة)
    if (bestMatch && nameClean.length >= 4 && bestDistance <= 3) {
        return { docRef: bestMatch.ref, doc: bestMatch };
    }

    return { docRef: null, doc: null };
}

module.exports = findMedicineDoc;
