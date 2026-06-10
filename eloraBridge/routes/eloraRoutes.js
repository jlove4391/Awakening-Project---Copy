import express from 'express';
import { runDiagnostics, analyzeCodebase } from '../ai/elora-bridge.js';

const router = express.Router();

const SECRET_KEY = process.env.SOVEREIGN_API_TOKEN;
const checkAuth = (req, res, next) => {
  const auth = req.headers['authorization'];
  if (auth !== `Bearer ${SECRET_KEY}`) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};

router.use(checkAuth);

router.get('/ping', (req, res) => {
  res.status(200).json({ message: "Elora bridge is operational." });
});

router.post('/diagnostics', async (req, res) => {
  try {
    const result = await runDiagnostics(req.body);
    res.status(200).json({ success: true, result });
  } catch (err) {
    console.error("Diagnostics error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/analyze', async (req, res) => {
  try {
    const result = await analyzeCodebase(req.body);
    res.status(200).json({ success: true, result });
  } catch (err) {
    console.error("Code analysis error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
