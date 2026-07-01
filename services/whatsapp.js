const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

// 1. الدالة القديمة للنصوص
async function sendWhatsAppMessage(toPhone, messageText) {
    const url = `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`;
    await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: "whatsapp", to: toPhone, text: { body: messageText } })
    });
}

// 2. دالة إرسال الأزرار (أقصى حاجة 3 أزرار)
async function sendInteractiveButtons(toPhone, textBody, buttonsArray) {
    const url = `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`;
    
    const formattedButtons = buttonsArray.map(btn => ({
        type: "reply",
        reply: { id: btn.id, title: btn.title }
    }));

    await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messaging_product: "whatsapp",
            to: toPhone,
            type: "interactive",
            interactive: {
                type: "button",
                body: { text: textBody },
                action: { buttons: formattedButtons }
            }
        })
    });
}

// 3. دالة إرسال القوائم (لو الخيارات أكتر من 3)
async function sendInteractiveList(toPhone, textBody, buttonText, sectionsArray) {
    const url = `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`;
    
    await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messaging_product: "whatsapp",
            to: toPhone,
            type: "interactive",
            interactive: {
                type: "list",
                body: { text: textBody },
                action: {
                    button: buttonText,
                    sections: sectionsArray
                }
            }
        })
    });
}

module.exports = { sendWhatsAppMessage, sendInteractiveButtons, sendInteractiveList };