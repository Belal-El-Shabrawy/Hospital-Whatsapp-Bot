const groq = require('../config/groq');
const tools = require('../tools/toolDefinitions');
const functions = require('../functions/hospitalFunctions');
const SYSTEM_PROMPT = require('../prompts/systemPrompt');
const { isNegativeResult } = require('../utils/helpers');

// إعداد الجلسات (ذاكرة كل مريض على حدة)
const sessions = {};

// الدوال اللي بترجع بيانات (استعلام) وبعد عرضها لازم نسأل المريض سؤال متابعة
const INFO_FOLLOWUPS = {
    list_all_doctors: "تحب تحجز مع مين فيهم؟",
    get_available_appointments: "تحب تحجز الميعاد ده؟",
    check_medicine_stock: "تحب تحجز الدواء ده؟"
};

// الدوال دي بترجع تأكيد نهائي (حجز/خصم) ومفيش داعي لسؤال بعدها
const ACTION_FUNCTIONS = ["book_medicine", "book_appointment"];

// ========================================================
// 🛡️ نظام الطوارئ الذكي (Fallback System)
// أسماء الموديلات لازم تكون مطابقة تماماً لأسماء Groq الرسمية، وإلا هيفشل النداء بـ 400 على طول
// ========================================================
const FALLBACK_MODELS = [
    "meta-llama/llama-4-scout-17b-16e-instruct", // 1. الخيار الأساسي (سريع وبيدعم الصور لو احتجنا)
    "qwen/qwen3.6-27b",                          // 2. البديل الأول (قوي وممتاز في النصوص)
    "llama-3.3-70b-versatile",                   // 3. البديل الثاني (موديل تقيل ومستقر جداً)
    "llama-3.1-8b-instant"                       // 4. خط الدفاع الأخير (خفيف وسريع جداً للطوارئ)
];

// محرك إدارة الحوار وتشغيل الدوال (Groq Engine)
async function processMessage(userText, userPhone) {
    // 1. تهيئة الذاكرة للمريض
    if (!sessions[userPhone]) {
        sessions[userPhone] = [
            { role: "system", content: SYSTEM_PROMPT }
        ];
    }

    const chatHistory = sessions[userPhone];

    // 2. إدارة حجم الذاكرة (Sliding Window) عشان نوفر توكنز
    if (chatHistory.length > 20) {
        const systemInstruction = chatHistory[0];
        const recentHistory = chatHistory.slice(-6);
        sessions[userPhone] = [systemInstruction, ...recentHistory];
    }

    const userMessageWithPhone = `[رقم المريض: ${userPhone}] رسالة المريض: ${userText}`;
    chatHistory.push({ role: "user", content: userMessageWithPhone });

    let response = null;
    let lastError = null;

    // بنلف على الموديلات بالترتيب لحد ما واحد ينجح
    for (const modelName of FALLBACK_MODELS) {
        try {
            console.log(`🚀 جاري محاولة معالجة الرسالة باستخدام الموديل: ${modelName}...`);

            response = await groq.chat.completions.create({
                model: modelName,
                messages: chatHistory,
                tools: tools,
                tool_choice: "auto",
                temperature: 0 // بيقلل التخبيط في استخراج الأسماء/الأيام كمعاملات للدوال
            });

            console.log(`✅ نجح الموديل ${modelName} في الرد!`);
            break; // كسر اللوب (مفيش داعي نجرب الباقي)

        } catch (error) {
            console.warn(`⚠️ فشل الموديل ${modelName} (السبب: ${error.status || error.message}). جاري تجربة البديل...`);
            lastError = error;
        }
    }

    // لو كل الموديلات فشلت تماماً
    if (!response) {
        console.error("❌ كل الموديلات المتاحة فشلت في الرد:", lastError);
        chatHistory.pop(); // نشيل رسالة المريض اللي مش هتترد عشان منزحمش الذاكرة
        return "عذراً، النظام مشغول جداً حالياً بسبب عدد الرسائل الكبير. من فضلك حاول تاني بعد كذا دقيقة 🙏";
    }

    const responseMessage = response.choices[0].message;
    chatHistory.push(responseMessage);

    // 3. معالجة تشغيل الدوال (Tool Calls)
    if (responseMessage.tool_calls) {
        const replyParts = [];

        for (const toolCall of responseMessage.tool_calls) {
            const functionName = toolCall.function.name;

            // التأكد إن المعاملات سليمة ومش Null
            const parsedArgs = JSON.parse(toolCall.function.arguments || "{}");
            const functionArgs = parsedArgs || {};

            console.log(`🤖 الـ AI يطلب تشغيل الدالة: ${functionName}`, functionArgs);

            const targetFunction = functions[functionName];
            const apiResponse = targetFunction
                ? await targetFunction(functionArgs)
                : "عذراً، حدث خطأ داخلي (دالة غير معروفة).";

            chatHistory.push({
                tool_call_id: toolCall.id,
                role: "tool",
                name: functionName,
                content: apiResponse
            });

            // بناء الرد مباشرة للمستخدم
            let part = apiResponse;
            if (!ACTION_FUNCTIONS.includes(functionName) && INFO_FOLLOWUPS[functionName] && !isNegativeResult(apiResponse)) {
                part += `\n\n${INFO_FOLLOWUPS[functionName]}`;
            }
            replyParts.push(part);
        }

        const finalReply = replyParts.join("\n\n---\n\n");

        // حفظ الرد النهائي في ذاكرة المريض
        chatHistory.push({ role: "assistant", content: finalReply });
        return finalReply;
    }

    return responseMessage.content;
}

module.exports = processMessage;
