// authBridge/server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { execSync } from 'child_process';

import authRoutes from './routes/authRoutes.js';
import googleRoutes from './routes/googleRoutes.js';
import calendarRoutes from './routes/calendarRoutes.js';
import gmailRoutes from './routes/gmailRoutes.js';
import driveRoutes from './routes/driveRoutes.js';
import sheetsRoutes from './routes/sheetsRoutes.js';
import notionRoutes from './routes/notionRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// ---------- Middleware ----------
app.use(
  cors({
    origin: process.env.FRONTEND_URL || true, // allow dev by default
    credentials: true,
  })
);
app.use(express.json());

// ---------- Your existing routes ----------
app.use('/api/auth', authRoutes);
app.use('/api/google', googleRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/gmail', gmailRoutes);
app.use('/api/drive', driveRoutes);
app.use('/api/sheets', sheetsRoutes);
app.use('/api/notion', notionRoutes);

// ---------- NEW: System capabilities for Nexora awareness ----------
// URL: POST /api/bridge/system/capabilities
// Resp: { ok: true, capabilities: { vscode, repo, fs, tests } }
app.post('/api/bridge/system/capabilities', (_req, res) => {
  try {
    // If you want to target a specific workspace (VS Code root), set WORKSPACE_ROOT in .env
    const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();

    let repoLinked = false;
    let repoUrl = null;

    // Check if workspaceRoot is inside a git repo and whether a remote is set
    try {
      const inside = execSync('git rev-parse --is-inside-work-tree', { cwd: workspaceRoot })
        .toString()
        .trim();
      repoLinked = inside === 'true';

      try {
        repoUrl = execSync('git config --get remote.origin.url', { cwd: workspaceRoot })
          .toString()
          .trim() || null;
      } catch {
        repoUrl = null;
      }
    } catch {
      repoLinked = false;
      repoUrl = null;
    }

    const capabilities = {
      vscode: { connected: true, workspaceRoot },
      repo: { linked: repoLinked, remote: repoUrl },
      fs: { read: true, write: true, list: true, sandbox: true },
      tests: true,
    };

    return res.json({ ok: true, capabilities });
  } catch (err) {
    console.error('Capabilities check failed:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------- Health ----------
app.get('/', (_req, res) => res.send('✅ AuthBridge Backend Running'));
app.get('/api/health', (_req, res) =>
  res.json({ ok: true, mode: (process.env.INTEGRATIONS_MODE || 'live').toLowerCase() })
);

// ---------- Error handler ----------
app.use((err, _req, res, _next) => {
  console.error('Server Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// ---------- Start ----------
app.listen(PORT, () => console.log(`🚀 AuthBridge server running on port ${PORT}`));
