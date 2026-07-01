// إعداد AWS Textract — بيُستخدم كـ "قارئ نص خام" إضافي لدعم Groq في قراءة الخطوط الصعبة
// لو متغيرات AWS مش موجودة في .env، الكلاينت بيتعمل بس مبيتحطش، وبنرجع فشل بأمان (fallback على Groq لوحده)
require('dotenv').config();
const { TextractClient } = require('@aws-sdk/client-textract');

const hasAwsCreds = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

const textractClient = hasAwsCreds
    ? new TextractClient({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
    })
    : null;

module.exports = { textractClient, hasAwsCreds };
