require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

// 1. الاستدعاء بالطريقة الحديثة لـ Firebase Admin
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
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
// خريطة مرادفات: الاسم العلمي (اللي الـ AI بيترجم له) -> الاسم التجاري (اللي متسجل في الداتابيز)
const MEDICINE_SYNONYMS = {
    ibuprofen: "brufen",
    paracetamol: "panadol",
    acetaminophen: "panadol",
    amoxicillin: "augmentin",
    diclofenac: "voltaren",
    esomeprazole: "nexium",
    pantoprazole: "controloc",
    loratadine: "claritine",
    xylometazoline: "otrivin",
    loperamide: "antinal",
    nifuroxazide: "antinal"
};

// بيدور على الدواء بأكتر من طريقة: الاسم زي ما هو، ثم مرادفه التجاري، ثم مطابقة جزئية في الداتابيز كله
async function findMedicineDoc(nameClean) {
    let docRef = db.collection('medicines').doc(nameClean);
    let doc = await docRef.get();
    if (doc.exists) return { docRef, doc };

    const brandName = MEDICINE_SYNONYMS[nameClean];
    if (brandName) {
        docRef = db.collection('medicines').doc(brandName);
        doc = await docRef.get();
        if (doc.exists) return { docRef, doc };
    }

    // مطابقة جزئية احتياطية: لو الاسم اللي بعته الـ AI جزء من اسم دواء مسجل أو العكس
    const snapshot = await db.collection('medicines').get();
    for (const d of snapshot.docs) {
        if (d.id.includes(nameClean) || nameClean.includes(d.id)) {
            return { docRef: d.ref, doc: d };
        }
    }

    return { docRef: null, doc: null };
}

const functions = {
    check_medicine_stock: async ({ medicine_name_english } = {}) => {
        if (!medicine_name_english) return "عايز اسم الدواء بالإنجليزية عشان أقدر أبحث عنه.";
        const nameClean = medicine_name_english.toLowerCase().trim();
        const { doc } = await findMedicineDoc(nameClean);

        if (!doc) return "هذا الدواء غير موجود في قاعدة بيانات المستشفى.";

        const item = doc.data();
        if (item.stock > 0) return `متوفر. الكمية: ${item.stock}، السعر: ${item.price}.`;
        return "الدواء مسجل لكن الكمية الحالية 0 (غير متوفر).";
    },

    get_available_appointments: async ({ doctor_name } = {}) => {
        if (!doctor_name) return "عايز اسم الدكتور اللي محتاج تعرف مواعيده.";
        let cleanName = doctor_name.replace(/الدكتورة|الدكتور|دكتورة|دكتور|د\./g, '').trim();
        const docRef = db.collection('doctors').doc(cleanName);
        const doc = await docRef.get();

        if (!doc.exists) return `لم نجد طبيب باسم ${cleanName}.`;
        
        const data = doc.data();
        return `المواعيد المتاحة للدكتور ${cleanName} هي: ${data.appointments.join('، ')}.`;
    },

    list_all_doctors: async ({ day } = {}) => {
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

    book_medicine: async ({ medicine_name_english, quantity } = {}) => {
        if (!medicine_name_english) return "عايز اسم الدواء بالإنجليزية عشان أقدر أحجزه.";
        const nameClean = medicine_name_english.toLowerCase().trim();
        const { docRef, doc } = await findMedicineDoc(nameClean);

        if (!doc) return "عذراً، هذا الدواء غير متوفر في المستشفى.";

        const item = doc.data();
        const reqQty = quantity || 1;

        if (item.stock >= reqQty) {
            await docRef.update({ stock: item.stock - reqQty });
            return `تم حجز عدد ${reqQty} من دواء ${doc.id} بنجاح. رصيد المخزن المتبقي: ${item.stock - reqQty}.`;
        } else {
            return `عذراً، الكمية المطلوبة غير متوفرة. المتاح في المخزن حالياً هو ${item.stock} علبة فقط.`;
        }
    },

    book_appointment: async ({ doctor_name, appointment_time, patient_phone } = {}) => {
        if (!doctor_name || !appointment_time) return "محتاج اسم الدكتور والميعاد المطلوب عشان أقدر أأكد الحجز.";
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

    // الدوال اللي بترجع بيانات (استعلام) وبعد عرضها لازم نسأل المريض سؤال متابعة
    const INFO_FOLLOWUPS = {
        list_all_doctors: "تحب تحجز مع مين فيهم؟",
        get_available_appointments: "تحب تحجز الميعاد ده؟",
        check_medicine_stock: "تحب تحجز الدواء ده؟"
    };
    // الدوال دي بترجع تأكيد نهائي (حجز/خصم) ومفيش داعي لسؤال بعدها
    const ACTION_FUNCTIONS = ["book_medicine", "book_appointment"];

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
            if (!ACTION_FUNCTIONS.includes(functionName) && INFO_FOLLOWUPS[functionName]) {
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
// ---------------------------------------------------------
// 6. مسارات السيرفر (Webhooks)
// ---------------------------------------------------------
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "my_super_secret_token_123";

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

async function sendWhatsAppMessage(toPhone, messageText) {
    const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
    const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

    const url = `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                to: toPhone,
                text: { body: messageText }
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error("\n❌ ميتا رفضت إرسال الرسالة، والسبب:", JSON.stringify(data, null, 2));
        } else {
            console.log("✅ تم إرسال الرسالة للواتساب بنجاح!");
        }

    } catch (error) {
        console.error("❌ خطأ داخلي في السيرفر أثناء الإرسال:", error.message);
    }
}

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
                
                await sendWhatsAppMessage(from, aiReply);
                
            } catch (error) {
                console.error("❌ حدث خطأ في معالجة الرسالة:", error);
                // مهم: نرد على المريض برسالة حتى لو حصل خطأ غير متوقع، بدل ما ينسحب بدون رد
                await sendWhatsAppMessage(from, "عذراً، حصل خطأ مؤقت من عندنا. حاول تبعت رسالتك تاني بعد قليل 🙏");
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