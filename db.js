const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'bot.db');

let db;

function getDb() {
  if (!db) {
    const fs = require('fs');
    fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDb() {
  const d = getDb();

  d.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      name TEXT,
      language TEXT DEFAULT 'ht',
      brand TEXT DEFAULT 'general',
      flow TEXT,
      flow_step INTEGER DEFAULT 0,
      flow_data TEXT DEFAULT '{}',
      last_message_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_conv_phone ON conversations(phone);

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('in', 'out')),
      content TEXT NOT NULL,
      wa_message_id TEXT,
      message_type TEXT DEFAULT 'text',
      status TEXT DEFAULT 'sent',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );

    CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_msg_time ON messages(created_at);

    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      phone TEXT NOT NULL,
      name TEXT,
      type TEXT NOT NULL CHECK(type IN ('rider', 'driver', 'seller', 'koutye', 'general')),
      brand TEXT,
      data TEXT DEFAULT '{}',
      status TEXT DEFAULT 'new',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );

    CREATE INDEX IF NOT EXISTS idx_lead_type ON leads(type);
    CREATE INDEX IF NOT EXISTS idx_lead_status ON leads(status);

    CREATE TABLE IF NOT EXISTS analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event TEXT NOT NULL,
      phone TEXT,
      brand TEXT,
      data TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_analytics_event ON analytics(event);
    CREATE INDEX IF NOT EXISTS idx_analytics_time ON analytics(created_at);
  `);

  console.log('Database initialized');
}

function getOrCreateConversation(phone) {
  const d = getDb();
  let conv = d.prepare('SELECT * FROM conversations WHERE phone = ?').get(phone);
  if (!conv) {
    const result = d.prepare(
      "INSERT INTO conversations (phone, last_message_at) VALUES (?, datetime('now'))"
    ).run(phone);
    conv = d.prepare('SELECT * FROM conversations WHERE id = ?').get(result.lastInsertRowid);
  }
  return conv;
}

function updateConversation(id, updates) {
  const d = getDb();
  const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = Object.values(updates);
  d.prepare("UPDATE conversations SET " + fields + ", updated_at = datetime('now') WHERE id = ?").run(...values, id);
}

function saveMessage(conversationId, direction, content, waMessageId, messageType = 'text') {
  const d = getDb();
  d.prepare(
    'INSERT INTO messages (conversation_id, direction, content, wa_message_id, message_type) VALUES (?, ?, ?, ?, ?)'
  ).run(conversationId, direction, content, waMessageId, messageType);
  d.prepare("UPDATE conversations SET last_message_at = datetime('now') WHERE id = ?").run(conversationId);
}

function getConversationHistory(conversationId, limit = 20) {
  const d = getDb();
  return d.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(conversationId, limit).reverse();
}

function saveLead(conversationId, phone, name, type, brand, data = {}) {
  const d = getDb();
  d.prepare(
    'INSERT INTO leads (conversation_id, phone, name, type, brand, data) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(conversationId, phone, name, type, brand, JSON.stringify(data));
}

function logAnalytics(event, phone, brand, data = {}) {
  const d = getDb();
  d.prepare(
    'INSERT INTO analytics (event, phone, brand, data) VALUES (?, ?, ?, ?)'
  ).run(event, phone, brand, JSON.stringify(data));
}

function getStats() {
  const d = getDb();
  return {
    totalConversations: d.prepare('SELECT COUNT(*) as c FROM conversations').get().c,
    totalMessages: d.prepare('SELECT COUNT(*) as c FROM messages').get().c,
    totalLeads: d.prepare('SELECT COUNT(*) as c FROM leads').get().c,
    todayMessages: d.prepare("SELECT COUNT(*) as c FROM messages WHERE created_at >= date('now')").get().c,
    todayLeads: d.prepare("SELECT COUNT(*) as c FROM leads WHERE created_at >= date('now')").get().c,
    leadsByType: d.prepare('SELECT type, COUNT(*) as count FROM leads GROUP BY type').all(),
    leadsByBrand: d.prepare('SELECT brand, COUNT(*) as count FROM leads WHERE brand IS NOT NULL GROUP BY brand').all(),
    recentConversations: d.prepare(
      'SELECT c.*, (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as msg_count FROM conversations c ORDER BY c.last_message_at DESC LIMIT 20'
    ).all(),
  };
}

function getConversationMessages(conversationId) {
  const d = getDb();
  return d.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(conversationId);
}

module.exports = {
  initDb, getDb, getOrCreateConversation, updateConversation,
  saveMessage, getConversationHistory, saveLead, logAnalytics,
  getStats, getConversationMessages
};
