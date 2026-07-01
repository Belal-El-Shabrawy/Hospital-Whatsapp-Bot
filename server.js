require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const webhookRoutes = require('./routes/webhook');

const app = express();
app.use(bodyParser.json());
app.use('/', webhookRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server is Working on Port ${PORT} with Smart Sessions & Strict Prompt!`);
});
