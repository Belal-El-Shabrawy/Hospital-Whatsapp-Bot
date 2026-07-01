// إعداد Groq API — العميل الوحيد المستخدم في المشروع كله (محادثة نصية + رؤية/صور)
require('dotenv').config();
const Groq = require("groq-sdk");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

module.exports = groq;
