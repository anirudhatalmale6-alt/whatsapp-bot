require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const { handleWebhook, verifyWebhook } = require('./webhook');
const { initDb } = require('./db');
const adminRouter = require('./admin');

const app = express();
const PORT = process.env.PORT || 3200;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/admin/static', express.static(path.join(__dirname, 'public')));

app.get('/webhook', verifyWebhook);
app.post('/webhook', handleWebhook);

app.use('/admin', adminRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

initDb();

app.listen(PORT, () => {
  console.log(`WhatsApp Bot running on port ${PORT}`);
  console.log(`Webhook URL: https://your-domain.com/webhook`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
});
