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

// محرك إدارة الحوار وتشغيل الدوال (Groq Engine)
async function processMessage(userText, userPhone) {
    if (!sessions[userPhone]) {
        sessions[userPhone] = [
            { role: "system", content: SYSTEM_PROMPT }
        ];
    }

    const chatHistory = sessions[userPhone];

    if (chatHistory.length > 20) {
        const systemInstruction = chatHistory[0];
        const recentHistory = chatHistory.slice(-6);
        sessions[userPhone] = [systemInstruction, ...recentHistory];
    }

    const userMessageWithPhone = `[رقم المريض: ${userPhone}] رسالة المريض: ${userText}`;
    chatHistory.push({ role: "user", content: userMessageWithPhone });

    let response;
    try {
        response = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: chatHistory,
            tools: tools,
            tool_choice: "auto",
            temperature: 0 // بيقلل التخبيط في استخراج الأسماء/الأيام كمعاملات للدوال
        });
    } catch (error) {
        if (error.status === 429) {
            console.warn("⚠️ الموديل الأساسي وصل للحد اليومي، بنجرب موديل بديل أخف...");
            try {
                // llama-3.1-8b-instant له حصة يومية مختلفة عن 70b، فبيفضل شغال لو التوكنز بتاعة الموديل التاني خلصت
                response = await groq.chat.completions.create({
                    model: "llama-3.1-8b-instant",
                    messages: chatHistory,
                    tools: tools,
                    tool_choice: "auto",
                    temperature: 0
                });
            } catch (fallbackError) {
                // لو الموديلين وصلوا للحد، بنرجع رسالة واضحة للمريض بدل ما يفضل مستني رد ومايجيله حاجة
                chatHistory.pop(); // نشيل رسالة المريض اللي مش هتترد عشان منزحمش الذاكرة برسالة من غير رد
                return "عذراً، النظام مشغول جداً حالياً بسبب عدد الرسائل الكبير. من فضلك حاول تاني بعد كذا دقيقة 🙏";
            }
        } else {
            throw error; // أي خطأ تاني (شبكة، إلخ) يفضل يترمي عادي عشان نلاحظه في اللوج
        }
    }

    const responseMessage = response.choices[0].message;
    chatHistory.push(responseMessage);

    if (responseMessage.tool_calls) {
        const replyParts = [];

        for (const toolCall of responseMessage.tool_calls) {
            const functionName = toolCall.function.name;
            // بعض الأحيان الموديل بيبعت الـ arguments كـ "null" (سترينج) لما الدالة مش محتاجة معاملات
            // فبنتأكد إنها Object فاضي مش null قبل ما نحاول نفكها (destructure)
            const parsedArgs = JSON.parse(toolCall.function.arguments || "{}");
            const functionArgs = parsedArgs || {};

            console.log(`🤖 الـ AI يطلب تشغيل الدالة: ${functionName}`, functionArgs);

            const apiResponse = await functions[functionName](functionArgs);

            chatHistory.push({
                tool_call_id: toolCall.id,
                role: "tool",
                name: functionName,
                content: apiResponse
            });

            // بنبني الرد مباشرة من نتيجة الدالة الحقيقية (نص جاهز ومنسق)
            // من غير ما نعتمد على الـ AI يعيد كتابتها تاني (فيه خطر يسهو عن بيانات أو يغيّر تفاصيل)
            let part = apiResponse;
            if (!ACTION_FUNCTIONS.includes(functionName) && INFO_FOLLOWUPS[functionName] && !isNegativeResult(apiResponse)) {
                part += `\n\n${INFO_FOLLOWUPS[functionName]}`;
            }
            replyParts.push(part);
        }

        const finalReply = replyParts.join("\n\n---\n\n");

        // بنحفظ الرد النهائي في ذاكرة المريض
        chatHistory.push({ role: "assistant", content: finalReply });
        return finalReply;
    }

    return responseMessage.content;
}

module.exports = processMessage;
