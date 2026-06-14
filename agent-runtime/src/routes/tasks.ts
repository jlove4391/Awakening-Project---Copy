import { Router } from 'express';
import { durableTaskQueue } from '../tasks/queue.js';
import {
  approveExecutionPlanStep,
  createDelegatedTask,
  getDelegatedTask,
  getDelegatedTaskUiState,
  listDelegatedTasks,
  updateDelegatedTask,
} from '../tasks/store.js';
import type { ApprovalRequirement, DelegatedTask, DelegatedTaskStatus } from '../tasks/types.js';

export const tasksRouter = Router();

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}


function taskResponse(task: DelegatedTask, queuedTaskIds = durableTaskQueue.snapshot()) {
  const taskState = getDelegatedTaskUiState(task, queuedTaskIds);
  return {
    task: {
      ...task,
      uiState: taskState,
    },
    taskState,
    queuedTaskIds,
  };
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
    const queuedTaskIds = durableTaskQueue.snapshot();
    const tasks = await listDelegatedTasks(includeAllSessions ? undefined : sessionId);
    res.json({
      tasks: tasks.map((task) => ({ ...task, uiState: getDelegatedTaskUiState(task, queuedTaskIds) })),
      taskStates: tasks.map((task) => getDelegatedTaskUiState(task, queuedTaskIds)),
      queuedTaskIds,
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
    res.json(taskResponse(task));
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
      executionPlan,
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
      executionPlan: Array.isArray(executionPlan) ? executionPlan : undefined,
    });

    res.status(201).json(taskResponse(task));
  } catch (error) {
    next(error);
  }
});


tasksRouter.post('/:taskId/steps/:stepId/approve', async (req, res, next) => {
  try {
    if (req.body?.confirmedByUser !== true) {
      res.status(400).json({ error: 'confirmedByUser=true is required to approve a pending step action' });
      return;
    }
    const task = await approveExecutionPlanStep(req.params.taskId, req.params.stepId, String(req.body?.approver || 'user'), String(req.body?.note || ''));
    if (!task) {
      res.status(404).json({ error: 'task or step not found' });
      return;
    }
    if (task.status === 'queued') durableTaskQueue.enqueue(task);
    res.json(taskResponse(task));
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

    res.json(taskResponse(task));
  } catch (error) {
    next(error);
  }
});
