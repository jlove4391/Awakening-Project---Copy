// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load env vars
dotenv.config();

const authBridge = require('./authBridge');

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Use existing AuthBridge routes
app.use('/api/auth', authBridge);

// ✅ Add VS Code Bridge routes here
const SECRET_KEY = process.env.VITE_SOVEREIGN_API_TOKEN || 'YourSuperSecureToken';

// Auth check for Bridge routes
app.use('/api/bridge', (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (token !== SECRET_KEY) {
    console.error(`❌ Unauthorized attempt: Received token "${token}"`);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// ✅ POST: /api/bridge/get-file (with bulletproof logs)
app.post('/api/bridge/get-file', (req, res) => {
  console.log("🔥 Bridge hit with payload:", req.body);

  const { relativePath } = req.body;
  if (!relativePath) {
    console.error("❌ No relativePath given!");
    return res.status(400).json({ error: 'Missing relativePath' });
  }

  const filePath = path.join(process.cwd(), 'src', relativePath);
  console.log(`📂 Attempting to read: ${filePath}`);

  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    console.log(`✅ Successfully read: ${filePath}`);
    res.json({ success: true, content: data });
  } catch (err) {
    console.error(`❌ fs.readFileSync failed: ${err.message}`);
    res.status(500).json({ error: `Cannot read file: ${err.message}` });
  }
});

// ✅ POST: /api/bridge/update-file (unchanged)
app.post('/api/bridge/update-file', (req, res) => {
  const { relativePath, content } = req.body;
  if (!relativePath || !content) return res.status(400).json({ error: 'Missing fields' });

  const filePath = path.join(process.cwd(), 'src', relativePath);
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    res.json({ success: true, message: 'File updated' });
  } catch (err) {
    res.status(500).json({ error: `Cannot write file: ${err.message}` });
  }
});

// ✅ POST: /api/bridge/run-scan (unchanged)
app.post('/api/bridge/run-scan', (req, res) => {
  res.json({ success: true, message: 'Scan complete (placeholder)' });
});

// ✅ Start server on port 4000
const PORT = 4000;
app.listen(PORT, () => {
  console.log(`🔌 Unified Auth + VS Code Bridge running at http://localhost:${PORT}`);
});
2