import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { runtimeConfig } from './config.js';
import { chatRouter } from './routes/chat.js';
import { toolsRouter } from './routes/tools.js';
import { tasksRouter } from './routes/tasks.js';
import { googleAuthRouter } from './providers/google/auth.js';

const app = express();

app.use(cors({ origin: runtimeConfig.corsOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'agent-runtime', model: runtimeConfig.model });
});

app.use('/api/chat', chatRouter);
app.use('/api/tools', toolsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/auth/google', googleAuthRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (res.headersSent) return;
  res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown agent runtime error' });
});

app.listen(runtimeConfig.port, () => {
  console.log(`agent-runtime listening on http://localhost:${runtimeConfig.port}`);
});
