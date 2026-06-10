import { Router } from 'express';
import { durableTaskQueue } from '../tasks/queue.js';
import { approveDelegatedTask, createDelegatedTask, getDelegatedTask, listDelegatedTasks, updateDelegatedTask } from '../tasks/store.js';
import type { DelegatedTaskStatus } from '../tasks/types.js';

export const tasksRouter = Router();

tasksRouter.get('/', async (req, res, next) => {
  try {
    const sessionId = String(req.query.sessionId || 'default');
    const includeAllSessions = req.query.includeAllSessions === 'true';
    res.json({ tasks: await listDelegatedTasks(includeAllSessions ? undefined : sessionId), queuedTaskIds: durableTaskQueue.snapshot() });
  } catch (error) {
    next(error);
  }
});

tasksRouter.get('/:taskId', async (req, res, next) => {
  try {
    const task = await getDelegatedTask(req.params.taskId);
    if (!task) {
      res.status(404).json({ error: 'task not found' });
      return;
    }
    res.json({ task });
  } catch (error) {
    next(error);
  }
});

tasksRouter.post('/', async (req, res, next) => {
  try {
    const { sessionId = 'default', objective, title, constraints, requiredTools, approvalRequirements, initialLog, notes } = req.body || {};
    const taskObjective = objective || title;
    if (!taskObjective) {
      res.status(400).json({ error: 'objective is required' });
      return;
    }

    const task = await createDelegatedTask({
      sessionId: String(sessionId),
      objective: String(taskObjective),
      constraints: Array.isArray(constraints) ? constraints : [],
      requiredTools: Array.isArray(requiredTools) ? requiredTools : [],
      approvalRequirements: Array.isArray(approvalRequirements) ? approvalRequirements : [],
      initialLog: initialLog || notes,
    });
    if (task.status === 'queued') durableTaskQueue.enqueue(task);
    res.status(201).json({ task });
  } catch (error) {
    next(error);
  }
});

tasksRouter.post('/:taskId/approve', async (req, res, next) => {
  try {
    const task = await approveDelegatedTask(req.params.taskId, String(req.body?.approver || 'user'), String(req.body?.note || ''));
    if (!task) {
      res.status(404).json({ error: 'task not found' });
      return;
    }
    if (task.status === 'queued') durableTaskQueue.enqueue(task);
    res.json({ task });
  } catch (error) {
    next(error);
  }
});

tasksRouter.patch('/:taskId', async (req, res, next) => {
  try {
    const patch: { status?: DelegatedTaskStatus; log?: string } = {};
    if (req.body?.status) patch.status = req.body.status;
    if (req.body?.log || req.body?.notes) patch.log = req.body.log || req.body.notes;

    const task = await updateDelegatedTask(req.params.taskId, patch);
    if (!task) {
      res.status(404).json({ error: 'task not found' });
      return;
    }
    if (task.status === 'queued') durableTaskQueue.enqueue(task);
    res.json({ task });
  } catch (error) {
    next(error);
  }
});
