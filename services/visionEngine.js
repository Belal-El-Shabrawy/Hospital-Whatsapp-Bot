// محرك الرؤية: بيحلل صور الروشتات الطبية وكارنيهات التأمين المستلمة من المريض على واتساب
// 🔁 كان بيستخدم Gemini (Google Generative AI) — تم استبداله بالكامل بموديلات الرؤية على Groq
// 🆕 تمت إضافة AWS Textract كـ "قارئ نص خام" اختياري: بيشتغل قبل Groq ويدّيله النص المستخرج كمرجع إضافي
// عشان يمسك خطوط الأطباء الصعبة اللي موديل الرؤية لوحده ممكن يترددد فيها. لو Textract مش متاح أو فشل، الفلو بيكمل عادي بـ Groq لوحده.
const groq = require('../config/groq');
const { textractClient, hasAwsCreds } = require('../config/textract');
const { DetectDocumentTextCommand } = require('@aws-sdk/client-textract');

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

// 🆕 بيبعت الصورة لـ AWS Textract (DetectDocumentText) ويرجّع النص الخام كل سطر لوحده.
// Textract محرك OCR متخصص بيمسك حروف/كلمات فردية بدقة عالية حتى لو الخط صعب جداً،
// حتى لو مفهمش المعنى الطبي للكلمة (ده شغل Groq بعد كده). بيرجع null بأمان لو مش متاح أو فشل.
async function extractRawTextWithTextract(imageBuffer) {
    if (!hasAwsCreds || !textractClient) {
        console.log("ℹ️ Textract غير مُفعّل (لا يوجد AWS credentials في .env) — هيتم استخدام Groq لوحده.");
        return null;
    }

    try {
        console.log("🔎 جاري استخراج النص الخام من الصورة عبر AWS Textract...");
        const command = new DetectDocumentTextCommand({
            Document: { Bytes: imageBuffer }
        });
        const response = await textractClient.send(command);

        const lines = (response.Blocks || [])
            .filter(block => block.BlockType === 'LINE' && block.Text)
            .map(block => block.Text);

        if (lines.length === 0) {
            console.log("ℹ️ Textract لم يجد أي نص واضح في الصورة.");
            return null;
        }

        console.log(`✅ Textract استخرج ${lines.length} سطر نص خام.`);
        return lines.join('\n');
    } catch (error) {
        console.warn(`⚠️ فشل AWS Textract (السبب: ${error.name || error.message}). هيتم الاعتماد على Groq لوحده.`);
        return null;
    }
}

function buildPrompt(textractText) {
    if (!textractText) return VISION_PROMPT;

    return `${VISION_PROMPT}

📄 ملاحظة إضافية: محرك OCR متخصص (AWS Textract) قرأ النص الخام التالي من نفس الصورة. الخط ممكن يكون صعب جداً وده بيساعدك تتأكد من الحروف/الأرقام اللي ممكن تكون غير واضحة بالعين في الصورة، خصوصاً أسماء الأدوية والجرعات.
استخدمه فقط كمرجع مساعد لحل الغموض — لسه لازم ترجع للصورة نفسها عشان تفهم السياق والتخطيط (مين اسم الدواء، مين الجرعة)، لأن Textract بيقرأ النص من غير ما يفهم معناه وممكن يقرأ كلمة غلط أو يخلط الترتيب.

--- النص الخام من Textract ---
${textractText}
--- نهاية النص الخام ---`;
}

async function callVisionModel(modelName, dataUrl, promptText) {
    const completion = await groq.chat.completions.create({
        model: modelName,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
            {
                role: "user",
                content: [
                    { type: "text", text: promptText },
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

    // 1. نجرب الأول ناخد نص خام من Textract (بالتوازي مش لازم، بس أبسط وأوضح كخطوة منفصلة قبل Groq)
    const textractText = await extractRawTextWithTextract(imageBuffer);
    const promptText = buildPrompt(textractText);

    // 2. بعدين نبعت الصورة + البرومبت (المدعوم بنص Textract لو موجود) لموديلات الرؤية على Groq
    let lastError = null;
    for (const modelName of VISION_MODELS) {
        try {
            console.log(`🖼️ جاري تحليل الصورة باستخدام موديل الرؤية: ${modelName}${textractText ? " (مدعوم بنص Textract)" : ""}...`);
            const result = await callVisionModel(modelName, dataUrl, promptText);
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
