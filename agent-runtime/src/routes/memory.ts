import { Router } from 'express';
import { durableMemoryScopes, deleteMemory, listMemories, remember, retrieveMemories, summarizeMemories } from '../memory/index.js';

export const memoryRouter = Router();

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

memoryRouter.get('/scopes', (_req, res) => {
  res.json({ scopes: durableMemoryScopes });
});

memoryRouter.get('/', async (req, res, next) => {
  try {
    const sessionId = String(req.query.sessionId || 'default');
    const limit = Number(req.query.limit || 25);
    const scopes = stringList(req.query.scopes);
    res.json({ memories: await listMemories(sessionId, limit, scopes.length ? scopes : undefined) });
  } catch (error) {
    next(error);
  }
});

memoryRouter.post('/', async (req, res, next) => {
  try {
    const { sessionId = 'default', text, scope = 'conversation_summary', tags = [], importance, metadata, source = 'api' } = req.body || {};
    if (!text?.trim()) {
      res.status(400).json({ error: 'text is required' });
      return;
    }
    const memory = await remember(String(sessionId), String(text), {
      scope,
      tags: stringList(tags),
      importance,
      metadata,
      source,
    });
    res.status(201).json({ memory });
  } catch (error) {
    next(error);
  }
});

memoryRouter.post('/retrieve', async (req, res, next) => {
  try {
    const { sessionId = 'default', query = '', scopes = [], tags = [], limit = 10, includeGlobal = true } = req.body || {};
    res.json({ memories: await retrieveMemories({ sessionId: String(sessionId), query: String(query), scopes: stringList(scopes), tags: stringList(tags), limit, includeGlobal }) });
  } catch (error) {
    next(error);
  }
});

memoryRouter.post('/summarize', async (req, res, next) => {
  try {
    const { sessionId = 'default', query = '', scopes = [], limit = 12 } = req.body || {};
    res.json(await summarizeMemories({ sessionId: String(sessionId), query: String(query), scopes: stringList(scopes), limit }));
  } catch (error) {
    next(error);
  }
});

memoryRouter.delete('/:memoryId', async (req, res, next) => {
  try {
    const deleted = await deleteMemory(req.params.memoryId);
    if (!deleted) {
      res.status(404).json({ error: 'memory not found' });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
