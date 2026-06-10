import express from 'express';
import fs from 'fs';
import path from 'path';

const router = express.Router();
const logFile = path.join(process.cwd(), 'logs/elora_logs.json');

const SECRET_KEY = process.env.SOVEREIGN_API_TOKEN;
const checkAuth = (req, res, next) => {
  const auth = req.headers['authorization'];
  if (auth !== `Bearer ${SECRET_KEY}`) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};

router.use(checkAuth);

router.get('/search', (req, res) => {
  const query = req.query.query?.toLowerCase();
  if (!query) return res.status(400).json({ error: 'Query parameter missing' });

  fs.readFile(logFile, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Failed to read log file' });
    const logs = JSON.parse(data);
    const matches = logs.filter(entry =>
      JSON.stringify(entry).toLowerCase().includes(query)
    );
    res.json({ results: matches });
  });
});

router.get('/summary', (req, res) => {
  fs.readFile(logFile, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Failed to read log file' });
    const logs = JSON.parse(data);
    const last20 = logs.slice(-20);
    const summary = last20.map(l => ({
      timestamp: l.timestamp,
      prompt: l.prompt,
      reply: l.reply
    }));
    res.json({ summary });
  });
});

export default router;
