const Anthropic = require('@anthropic-ai/sdk');

let client;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

/* The contact number is in the middle of being swapped (the bot takes one
   number, Jennifer takes another), so it must never be frozen into the prompt -
   a hardcoded number means the bot confidently hands customers the wrong one
   the day the swap happens. Default is today's number, so nothing changes
   until it is deliberately set. */
const CONTACT_NUMBER = process.env.WA_CONTACT_NUMBER || '+509 4685 9702';

/* MsouWout is moving from waitlist to live. Which of these the bot says is a
   BUSINESS decision, not a code decision, so it is a switch rather than an
   edit - and it stays on `waitlist` until Jeffery says otherwise. */
const LAUNCH_MODES = {
  waitlist: 'IMPORTANT: You are in soft-launch / waitlist mode for MsouWout rides. When someone requests a ride, collect their info but let them know the service is launching soon in their area and they\'ll be among the first to know.',
  live: 'IMPORTANT: MsouWout rides are LIVE. When someone wants a ride, send them to msouwout.com to order it, and help them through it. Do not tell them the service is still coming.'
};
function launchMode() {
  return String(process.env.MSOUWOUT_LAUNCH_MODE || 'waitlist').toLowerCase();
}

function buildSystemPrompt() {
  return `You are the AI customer support agent for HaitiBiznis and its family of brands. You handle conversations on WhatsApp for:

1. MsouWout - Haiti's first digital ride-hailing service (moto & car rides)
2. MyPlopPlop - E-commerce marketplace connecting Haitian diaspora with local products
3. Koutye Biznis - Broker/affiliate program where people earn commissions
4. Tike Lakay - Event ticketing platform for Haitian events
5. HaitiBiznis - The parent company building Haiti's digital economy

LANGUAGE RULES:
- Default language is Haitian Creole (Kreyol)
- If the user writes in French, respond in French
- If the user writes in English, respond in English
- If the user writes in Spanish, respond in Spanish
- Always detect the language and match it
- Keep responses natural and conversational, not robotic

BRAND DETECTION:
- Ride/transport keywords (kous, ride, transport, machin, moto, chofè, driver) → MsouWout
- Shopping/product keywords (achte, buy, shop, produit, product, livrezon, delivery) → MyPlopPlop
- Broker/affiliate keywords (koutye, broker, komisyon, commission, referral) → Koutye Biznis
- Event/ticket keywords (tikè, ticket, evènman, event, konsè, concert) → Tikè Lakay
- General business inquiries → HaitiBiznis

CORE CAPABILITIES:
1. RIDE REQUESTS (MsouWout): Collect pickup location, destination, vehicle preference (moto/car). Create a lead. Inform that a driver will be assigned shortly.
2. DRIVER SIGNUP (MsouWout): Collect name, phone, vehicle type, year, zone. Create a driver lead.
3. SELLER ONBOARDING (MyPlopPlop): Collect business name, products they sell, location. Create seller lead.
4. KOUTYE SIGNUP: Collect name, phone, zone. Generate referral code. Create koutye lead.
5. GENERAL SUPPORT: Answer questions about any brand, hours of operation, pricing, etc.
6. LEAD CAPTURE: For any inquiry, always try to get the person's name and what they need.

RESPONSE STYLE:
- Keep messages SHORT (under 300 characters when possible, max 500)
- Use relevant emojis naturally
- Be warm, friendly, professional
- Never make up information you don't know
- If someone has a complex issue, tell them a team member will follow up

OPERATIONAL DETAILS:
- MsouWout operates in: Delmas, Pétion-Ville, Tabarre, Carrefour, Centre-ville Port-au-Prince
- Hours: 6AM - 10PM daily
- Moto rides: ~150-500 HTG depending on distance
- Car rides: ~300-1500 HTG depending on distance
- MsouWout website: msouwout.com
- MyPlopPlop website: myplopplop.com
- Contact WhatsApp: ${CONTACT_NUMBER}

${LAUNCH_MODES[launchMode()] || LAUNCH_MODES.waitlist}

When you identify a lead (someone wanting a ride, wanting to drive, wanting to sell, wanting to be a koutye), include this exact tag at the END of your response:
[LEAD:type:brand] where type is rider/driver/seller/koutye/general and brand is msouwout/myplopplop/koutye/tikelakay/haitibiznis

When you detect the user's language, include this tag: [LANG:code] where code is ht/fr/en/es`;
}

async function generateResponse(conversationHistory, userMessage, conversationMeta = {}) {
  const messages = [];

  for (const msg of conversationHistory.slice(-10)) {
    messages.push({
      role: msg.direction === 'in' ? 'user' : 'assistant',
      content: msg.content
    });
  }

  if (!messages.length || messages[messages.length - 1].content !== userMessage) {
    messages.push({ role: 'user', content: userMessage });
  }

  if (messages[0]?.role === 'assistant') {
    messages.shift();
  }

  try {
    const response = await getClient().messages.create({
      /* Pinned to the model this was built and tested against. A newer one is
         very likely better, but if the account cannot reach the model I name
         here EVERY message falls into the catch below and answers "someone
         will reply soon" - which looks like a working bot and is not one.
         So: switch it once the bot is live and the change can be watched. */
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: buildSystemPrompt(),
      messages
    });

    const text = response.content[0]?.text || '';
    return parseAiResponse(text);
  } catch (err) {
    console.error('AI Error:', err.message);
    return {
      text: 'Mèsi pou mesaj ou! Yon moun nan ekip nou an ap reponn ou byento. 🙏',
      lead: null,
      language: 'ht'
    };
  }
}

function parseAiResponse(text) {
  let lead = null;
  let language = 'ht';

  const leadMatch = text.match(/\[LEAD:(\w+):(\w+)\]/);
  if (leadMatch) {
    lead = { type: leadMatch[1], brand: leadMatch[2] };
  }

  const langMatch = text.match(/\[LANG:(\w+)\]/);
  if (langMatch) {
    language = langMatch[1];
  }

  const cleanText = text
    .replace(/\[LEAD:\w+:\w+\]/g, '')
    .replace(/\[LANG:\w+\]/g, '')
    .trim();

  return { text: cleanText, lead, language };
}

// buildSystemPrompt is exported so the prompt can be asserted on without an
// API key: a wrong number or a stale launch line is invisible at runtime.
module.exports = { generateResponse, buildSystemPrompt };
