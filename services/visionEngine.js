// محرك الرؤية: بيحلل صور الروشتات الطبية وكارنيهات التأمين المستلمة من المريض على واتساب
// 🔁 كان بيستخدم Gemini (Google Generative AI) — تم استبداله بالكامل بموديلات الرؤية على Groq
const groq = require('../config/groq');

// موديلات الرؤية المتاحة على Groq (بيدعموا صور + JSON mode). بنجرب الأساسي الأول وبعدين البديل لو فشل.
const VISION_MODELS = [
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "qwen/qwen3.6-27b"
];

const VISION_PROMPT = `أنت نظام رؤية ذكي (OCR Engine) مستقر في استقبال مستشفى مصري.
حلل هذه الصورة بدقة شديدة:
الصورة إما أن تكون (روشتة طبية مكتوبة بخط يد طبيب أو مطبوعة) أو (كارنيه تأمين صحي مريض).

1. حدد نوع الصورة أولاً (type).
2. إذا كانت "روشتة": استخرج أسماء الأدوية التجارية أو العلمية المكتوبة بوضوح بالإنجليزية أو العربي في مصفوفة (medicines). صلح أي خطأ إملائي واضح في اسم الدواء ليطابق الاسم التجاري العالمي الصحيح.
3. إذا كانت "كارنيه تأمين": استخرج البيانات التالية: اسم المريض (patient_name)، رقم الكارنيه/التأمين (card_number)، شركة التأمين (company مثل أكسا، ميتلايف، الخ)، وتاريخ الانتهاء إن وجد (expiry).

يجب أن يكون الرد عبارة عن JSON فقط تماماً كالتالي وبدون أي نصوص خارج الجيسون:
لصورة الروشتة:
{
  "type": "prescription",
  "medicines": ["panadol", "congestal", "brufen"]
}

لصورة كارنيه التأمين:
{
  "type": "insurance",
  "patient_name": "اسم المريض هنا",
  "card_number": "123456",
  "company": "AXA",
  "expiry": "2026-12-31"
}`;

function bufferToDataUrl(buffer, mimeType) {
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function callVisionModel(modelName, dataUrl) {
    const completion = await groq.chat.completions.create({
        model: modelName,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
            {
                role: "user",
                content: [
                    { type: "text", text: VISION_PROMPT },
                    { type: "image_url", image_url: { url: dataUrl } }
                ]
            }
        ]
    });

    const responseText = completion.choices[0].message.content;
    return JSON.parse(responseText);
}

async function analyzeHospitalImage(imageBuffer, mimeType = "image/jpeg") {
    const dataUrl = bufferToDataUrl(imageBuffer, mimeType);
    let lastError = null;

    for (const modelName of VISION_MODELS) {
        try {
            console.log(`🖼️ جاري تحليل الصورة باستخدام موديل الرؤية: ${modelName}...`);
            const result = await callVisionModel(modelName, dataUrl);
            console.log(`✅ نجح موديل الرؤية ${modelName} في تحليل الصورة.`);
            return result;
        } catch (error) {
            console.warn(`⚠️ فشل موديل الرؤية ${modelName} (السبب: ${error.status || error.message}). جاري تجربة البديل...`);
            lastError = error;
        }
    }

    console.error("❌ كل موديلات الرؤية فشلت في تحليل الصورة:", lastError);
    return null;
}

module.exports = { analyzeHospitalImage };
