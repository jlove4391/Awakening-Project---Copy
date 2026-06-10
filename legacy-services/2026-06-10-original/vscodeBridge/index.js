import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const app = express();
app.use(express.json());

const SECRET_KEY = process.env.SOVEREIGN_API_TOKEN || 'YOUR_SECURE_SECRET';

// ✅ ESM fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Check auth
const checkAuth = (req, res, next) => {
  const auth = req.headers['authorization'];
  if (auth !== `Bearer ${SECRET_KEY}`) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};

// ✅ Use flexible BASE_DIR
const BASE_DIR = path.join(__dirname, '../../Elora-System/src');

// ✅ Get any file
app.post('/api/bridge/get-file', checkAuth, (req, res) => {
  const { relativePath } = req.body;
  const filePath = path.join(BASE_DIR, relativePath);
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ content: data });
  });
});

// ✅ Create new file
app.post('/api/bridge/create-file', checkAuth, (req, res) => {
  const { relativePath, content } = req.body;
  const filePath = path.join(BASE_DIR, relativePath);
  fs.writeFile(filePath, content, 'utf8', (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ status: 'success', message: `Created ${relativePath}` });
  });
});

// ✅ Update (overwrite) file
app.post('/api/bridge/update-file', checkAuth, (req, res) => {
  const { relativePath, newContent } = req.body;
  const filePath = path.join(BASE_DIR, relativePath);
  fs.writeFile(filePath, newContent, 'utf8', (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ status: 'success', message: `Updated ${relativePath}` });
  });
});

// ✅ Run scan
app.post('/api/bridge/run-scan', checkAuth, (req, res) => {
  exec(`node ${path.resolve(__dirname, '../../tools/scanAndPatch.js')}`, (error, stdout, stderr) => {
    if (error) return res.status(500).json({ error: stderr });
    res.json({ result: stdout });
  });
});

// ✅ Listen
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`✅ VS Code Bridge is running on port ${PORT}`);
});
export default app;
