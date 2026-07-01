require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

// 1. الاستدعاء بالطريقة الحديثة لـ Firebase Admin
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

// الاتصال بـ Firebase
initializeApp({
    credential: cert(serviceAccount)
});
const db = getFirestore();

// 2. إعداد Groq API
const Groq = require("groq-sdk");
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const app = express();
app.use(bodyParser.json());

// ---------------------------------------------------------
// 3. الدوال الفعلية التي ستتحدث مع Firestore
// ---------------------------------------------------------
const functions = {
    check_medicine_stock: async ({ medicine_name_english }) => {
        const nameClean = medicine_name_english.toLowerCase().trim();
        const docRef = db.collection('medicines').doc(nameClean);
        const doc = await docRef.get();

        if (!doc.exists) return "هذا الدواء غير موجود في قاعدة بيانات المستشفى.";
        
        const item = doc.data(); 
        if (item.stock > 0) return `متوفر. الكمية: ${item.stock}، السعر: ${item.price}.`;
        return "الدواء مسجل لكن الكمية الحالية 0 (غير متوفر).";
    },

    get_available_appointments: async ({ doctor_name }) => {
        let cleanName = doctor_name.replace(/الدكتورة|الدكتور|دكتورة|دكتور|د\./g, '').trim();
        const docRef = db.collection('doctors').doc(cleanName);
        const doc = await docRef.get();

        if (!doc.exists) return `لم نجد طبيب باسم ${cleanName}.`;
        
        const data = doc.data();
        return `المواعيد المتاحة للدكتور ${cleanName} هي: ${data.appointments.join('، ')}.`;
    },

    list_all_doctors: async ({ day }) => {
        const snapshot = await db.collection('doctors').get();
        if (snapshot.empty) return "لا يوجد أطباء مسجلين حالياً.";

        let doctorsWithSchedules = day ? `إليك قائمة الأطباء المتاحين يوم ${day}:\n` : "إليك قائمة الأطباء المتواجدين ومواعيدهم:\n";
        let hasAvailableDoctors = false;

        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.appointments && data.appointments.length > 0) {
                if (day) {
                    const dayAppointments = data.appointments.filter(app => app.includes(day));
                    if (dayAppointments.length > 0) {
                        doctorsWithSchedules += `- دكتور ${doc.id}: مواعيده هي (${dayAppointments.join('، ')})\n`;
                        hasAvailableDoctors = true;
                    }
                } else {
                    doctorsWithSchedules += `- دكتور ${doc.id}: مواعيده هي (${data.appointments.join('، ')})\n`;
                    hasAvailableDoctors = true;
                }
            }
        });

        if (!hasAvailableDoctors) {
            return day ? `عذراً، لا يوجد أطباء متاحين يوم ${day}.` : "عذراً، جميع مواعيد الأطباء محجوزة بالكامل في الوقت الحالي.";
        }

        return doctorsWithSchedules;
    },

    book_medicine: async ({ medicine_name_english, quantity }) => {
        const nameClean = medicine_name_english.toLowerCase().trim();
        const docRef = db.collection('medicines').doc(nameClean);
        const doc = await docRef.get();

        if (!doc.exists) return "عذراً، هذا الدواء غير متوفر في المستشفى.";

        const item = doc.data();
        const reqQty = quantity || 1;

        if (item.stock >= reqQty) {
            await docRef.update({ stock: item.stock - reqQty });
            return `تم حجز عدد ${reqQty} من دواء ${nameClean} بنجاح. رصيد المخزن المتبقي: ${item.stock - reqQty}.`;
        } else {
            return `عذراً، الكمية المطلوبة غير متوفرة. المتاح في المخزن حالياً هو ${item.stock} علبة فقط.`;
        }
    },

    book_appointment: async ({ doctor_name, appointment_time, patient_phone }) => {
        let cleanName = doctor_name.replace(/الدكتورة|الدكتور|دكتورة|دكتور|د\./g, '').trim();
        
        const doctorRef = db.collection('doctors').doc(cleanName);
        const doc = await doctorRef.get();

        if (!doc.exists) return `عذراً، لم نجد طبيب باسم ${cleanName}.`;

        const doctorData = doc.data();
        let availableTimes = doctorData.appointments || [];

        const timeIndex = availableTimes.findIndex(t => 
            t.trim() === appointment_time.trim() || 
            appointment_time.includes(t) || 
            t.includes(appointment_time)
        );

        if (timeIndex === -1) {
            return `عذراً، هذا الموعد (${appointment_time}) تم حجزه مسبقاً أو غير متاح. المواعيد المتاحة حالياً هي: ${availableTimes.join('، ')}.`;
        }

        const exactTime = availableTimes[timeIndex];
        availableTimes.splice(timeIndex, 1);
        await doctorRef.update({ appointments: availableTimes });

        const reservation = {
            doctor: cleanName,
            time: exactTime,
            patient_phone: patient_phone,
            status: "confirmed",
            created_at: new Date()
        };
        
        await db.collection('reservations').add(reservation);
        return `تم تأكيد حجز موعد مع دكتور ${cleanName} في موعد (${exactTime}) بنجاح وتم حذف الميعاد من قائمة المتاح.`;
    }
};

// ---------------------------------------------------------
// 4. تعريف الدوال للـ AI (بصيغة Groq/OpenAI)
// ---------------------------------------------------------
const tools = [
    {
        type: "function",
        function: {
            name: "check_medicine_stock",
            description: "تبحث هذه الدالة عن توافر الدواء في مخزن المستشفى. يجب ترجمة اسم الدواء للإنجليزية أولاً.",
            parameters: {
                type: "object",
                properties: {
                    medicine_name_english: { type: "string", description: "اسم الدواء باللغة الإنجليزية (مثال: panadol)" }
                },
                required: ["medicine_name_english"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_available_appointments",
            description: "تستعلم عن المواعيد المتاحة لطبيب معين في المستشفى.",
            parameters: {
                type: "object",
                properties: {
                    doctor_name: { type: "string", description: "اسم الطبيب بالعربية" }
                },
                required: ["doctor_name"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "list_all_doctors",
            description: "تُرجع قائمة بأسماء الأطباء ومواعيدهم. يمكنها إرجاع كل الأطباء، أو تصفية الأطباء حسب يوم معين إذا طلبه المريض.",
            parameters: {
                type: "object",
                properties: {
                    day: { type: "string", description: "اليوم المطلوب الاستعلام عنه (مثال: الخميس، الأحد). اتركه فارغاً إذا كان السؤال عاماً." }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "book_medicine",
            description: "تقوم هذه الدالة بحجز كمية معينة من دواء محدد وخصمها من المخزن. يجب ترجمة اسم الدواء للإنجليزية.",
            parameters: {
                type: "object",
                properties: {
                    medicine_name_english: { type: "string", description: "اسم الدواء بالإنجليزية" },
                    quantity: { type: "number", description: "الكمية المطلوبة للحجز (رقم صحيح)" }
                },
                required: ["medicine_name_english", "quantity"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "book_appointment",
            description: "تقوم هذه الدالة بتسجيل حجز مؤكد للمريض مع الطبيب المتاح. استخدم رقم المريض المرفق في الرسالة.",
            parameters: {
                type: "object",
                properties: {
                    doctor_name: { type: "string", description: "اسم الطبيب بالعربية" },
                    appointment_time: { type: "string", description: "اليوم والميعاد المطلوب" },
                    patient_phone: { type: "string", description: "رقم هاتف المريض المرفق في سياق الرسالة" }
                },
                required: ["doctor_name", "appointment_time", "patient_phone"]
            }
        }
    }
];

// ---------------------------------------------------------
// إعداد الجلسات وشخصية الـ AI (الجزء اللي كان طاير)
// ---------------------------------------------------------
const sessions = {};

const SYSTEM_PROMPT = `أنت مساعد ذكي لمستشفى في مصر. وظيفتك مساعدة المرضى بأسلوب ودود ومختصر باللغة العربية الطبيعية.
        
قواعد الرد الأساسية (يجب الالتزام بها حرفياً):
1. طباعة النتائج (أهم قاعدة): عندما تستخدم أداة (Tool) لجلب بيانات (مثل مواعيد الأطباء)، ممنوع منعاً باتاً أن تسأل المريض عن الخطوة التالية قبل أن تقوم بكتابة وعرض البيانات التي وجدتها للمريض في رسالتك.
2. التنسيق: اعرض البيانات التي وجدتها دائماً في شكل نقاط (Bullet points) واضحة (كل طبيب في سطر).
3. الاستئذان: بعد عرض القائمة التي طلبها المريض بالكامل، قم بسؤاله في نهاية الرسالة: "تحب تحجز مع مين فيهم؟".
4. تأكيد الحجز: لا تقم بتشغيل دالة "book_appointment" إلا بعد أن يختار المريض الطبيب والميعاد، وتنتظر موافقته الصريحة.
5. الأسماء: عند تمرير اسم الطبيب لأي دالة، مرر الاسم الأول فقط (مثال: مرر "سارة" وليس "الدكتورة سارة").`;

// ---------------------------------------------------------
// 5. محرك إدارة الحوار وتشغيل الدوال (Groq Engine)
// ---------------------------------------------------------
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

    const response = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: chatHistory,
        tools: tools,
        tool_choice: "auto"
    });

    const responseMessage = response.choices[0].message;
    chatHistory.push(responseMessage);

    if (responseMessage.tool_calls) {
        for (const toolCall of responseMessage.tool_calls) {
            const functionName = toolCall.function.name;
            const functionArgs = JSON.parse(toolCall.function.arguments);
            
            console.log(`🤖 الـ AI يطلب تشغيل الدالة: ${functionName}`);
            
            const apiResponse = await functions[functionName](functionArgs);
            
            chatHistory.push({
                tool_call_id: toolCall.id,
                role: "tool",
                name: functionName,
                content: apiResponse
            });
        }

        // 🔥 التريكة السحرية (الحقن اللحظي) 🔥
        // بنعمل مصفوفة مؤقتة نبعتها للموديل في الطلب التاني، فيها أمر إجباري في آخر سطر
        const tempMessagesForFinalResponse = [
            ...chatHistory,
            {
                role: "system",
                content: "أمر إجباري: بناءً على البيانات التي استرجعتها للتو، يجب عليك طباعتها نصاً وبشكل مفصل للمريض في رسالتك الآن (استخدم النقاط)، ولا تقم أبداً بتوجيه سؤال له قبل عرض هذه البيانات أمامه."
            }
        ];

        const finalResponse = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: tempMessagesForFinalResponse // بعتنا المصفوفة المؤقتة اللي فيها الأمر
        });

        const finalReply = finalResponse.choices[0].message.content;
        
        // بنحفظ الرد النهائي في الذاكرة الحقيقية للمريض (من غير الأمر المؤقت عشان منزحمش الذاكرة)
        chatHistory.push({ role: "assistant", content: finalReply }); 
        return finalReply;
    }

    return responseMessage.content;
}
// ---------------------------------------------------------
// 6. مسارات السيرفر (Webhooks)
// ---------------------------------------------------------
const VERIFY_TOKEN = "my_super_secret_token_123"; 

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

app.post('/webhook', async (req, res) => {
    let body = req.body;

    if (body.object) {
        if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages && body.entry[0].changes[0].value.messages[0]) {
            let from = body.entry[0].changes[0].value.messages[0].from; 
            let msgBody = body.entry[0].changes[0].value.messages[0].text.body; 

            console.log(`\n📩 رسالة جديدة من ${from}: ${msgBody}`);

            try {
                const aiReply = await processMessage(msgBody, from);
                console.log(`✅ رد الـ AI النهائي: ${aiReply}`);
            } catch (error) {
                console.error("❌ حدث خطأ في معالجة الرسالة:", error);
            }
        }
        res.sendStatus(200); 
    } else {
        res.sendStatus(404);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server is Working on Port ${PORT} with Smart Sessions & Strict Prompt!`);
});