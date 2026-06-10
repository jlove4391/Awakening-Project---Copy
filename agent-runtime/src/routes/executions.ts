import { Router } from 'express';
import { listExecutionRecords } from '../executions.js';

export const executionsRouter = Router();

executionsRouter.get('/', async (req, res, next) => {
  try {
    const sessionId = req.query.sessionId ? String(req.query.sessionId) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 25;
    res.json({ executions: await listExecutionRecords({ sessionId, limit }) });
  } catch (error) {
    next(error);
  }
});
