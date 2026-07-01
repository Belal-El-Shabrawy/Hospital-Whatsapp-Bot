// تعريف الدوال للـ AI (بصيغة Groq/OpenAI)
// ملاحظة: أداة "analyze_image" اللي كانت هنا قبل كده تمت إزالتها — الصور بيتم تحليلها مباشرة في routes/webhook.js
// عبر visionEngine.js، ومفيش تنفيذ فعلي لها في functions/hospitalFunctions.js، فكانت ستتسبب في كراش لو الـ AI حاول يناديها.
const tools = [
    {
        type: "function",
        function: {
            name: "check_medicine_stock",
            description: "تبحث هذه الدالة عن توافر الدواء في مخزن المستشفى. مرر اسم الدواء زي ما قاله المريض بالضبط (عربي أو إنجليزي، مفيش داعي تترجمه أو تخمن تهجيته).",
            parameters: {
                type: "object",
                properties: {
                    medicine_name: { type: "string", description: "اسم الدواء زي ما ذكره المريض حرفياً (عربي أو إنجليزي)" }
                },
                required: ["medicine_name"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_available_appointments",
            description: "تستعلم عن المواعيد المتاحة لطبيب معين بالاسم. استخدمها فقط لما المريض يحدد اسم طبيب بذاته. لو السؤال عن يوم معين لكل الأطباء (مثال: مين متاح يوم الخميس)، استخدم list_all_doctors بمعامل day بدل ما تنادي هذه الدالة لكل طبيب على حدة.",
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
            description: "تُرجع قائمة بأسماء الأطباء ومواعيدهم. استخدمها دائماً (باستخدام معامل day) لأي سؤال عن الأطباء المتاحين في يوم معين — نداء واحد لهذه الدالة يكفي ويغطي كل الأطباء، ومفيش داعي لمناداة get_available_appointments لكل طبيب على حدة.",
            parameters: {
                type: "object",
                properties: {
                    day: { type: "string", description: "اليوم المطلوب الاستعلام عنه زي ما قاله المريض بالضبط (مثال: الخميس، الحد، التلات). اتركه فارغاً إذا كان السؤال عاماً." }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "book_medicine",
            description: "تقوم هذه الدالة بحجز كمية معينة من دواء محدد وخصمها من المخزن. مرر اسم الدواء زي ما قاله المريض بالضبط (عربي أو إنجليزي).",
            parameters: {
                type: "object",
                properties: {
                    medicine_name: { type: "string", description: "اسم الدواء زي ما ذكره المريض حرفياً (عربي أو إنجليزي)" },
                    quantity: { type: "number", description: "الكمية المطلوبة للحجز (رقم صحيح)" }
                },
                required: ["medicine_name", "quantity"]
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

module.exports = tools;
