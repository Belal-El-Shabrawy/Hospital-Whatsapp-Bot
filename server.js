require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const webhookRoutes = require('./routes/webhook');

const app = express();

// 🆕 لازم نحتفظ بالـ raw body (البايتات الخام قبل الـ JSON parsing) عشان نقدر نتحقق من توقيع واتساب
// (X-Hub-Signature-256) في routes/webhook.js. لو اتشال الـ verify ده، مفيش طريقة نتأكد إن الطلب فعلاً جاي من ميتا.
app.use(bodyParser.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));

app.use('/', webhookRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server is Working on Port ${PORT} with Smart Sessions & Strict Prompt!`);
});