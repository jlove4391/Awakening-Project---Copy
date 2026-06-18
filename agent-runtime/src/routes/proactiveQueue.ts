import { Router } from 'express';
import { approveProactiveQueueItem, listProactiveQueueItems, parseProactiveQueueStatus, updateProactiveQueueStatus, upsertProactiveQueueItem } from '../governance/proactiveQueue.js';

export const proactiveQueueRouter = Router();

proactiveQueueRouter.get('/', async (req, res, next) => {
  try {
    const status = parseProactiveQueueStatus(req.query.status);
    res.json({ items: await listProactiveQueueItems(status ? { status } : {}) });
  } catch (error) { next(error); }
});

proactiveQueueRouter.post('/', async (req, res, next) => {
  try {
    const result = await upsertProactiveQueueItem(req.body);
    res.status(result.merged ? 200 : 201).json(result);
  } catch (error) { next(error); }
});

proactiveQueueRouter.post('/:id/approve', async (req, res, next) => {
  try {
    if (req.body?.confirmedByUser !== true) { res.status(400).json({ error: 'confirmedByUser=true is required' }); return; }
    const result = await approveProactiveQueueItem(req.params.id, String(req.body?.approver || 'user'), String(req.body?.note || ''));
    if (!result) { res.status(404).json({ error: 'queue item not found' }); return; }
    res.json(result);
  } catch (error) { next(error); }
});

proactiveQueueRouter.post('/:id/defer', async (req, res, next) => {
  try {
    const item = await updateProactiveQueueStatus(req.params.id, 'deferred', String(req.body?.note || 'Deferred for later review.'));
    if (!item) { res.status(404).json({ error: 'queue item not found' }); return; }
    res.json({ item });
  } catch (error) { next(error); }
});

proactiveQueueRouter.post('/:id/dismiss', async (req, res, next) => {
  try {
    const item = await updateProactiveQueueStatus(req.params.id, 'dismissed', String(req.body?.note || 'Dismissed by reviewer.'));
    if (!item) { res.status(404).json({ error: 'queue item not found' }); return; }
    res.json({ item });
  } catch (error) { next(error); }
});
