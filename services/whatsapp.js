const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

async function sendWhatsAppMessage(toPhone, messageText) {
    const url = `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ messaging_product: "whatsapp", to: toPhone, text: { body: messageText } })
        });
        const data = await response.json();
        if (!response.ok) console.error("❌ خطأ من ميتا (نص):", JSON.stringify(data, null, 2));
        else console.log("✅ تم إرسال النص بنجاح!");
    } catch (error) { console.error("❌ خطأ داخلي:", error); }
}

async function sendInteractiveButtons(toPhone, textBody, buttonsArray) {
    const url = `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`;
    const formattedButtons = buttonsArray.map(btn => ({
        type: "reply",
        reply: { id: btn.id, title: btn.title }
    }));
    
    try {
        const response = await fetch(url, {
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
        const data = await response.json();
        if (!response.ok) console.error("❌ خطأ من ميتا (أزرار):", JSON.stringify(data, null, 2));
        else console.log("✅ تم إرسال الأزرار بنجاح!");
    } catch (error) { console.error("❌ خطأ داخلي:", error); }
}

async function sendInteractiveList(toPhone, textBody, buttonText, sectionsArray) {
    const url = `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                to: toPhone,
                type: "interactive",
                interactive: {
                    type: "list",
                    body: { text: textBody },
                    action: { button: buttonText, sections: sectionsArray }
                }
            })
        });
        const data = await response.json();
        if (!response.ok) console.error("❌ خطأ من ميتا (قائمة):", JSON.stringify(data, null, 2));
        else console.log("✅ تم إرسال القائمة بنجاح!");
    } catch (error) { console.error("❌ خطأ داخلي:", error); }
}

module.exports = { sendWhatsAppMessage, sendInteractiveButtons, sendInteractiveList };