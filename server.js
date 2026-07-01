require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(bodyParser.json());

// ---------------------------------------------------------
// 1. إعداد Gemini API وقاعدة البيانات الوهمية
// ---------------------------------------------------------
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const MEDICINE_DATABASE = {
    "panadol": { stock: 15, price: "50 EGP" },
    "congestal": { stock: 0, price: "30 EGP" },
    "brufen": { stock: 8, price: "45 EGP" }
};

const DOCTOR_DATABASE = {
    "أحمد": ["الأحد 6 مساءً", "الثلاثاء 8 مساءً"],
    "عمر": ["الإثنين 4 عصراً", "الأربعاء 1 ظهراً"]
};

// ---------------------------------------------------------
// 2. الدوال الفعلية التي سينفذها السيرفر (Functions)
// ---------------------------------------------------------
const functions = {
    check_medicine_stock: ({ medicine_name_english }) => {
        const nameClean = medicine_name_english.toLowerCase().trim();
        if (MEDICINE_DATABASE[nameClean]) {
            const item = MEDICINE_DATABASE[nameClean];
            if (item.stock > 0) {
                return `متوفر. الكمية: ${item.stock}، السعر: ${item.price}.`;
            }
            return "الدواء مسجل لكن الكمية الحالية 0 (غير متوفر).";
        }
        return "هذا الدواء غير موجود في قاعدة بيانات المستشفى.";
    },
    get_available_appointments: ({ doctor_name }) => {
        for (const [doc, times] of Object.entries(DOCTOR_DATABASE)) {
            if (doctor_name.includes(doc)) {
                return `المواعيد المتاحة للدكتور ${doc} هي: ${times.join(', ')}.`;
            }
        }
        return `لم نجد طبيب باسم ${doctor_name}.`;
    },
    list_all_doctors: () => {
        const doctorNames = Object.keys(DOCTOR_DATABASE);
        if (doctorNames.length === 0) return "لا يوجد أطباء مسجلين حالياً.";
        return `الأطباء المتواجدون في المستشفى هم: دكتور ${doctorNames.join('، ودكتور ')}.`;
    }
};

// ---------------------------------------------------------
// 3. تعريف الدوال للـ AI (Tool Declarations)
// ---------------------------------------------------------
const tools = [{
    functionDeclarations: [
        {
            name: "check_medicine_stock",
            description: "تبحث هذه الدالة عن توافر الدواء في مخزن المستشفى. يجب ترجمة اسم الدواء للإنجليزية أولاً قبل تمريره.",
            parameters: {
                type: "OBJECT",
                properties: {
                    medicine_name_english: {
                        type: "STRING",
                        description: "اسم الدواء باللغة الإنجليزية (مثال: panadol)"
                    }
                },
                required: ["medicine_name_english"]
            }
        },
        {
            name: "get_available_appointments",
            description: "تستعلم عن المواعيد المتاحة لطبيب معين في المستشفى باستخدام اسمه العربي.",
            parameters: {
                type: "OBJECT",
                properties: {
                    doctor_name: {
                        type: "STRING",
                        description: "اسم الطبيب بالعربية"
                    }
                },
                required: ["doctor_name"]
            }
        },
        {
            name: "list_all_doctors",
            description: "تقوم هذه الدالة بإرجاع قائمة بأسماء جميع الأطباء المتواجدين في المستشفى. استخدمها عندما يسأل المريض عن الأطباء المتاحين بشكل عام دون تحديد اسم طبيب معين."
            // مفيش parameters هنا لأننا مش محتاجين المريض يدخل حاجة
        }
    ]
}];

// تهيئة الموديل مع تعليمات النظام والأدوات
const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash", // 👈 التعديل هنا للموديل الأحدث المدعوم
    tools: tools,
    systemInstruction: "أنت مساعد ذكي لمستشفى. وظيفتك مساعدة المرضى في الاستعلام عن الأدوية والمواعيد. استخدم الأدوات المتاحة للبحث في الداتا بيز أولاً. كن ودوداً ومختصراً."
});
// إنشاء جلسة محادثة (في التطبيق الحقيقي، يفضل إنشاء جلسة لكل رقم هاتف)
const chatSession = model.startChat();

// ---------------------------------------------------------
// 4. الدالة السحرية لإدارة الحوار وتشغيل الدوال (The Engine)
// ---------------------------------------------------------
async function processMessage(userText) {
    // إرسال رسالة العميل للـ AI
    let result = await chatSession.sendMessage(userText);
    
    // هل طلب الـ AI تشغيل دالة معينة؟
    const functionCall = result.response.functionCalls()?.[0];
    
    if (functionCall) {
        console.log(`🤖 الـ AI يطلب تشغيل الدالة: ${functionCall.name} بالبيانات:`, functionCall.args);
        
        // تنفيذ الدالة المطلوبة من الكود بتاعنا
        const apiResponse = functions[functionCall.name](functionCall.args);
        
        // إرسال النتيجة مرة أخرى للـ AI ليصيغ الرد النهائي
        result = await chatSession.sendMessage([{
            functionResponse: {
                name: functionCall.name,
                response: { result: apiResponse }
            }
        }]);
    }
    
    return result.response.text();
}

async function withRetry(retries, delay, fn) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === retries - 1) throw error;
            
            console.log(`\n⚠️ سيرفر الـ AI مشغول. جاري المحاولة مرة أخرى بعد ${delay / 1000} ثانية... (محاولة ${i + 1} من ${retries - 1})`);
            
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// ---------------------------------------------------------
// 5. مسارات السيرفر (Webhooks)
// ---------------------------------------------------------
const VERIFY_TOKEN = "my_super_secret_token_123"; 

// مسار التأكيد الخاص بـ WhatsApp
app.get('/webhook', (req, res) => {
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];

    if (mode && token && mode === 'subscribe' && token === VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// مسار استقبال رسائل WhatsApp
app.post('/webhook', async (req, res) => {
    let body = req.body;

    if (body.object) {
        if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages && body.entry[0].changes[0].value.messages[0]) {
            
            let from = body.entry[0].changes[0].value.messages[0].from; 
            let msgBody = body.entry[0].changes[0].value.messages[0].text.body; 

            console.log(`\n📩 رسالة جديدة من ${from}: ${msgBody}`);

            try {
                const aiReply = await withRetry(3, 2000, async () => {
                    return await processMessage(msgBody);
                });
                
                console.log(`✅ رد الـ AI النهائي: ${aiReply}`);

            } catch (error) {
                console.error("❌ فشل في معالجة الرسالة بعد عدة محاولات:", error.message);
            }
        }
        // الرد على واتساب بسرعة لتأكيد الاستلام
        res.sendStatus(200); 
    } else {
        res.sendStatus(404);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server is Working on Port ${PORT}`);
});