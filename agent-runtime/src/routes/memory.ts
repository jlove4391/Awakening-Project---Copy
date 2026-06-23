import { Router } from 'express';
import { durableMemoryScopes, deleteMemory, remember, retrieveMemories, summarizeMemories } from '../memory/index.js';
import { memoryService } from '../memory/memoryService.js';

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
    const alphaTypes = stringList(req.query.alphaTypes);
    const statuses = stringList(req.query.statuses);
    const confidence = stringList(req.query.confidence);
    const contradicts = stringList(req.query.contradicts);
    const reviewNeeded = req.query.reviewNeeded === undefined ? undefined : String(req.query.reviewNeeded) === 'true';
    const minRetrievalPriority = req.query.minRetrievalPriority === undefined ? undefined : Number(req.query.minRetrievalPriority);
    res.json({
      memories: await memoryService.listMemories({
        sessionId,
        limit,
        scopes: scopes.length ? scopes : undefined,
        alphaTypes: alphaTypes.length ? (alphaTypes as never) : undefined,
        statuses: statuses.length ? (statuses as never) : undefined,
        confidence: confidence.length ? (confidence as never) : undefined,
        reviewNeeded,
        contradicts: contradicts.length ? contradicts : undefined,
        minRetrievalPriority,
        includeGlobal: true,
      }),
    });
  } catch (error) {
    next(error);
  }
});

memoryRouter.post('/', async (req, res, next) => {
  try {
    const {
      sessionId = 'default',
      text,
      scope = 'conversation_summary',
      tags = [],
      importance,
      metadata,
      source = 'api',
      actor,
      alphaType,
      confidence,
      status,
      reviewNeeded,
      contradicts,
      retrievalPriority,
    } = req.body || {};
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
      actor,
      alphaType,
      confidence,
      status,
      reviewNeeded,
      contradicts: stringList(contradicts),
      retrievalPriority,
    });
    res.status(201).json({ memory });
  } catch (error) {
    next(error);
  }
});

memoryRouter.post('/retrieve', async (req, res, next) => {
  try {
    const {
      sessionId = 'default',
      query = '',
      scopes = [],
      tags = [],
      limit = 10,
      includeGlobal = true,
      alphaTypes = [],
      confidence,
      statuses = [],
      reviewNeeded,
      contradicts = [],
      minRetrievalPriority,
    } = req.body || {};
    res.json({
      memories: await retrieveMemories({
        sessionId: String(sessionId),
        query: String(query),
        scopes: stringList(scopes),
        tags: stringList(tags),
        limit,
        includeGlobal,
        alphaTypes: stringList(alphaTypes) as never,
        confidence: (Array.isArray(confidence) ? stringList(confidence) : confidence) as never,
        statuses: stringList(statuses) as never,
        reviewNeeded,
        contradicts: stringList(contradicts),
        minRetrievalPriority,
      }),
    });
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
