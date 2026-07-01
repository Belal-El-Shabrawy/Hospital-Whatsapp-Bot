const { GoogleGenerativeAI } = require('@google/generative-ai');

// التأكد من وجود المفتاح
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// دالة مساعدة لتحويل الـ Buffer لصيغة يفهمها Gemini
function bufferToGenerativePart(buffer, mimeType) {
    return {
        inlineData: {
            data: buffer.toString("base64"),
            mimeType: mimeType
        },
    };
}

async function analyzeHospitalImage(imageBuffer, mimeType = "image/jpeg") {
    try {
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            generationConfig: { responseMimeType: "application/json" } // إجبار الموديل يرجع JSON
        });

        const imagePart = bufferToGenerativePart(imageBuffer, mimeType);

        const prompt = `
        أنت نظام رؤية ذكي (OCR Engine) مستقر في استقبال مستشفى مصري.
        حلل هذه الصورة بدقة شديدة:
        الصورة إما أن تكون (روشتة طبية مكتوبة بخط يد طبيب أو مطبوعة) أو (كارنيه تأمين صحي مريض).

        1. حدد نوع الصورة أولاً (type).
        2. إذا كانت "روشتة": استخرج أسماء الأدوية التجارية أو العلمية المكتوبة بوضوح بالإنجليزية أو العربي في مصفوفة (medicines). صلح أي خطأ إملائي واضح في اسم الدواء ليطابق الاسم التجاري العالمي الصحيح.
        3. إذا كانت "كارنيه تأمين": استخرج البيانات التالية: اسم المريض (patient_name)، رقم الكارنيه/التأمين (card_number)، شركة التأمين (company مثل أكسا، ميتلايف، الخ)، وتاريخ الانتهاء إن وجد (expiry).

        يجب أن يكون الرد عبارة عن JSON Schema تماماً كالتالي وبدون أي نصوص خارج الجيسون:
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
        }
        `;

        const result = await model.generateContent([prompt, imagePart]);
        const responseText = result.response.text();
        
        // تحويل النص المستلم لـ Object جاهز للاستخدام
        return JSON.parse(responseText);

    } catch (error) {
        console.error("❌ خطأ في محرك الرؤية Gemini Vision:", error);
        return null;
    }
}

module.exports = { analyzeHospitalImage };