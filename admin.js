const express = require('express');
const { getStats, getConversationMessages, getDb } = require('./db');

const router = express.Router();

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Authentication required');
  }
  const decoded = Buffer.from(auth.slice(6), 'base64').toString();
  const [user, pass] = decoded.split(':');
  if (user === process.env.ADMIN_USERNAME && pass === process.env.ADMIN_PASSWORD) {
    return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Admin"');
  res.status(401).send('Invalid credentials');
}

router.use(requireAuth);

router.get('/', (req, res) => {
  const stats = getStats();
  res.send(renderDashboard(stats));
});

router.get('/api/stats', (req, res) => {
  res.json(getStats());
});

router.get('/api/conversations', (req, res) => {
  const d = getDb();
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;
  const convs = d.prepare(
    `SELECT c.*, (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as msg_count
     FROM conversations c ORDER BY c.last_message_at DESC LIMIT ? OFFSET ?`
  ).all(limit, offset);
  const total = d.prepare('SELECT COUNT(*) as c FROM conversations').get().c;
  res.json({ conversations: convs, total, page, pages: Math.ceil(total / limit) });
});

router.get('/api/conversations/:id/messages', (req, res) => {
  const messages = getConversationMessages(parseInt(req.params.id));
  res.json({ messages });
});

router.get('/api/leads', (req, res) => {
  const d = getDb();
  const type = req.query.type;
  const brand = req.query.brand;
  let query = 'SELECT * FROM leads WHERE 1=1';
  const params = [];
  if (type) { query += ' AND type = ?'; params.push(type); }
  if (brand) { query += ' AND brand = ?'; params.push(brand); }
  query += ' ORDER BY created_at DESC LIMIT 100';
  const leads = d.prepare(query).all(...params);
  res.json({ leads });
});

router.get('/api/analytics', (req, res) => {
  const d = getDb();
  const days = parseInt(req.query.days) || 7;
  const daily = d.prepare(`
    SELECT date(created_at) as day, event, COUNT(*) as count
    FROM analytics WHERE created_at >= date('now', '-' || ? || ' days')
    GROUP BY day, event ORDER BY day
  `).all(days);
  res.json({ daily });
});

function renderDashboard(stats) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>HaitiBiznis WhatsApp Bot - Admin</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #e0e0e0; }
  .header { background: linear-gradient(135deg, #1a5276 0%, #0d3b54 100%); padding: 20px 30px; display: flex; align-items: center; gap: 15px; }
  .header h1 { font-size: 22px; font-weight: 600; }
  .header .subtitle { color: #8bb8d0; font-size: 13px; }
  .container { max-width: 1200px; margin: 0 auto; padding: 25px; }
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 30px; }
  .stat-card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 10px; padding: 20px; }
  .stat-card .label { font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 1px; }
  .stat-card .value { font-size: 32px; font-weight: 700; margin-top: 5px; }
  .stat-card .value.blue { color: #4fc3f7; }
  .stat-card .value.green { color: #66bb6a; }
  .stat-card .value.orange { color: #ffa726; }
  .stat-card .value.red { color: #ef5350; }
  .section { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 10px; padding: 20px; margin-bottom: 20px; }
  .section h2 { font-size: 16px; margin-bottom: 15px; color: #ccc; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #2a2a2a; font-size: 13px; }
  th { color: #888; font-weight: 500; text-transform: uppercase; font-size: 11px; letter-spacing: 1px; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; }
  .badge-rider { background: #1a3a5c; color: #4fc3f7; }
  .badge-driver { background: #1a4a2e; color: #66bb6a; }
  .badge-seller { background: #4a3a1a; color: #ffa726; }
  .badge-koutye { background: #4a1a3a; color: #e040fb; }
  .badge-general { background: #2a2a2a; color: #999; }
  .brand-tag { font-size: 11px; color: #888; }
  .conv-row { cursor: pointer; }
  .conv-row:hover { background: #222; }
  #chat-panel { display: none; position: fixed; right: 0; top: 0; width: 400px; height: 100vh; background: #111; border-left: 1px solid #2a2a2a; overflow-y: auto; z-index: 100; }
  #chat-panel .chat-header { padding: 15px 20px; background: #1a1a1a; border-bottom: 1px solid #2a2a2a; display: flex; justify-content: space-between; align-items: center; }
  #chat-panel .chat-header .close { cursor: pointer; font-size: 20px; color: #888; }
  .msg { padding: 8px 14px; margin: 6px 12px; border-radius: 10px; max-width: 85%; font-size: 13px; line-height: 1.4; }
  .msg.in { background: #1a3a1a; align-self: flex-start; margin-right: auto; }
  .msg.out { background: #1a2a4a; align-self: flex-end; margin-left: auto; }
  .msg .time { font-size: 10px; color: #666; margin-top: 3px; }
  .chat-messages { display: flex; flex-direction: column; padding: 10px 0; }
  .refresh-btn { background: #1a5276; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; }
  .refresh-btn:hover { background: #1d6fa5; }
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>HaitiBiznis WhatsApp Bot</h1>
    <div class="subtitle">AI Customer Support Dashboard</div>
  </div>
  <button class="refresh-btn" onclick="location.reload()">Refresh</button>
</div>
<div class="container">
  <div class="stats-grid">
    <div class="stat-card">
      <div class="label">Total Conversations</div>
      <div class="value blue">${stats.totalConversations}</div>
    </div>
    <div class="stat-card">
      <div class="label">Total Messages</div>
      <div class="value green">${stats.totalMessages}</div>
    </div>
    <div class="stat-card">
      <div class="label">Total Leads</div>
      <div class="value orange">${stats.totalLeads}</div>
    </div>
    <div class="stat-card">
      <div class="label">Today's Messages</div>
      <div class="value blue">${stats.todayMessages}</div>
    </div>
    <div class="stat-card">
      <div class="label">Today's Leads</div>
      <div class="value green">${stats.todayLeads}</div>
    </div>
  </div>

  <div class="section">
    <h2>Leads by Type</h2>
    <div style="display:flex;gap:20px;flex-wrap:wrap;">
      ${stats.leadsByType.map(l => `<div><span class="badge badge-${l.type}">${l.type}</span> <strong>${l.count}</strong></div>`).join('')}
    </div>
  </div>

  <div class="section">
    <h2>Recent Conversations</h2>
    <table>
      <thead><tr><th>Phone</th><th>Name</th><th>Language</th><th>Brand</th><th>Messages</th><th>Last Active</th></tr></thead>
      <tbody>
        ${stats.recentConversations.map(c => `
          <tr class="conv-row" onclick="openChat(${c.id}, '${(c.name || c.phone).replace(/'/g, "\\'")}')">
            <td>${c.phone}</td>
            <td>${c.name || '-'}</td>
            <td>${c.language || 'ht'}</td>
            <td><span class="brand-tag">${c.brand || 'general'}</span></td>
            <td>${c.msg_count}</td>
            <td>${c.last_message_at || '-'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
</div>

<div id="chat-panel">
  <div class="chat-header">
    <strong id="chat-title">Chat</strong>
    <span class="close" onclick="closeChat()">&times;</span>
  </div>
  <div class="chat-messages" id="chat-messages"></div>
</div>

<script>
async function openChat(id, name) {
  document.getElementById('chat-title').textContent = name;
  document.getElementById('chat-panel').style.display = 'block';
  const res = await fetch('/admin/api/conversations/' + id + '/messages', {
    headers: { 'Authorization': document.querySelector('meta[name=auth]')?.content || '' }
  });
  const data = await res.json();
  const container = document.getElementById('chat-messages');
  container.innerHTML = data.messages.map(m =>
    '<div class="msg ' + m.direction + '">' +
    m.content +
    '<div class="time">' + (m.created_at || '') + '</div>' +
    '</div>'
  ).join('');
  container.scrollTop = container.scrollHeight;
}
function closeChat() {
  document.getElementById('chat-panel').style.display = 'none';
}
</script>
</body>
</html>`;
}

module.exports = router;
