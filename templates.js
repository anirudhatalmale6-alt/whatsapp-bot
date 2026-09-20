const https = require('https');

const API_VERSION = 'v21.0';

function createTemplate(name, language, category, components) {
  return callApi(`/${process.env.WA_BUSINESS_ACCOUNT_ID}/message_templates`, {
    name,
    language,
    category,
    components
  });
}

function sendTemplate(to, templateName, languageCode, components = []) {
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
    }
  };
  if (components.length) {
    body.template.components = components;
  }
  return callApi(`/${process.env.WA_PHONE_NUMBER_ID}/messages`, body);
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
            console.error('Template API Error:', JSON.stringify(parsed));
            reject(new Error(`Template API ${res.statusCode}: ${responseData}`));
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

const TEMPLATES = {
  welcome: {
    name: 'haitibiznis_welcome',
    category: 'MARKETING',
    languages: {
      ht: {
        code: 'ht',
        body: 'Byenveni sou HaitiBiznis! 🇭🇹 Nou la pou ede ou. Ekri sa ou bezwen:\n\n🚗 "Kous" - jwenn transpò\n🛒 "Achte" - fè kòmès\n💼 "Biznis" - touche kòm Koutye\n🎫 "Tikè" - bilè evènman\n\nOu kapab ekri nan Kreyòl, Français, English, oswa Español!'
      },
      fr: {
        code: 'fr',
        body: 'Bienvenue sur HaitiBiznis! 🇭🇹 Nous sommes là pour vous aider. Écrivez ce dont vous avez besoin:\n\n🚗 "Course" - transport\n🛒 "Acheter" - commerce\n💼 "Business" - gagner en tant que Koutye\n🎫 "Billet" - événements\n\nVous pouvez écrire en Kreyòl, Français, English, ou Español!'
      },
      en: {
        code: 'en_US',
        body: 'Welcome to HaitiBiznis! 🇭🇹 We\'re here to help. Type what you need:\n\n🚗 "Ride" - get transport\n🛒 "Shop" - marketplace\n💼 "Business" - earn as a Koutye\n🎫 "Ticket" - event tickets\n\nYou can write in Kreyòl, Français, English, or Español!'
      },
      es: {
        code: 'es',
        body: 'Bienvenido a HaitiBiznis! 🇭🇹 Estamos aquí para ayudarte. Escribe lo que necesitas:\n\n🚗 "Viaje" - transporte\n🛒 "Comprar" - mercado\n💼 "Negocio" - gana como Koutye\n🎫 "Boleto" - eventos\n\nPuedes escribir en Kreyòl, Français, English, o Español!'
      }
    }
  },
  ride_confirmation: {
    name: 'msouwout_ride_confirm',
    category: 'UTILITY',
    languages: {
      ht: {
        code: 'ht',
        body: '✅ Nou resevwa demann kous ou!\n\n📍 Depi: {{1}}\n📍 Ale: {{2}}\n🚗 Kalite: {{3}}\n\nEkip MsouWout ap kontakte ou byento!'
      }
    }
  },
  driver_welcome: {
    name: 'msouwout_driver_welcome',
    category: 'UTILITY',
    languages: {
      ht: {
        code: 'ht',
        body: '🎉 Byenveni nan ekip MsouWout, {{1}}!\n\nNou ap verifye enfòmasyon ou yo. Nou ap kontakte ou nan 24è.\n\nPou aksede pi vit, voye foto machin/moto ou ak lisans ou.'
      }
    }
  }
};

module.exports = { createTemplate, sendTemplate, TEMPLATES };
