const DAY_SYNONYMS = require('../data/daySynonyms');

// بيحول اليوم من العامية للاسم الرسمي المسجل في الداتابيز
function normalizeDay(day) {
    if (!day) return day;
    const trimmed = day.trim();
    return DAY_SYNONYMS[trimmed] || trimmed;
}

// بيتحقق هل نتيجة الدالة سلبية (دواء/طبيب غير موجود) عشان منعرضش سؤال حجز على حاجة غير موجودة
function isNegativeResult(text) {
    const negativePatterns = ["غير موجود", "غير متوفر", "لا يوجد", "لم نجد", "لا توجد"];
    return negativePatterns.some(p => text.includes(p));
}

module.exports = { normalizeDay, isNegativeResult };
