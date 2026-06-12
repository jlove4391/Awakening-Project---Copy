import { Router } from 'express';

import { runAgentMessage } from '../agentEndpoint.js';
import { setupSse, sendEvent } from '../lib/sse.js';
import type { ChatRequestBody } from '../types.js';

const allowedAgents = new Set(['elora', 'nexora', 'kaz', 'jynx']);
const allowedAgentList = Array.from(allowedAgents).join(', ');

export const chatRouter = Router();

chatRouter.post('/', async (req, res, next) => {
  const { message, sessionId, agent = 'elora' } = req.body as ChatRequestBody;

  if (!message?.trim()) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  if (!allowedAgents.has(agent)) {
    res.status(400).json({ error: `agent must be one of: ${allowedAgentList}` });
    return;
  }

  setupSse(res);

  try {
    await runAgentMessage({ message, sessionId, agent }, async (runtimeEvent) => {
      sendEvent(res, runtimeEvent.event, runtimeEvent.data);
    });

    res.end();
  } catch (error) {
    sendEvent(res, 'error', { message: error instanceof Error ? error.message : 'Unknown runtime error' });
    res.end();
    next(error);
  }
});
