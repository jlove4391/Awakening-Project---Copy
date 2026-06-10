import { Router } from 'express';

import { setupSse, sendEvent } from '../lib/sse.js';
import type { ChatRequestBody } from '../types.js';

export const chatRouter = Router();

chatRouter.post('/', async (req, res, next) => {
  const { message, sessionId, agent = 'elora' } = req.body as ChatRequestBody;

  if (!message?.trim()) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  if (agent !== 'elora' && agent !== 'nexora') {
    res.status(400).json({ error: 'agent must be elora or nexora' });
    return;
  }

  setupSse(res);

  try {

    res.end();
  } catch (error) {
    sendEvent(res, 'error', { message: error instanceof Error ? error.message : 'Unknown runtime error' });
    res.end();
    next(error);
  }
});
