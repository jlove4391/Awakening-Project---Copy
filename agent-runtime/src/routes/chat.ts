import { Router } from 'express';

import { runAgentMessage } from '../agentEndpoint.js';
import { setupSse, sendEvent } from '../lib/sse.js';
import type { ChatRequestBody } from '../types.js';
import { isKnownAutonomyLevel, isKnownAutonomyProfile, normalizeAutonomyLevel } from '../governance/autonomyProfiles.js';

const allowedAgents = new Set(['elora', 'nexora', 'kaz', 'jynx', 'kalyra']);
const allowedAgentList = Array.from(allowedAgents).join(', ');

export const chatRouter = Router();

chatRouter.post('/', async (req, res, next) => {
  const { message, sessionId, agent = 'elora', autonomyProfile, autonomyLevel, executionMode } = req.body as ChatRequestBody;

  if (!message?.trim()) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  if (!allowedAgents.has(agent)) {
    res.status(400).json({ error: `agent must be one of: ${allowedAgentList}` });
    return;
  }

  if (autonomyProfile !== undefined && !isKnownAutonomyProfile(autonomyProfile)) {
    res.status(400).json({ error: 'autonomyProfile must be dev_autonomy when provided' });
    return;
  }

  if (autonomyLevel !== undefined && !isKnownAutonomyLevel(autonomyLevel)) {
    res.status(400).json({ error: 'autonomyLevel must be one of: 0, 1, 2, 3' });
    return;
  }

  const normalizedAutonomyLevel = normalizeAutonomyLevel(autonomyLevel);

  setupSse(res);

  try {
    await runAgentMessage({ message, sessionId, agent, autonomyProfile, autonomyLevel: normalizedAutonomyLevel, executionMode }, async (runtimeEvent) => {
      sendEvent(res, runtimeEvent.event, runtimeEvent.data);
    });

    res.end();
  } catch (error) {
    sendEvent(res, 'error', { message: error instanceof Error ? error.message : 'Unknown runtime error' });
    res.end();
    next(error);
  }
});
