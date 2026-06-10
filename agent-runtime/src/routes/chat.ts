import { Router } from 'express';
import { runAgentMessage } from '../agentEndpoint.js';
import { setupSse, sendEvent } from '../lib/sse.js';
import type { ChatRequestBody } from '../types.js';

export const chatRouter = Router();

chatRouter.post('/', async (req, res, next) => {
  const { message, sessionId } = req.body as ChatRequestBody;

  if (!message?.trim()) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  setupSse(res);

  try {
    await runAgentMessage({ message, sessionId, channel: 'text' }, ({ event, data }) => sendEvent(res, event, data));
    res.end();
  } catch (error) {
    sendEvent(res, 'error', { message: error instanceof Error ? error.message : 'Unknown runtime error' });
    res.end();
    next(error);
  }
});
