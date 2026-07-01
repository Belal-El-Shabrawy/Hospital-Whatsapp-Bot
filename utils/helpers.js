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

// بيحول تاريخ ISO لصيغة عربية قابلة للعرض للمريض، زي: "الخميس، ٥ يوليو، ٦ م"
function formatArabicDate(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString('ar-EG', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        hour12: true,
        timeZone: 'Africa/Cairo'
    });
}

// 🆕 بيرجع اسم اليوم بالعربي فقط من تاريخ ISO (زي "الخميس")، مستخدم في تصفية المواعيد حسب اليوم
// ده بيحل مشكلة إن المواعيد بقت متسجلة بصيغة ISO مش نص عربي جاهز زي زمان
function getArabicWeekday(isoString) {
    const date = new Date(isoString);
    return date.toLocaleDateString('ar-EG', { weekday: 'long', timeZone: 'Africa/Cairo' });
}

module.exports = { normalizeDay, isNegativeResult, formatArabicDate, getArabicWeekday };
