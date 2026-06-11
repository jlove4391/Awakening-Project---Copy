import { Router } from 'express';
import { durableTaskQueue } from '../tasks/queue.js';
import { createDelegatedTask, getDelegatedTask, listDelegatedTasks, updateDelegatedTask } from '../tasks/store.js';
import type { ApprovalRequirement, DelegatedTaskStatus } from '../tasks/types.js';

export const tasksRouter = Router();

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

function approvalRequirementArray(value: unknown): Array<Partial<ApprovalRequirement> | string> {
  if (!Array.isArray(value)) {
    if (typeof value === 'string') return stringArray(value);
    return [];
  }
  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (!item || typeof item !== 'object') return '';
      const requirement = item as Record<string, unknown>;
      return {
        required: typeof requirement.required === 'boolean' ? requirement.required : undefined,
        status: typeof requirement.status === 'string' ? (requirement.status as ApprovalRequirement['status']) : undefined,
        approver: typeof requirement.approver === 'string' ? requirement.approver : undefined,
        approvedAt: typeof requirement.approvedAt === 'string' ? requirement.approvedAt : undefined,
        rejectedAt: typeof requirement.rejectedAt === 'string' ? requirement.rejectedAt : undefined,
        note: typeof requirement.note === 'string' ? requirement.note : undefined,
        reason: typeof requirement.reason === 'string' ? requirement.reason : undefined,
      } satisfies Partial<ApprovalRequirement>;
    })
    .filter((item) => (typeof item === 'string' ? Boolean(item) : Boolean(item.reason || item.note || item.approver || item.status)));
}

tasksRouter.get('/', async (req, res, next) => {
  try {
    const sessionId = String(req.query.sessionId || 'default');
    const includeAllSessions = req.query.includeAllSessions === 'true';
    res.json({
      tasks: await listDelegatedTasks(includeAllSessions ? undefined : sessionId),
      queuedTaskIds: durableTaskQueue.snapshot(),
    });
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
    const {
      sessionId = 'default',
      objective,
      title,
      constraints,
      requiredTools,
      approvalRequirements,
      initialLog,
      notes,
    } = req.body || {};
    const taskObjective = String(objective || title || '').trim();
    if (!taskObjective) {
      res.status(400).json({ error: 'objective is required' });
      return;
    }

    const task = await createDelegatedTask({
      sessionId: String(sessionId),
      objective: taskObjective,
      constraints: stringArray(constraints),
      requiredTools: stringArray(requiredTools),
      approvalRequirements: approvalRequirementArray(approvalRequirements),
      initialLog: String(initialLog || notes || '').trim() || undefined,
    });

    res.status(201).json({ task, queuedTaskIds: durableTaskQueue.snapshot() });
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

    res.json({ task, queuedTaskIds: durableTaskQueue.snapshot() });
  } catch (error) {
    next(error);
  }
});
