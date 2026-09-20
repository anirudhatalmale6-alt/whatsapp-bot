const https = require('https');

const API_VERSION = 'v21.0';

function sendMessage(to, text) {
  return callApi(`/${process.env.WA_PHONE_NUMBER_ID}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text }
  });
}

function sendInteractiveButtons(to, bodyText, buttons) {
  return callApi(`/${process.env.WA_PHONE_NUMBER_ID}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.map((b, i) => ({
          type: 'reply',
          reply: { id: b.id || `btn_${i}`, title: b.title.substring(0, 20) }
        }))
      }
    }
  });
}

function sendInteractiveList(to, bodyText, buttonText, sections) {
  return callApi(`/${process.env.WA_PHONE_NUMBER_ID}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText },
      action: {
        button: buttonText.substring(0, 20),
        sections
      }
    }
  });
}

function markAsRead(messageId) {
  return callApi(`/${process.env.WA_PHONE_NUMBER_ID}/messages`, {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId
  });
}

function callApi(endpoint, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const options = {
      hostname: 'graph.facebook.com',
      path: `/${API_VERSION}${endpoint}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WA_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          if (res.statusCode >= 400) {
            console.error('WA API Error:', JSON.stringify(parsed));
            reject(new Error(`WA API ${res.statusCode}: ${responseData}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Parse error: ${responseData}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { sendMessage, sendInteractiveButtons, sendInteractiveList, markAsRead };
