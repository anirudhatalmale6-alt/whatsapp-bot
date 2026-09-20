const { sendMessage, markAsRead } = require('./whatsapp');
const { generateResponse } = require('./ai');
const {
  getOrCreateConversation, updateConversation, saveMessage,
  getConversationHistory, saveLead, logAnalytics
} = require('./db');

const processingMessages = new Set();

function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WA_VERIFY_TOKEN) {
    console.log('Webhook verified');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
}

async function handleWebhook(req, res) {
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;

        const value = change.value;

        for (const status of value.statuses || []) {
          handleStatus(status);
        }

        for (const message of value.messages || []) {
          const contact = (value.contacts || []).find(c => c.wa_id === message.from);
          await processMessage(message, contact);
        }
      }
    }
  } catch (err) {
    console.error('Webhook error:', err);
  }
}

function handleStatus(status) {
  logAnalytics('message_status', status.recipient_id, null, {
    status: status.status,
    message_id: status.id
  });
}

async function processMessage(message, contact) {
  const phone = message.from;
  const waMessageId = message.id;

  if (processingMessages.has(waMessageId)) return;
  processingMessages.add(waMessageId);
  setTimeout(() => processingMessages.delete(waMessageId), 60000);

  try {
    markAsRead(waMessageId).catch(() => {});

    let text = '';
    let messageType = 'text';

    switch (message.type) {
      case 'text':
        text = message.text.body;
        break;
      case 'interactive':
        if (message.interactive.type === 'button_reply') {
          text = message.interactive.button_reply.title;
        } else if (message.interactive.type === 'list_reply') {
          text = message.interactive.list_reply.title;
        }
        messageType = 'interactive';
        break;
      case 'location':
        text = `[Location: ${message.location.latitude}, ${message.location.longitude}]`;
        messageType = 'location';
        break;
      case 'image':
      case 'video':
      case 'audio':
      case 'document':
        text = `[${message.type} received]`;
        messageType = message.type;
        break;
      default:
        text = `[${message.type} message]`;
        messageType = message.type;
    }

    if (!text) return;

    const conv = getOrCreateConversation(phone);

    if (contact?.profile?.name && !conv.name) {
      updateConversation(conv.id, { name: contact.profile.name });
    }

    saveMessage(conv.id, 'in', text, waMessageId, messageType);
    logAnalytics('message_received', phone, conv.brand, { type: messageType });

    const history = getConversationHistory(conv.id, 20);
    const aiResult = await generateResponse(history, text, {
      name: conv.name || contact?.profile?.name,
      language: conv.language,
      brand: conv.brand
    });

    if (aiResult.language && aiResult.language !== conv.language) {
      updateConversation(conv.id, { language: aiResult.language });
    }

    if (aiResult.lead) {
      const leadBrand = aiResult.lead.brand || conv.brand || 'general';
      saveLead(conv.id, phone, conv.name || contact?.profile?.name, aiResult.lead.type, leadBrand);
      updateConversation(conv.id, { brand: leadBrand });
      logAnalytics('lead_captured', phone, leadBrand, { type: aiResult.lead.type });
    }

    if (aiResult.text) {
      const result = await sendMessage(phone, aiResult.text);
      const sentMsgId = result?.messages?.[0]?.id;
      saveMessage(conv.id, 'out', aiResult.text, sentMsgId);
      logAnalytics('message_sent', phone, conv.brand);
    }
  } catch (err) {
    console.error(`Error processing message from ${phone}:`, err);
    try {
      await sendMessage(phone, 'Mèsi pou mesaj ou! Yon moun nan ekip nou an ap reponn ou byento. 🙏');
    } catch (e) {
      console.error('Failed to send fallback:', e);
    }
  }
}

module.exports = { verifyWebhook, handleWebhook };
