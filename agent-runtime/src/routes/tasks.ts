import { Router, type RequestHandler } from 'express';
import { durableTaskQueue } from '../tasks/queue.js';
import { cancelActiveNexoraCommand } from '../workers/nexora/localWorker.js';
import {
  appendDelegatedTaskEvent,
  approveDelegatedTask,
  approveExecutionPlanStep,
  createDelegatedTask,
  getDelegatedTask,
  getDelegatedTaskUiState,
  listDelegatedTasks,
  updateDelegatedTask,
} from '../tasks/store.js';
import type { ApprovalRequirement, DelegatedTask, DelegatedTaskEventType, DelegatedTaskStatus, TaskAuditEntry } from '../tasks/types.js';

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


function taskEventType(value: unknown): DelegatedTaskEventType {
  const type = String(value || 'task.log') as DelegatedTaskEventType;
  const supported: DelegatedTaskEventType[] = [
    'task.log',
    'task.current_step_changed',
    'task.command_output_chunk',
    'task.approval_needed',
    'task.provider_blocked',
    'task.completion_receipt',
    'task.approval_requested',
    'task.blocked',
  ];
  return supported.includes(type) ? type : 'task.log';
}

function taskEventActor(value: unknown): TaskAuditEntry['actor'] {
  const actor = String(value || 'system') as TaskAuditEntry['actor'];
  return ['elora', 'nexora', 'kaz', 'jynx', 'kalyra', 'system', 'user'].includes(actor) ? actor : 'system';
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
      timeoutMs,
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
      timeoutMs: Number.isFinite(Number(timeoutMs)) ? Number(timeoutMs) : undefined,
    });

    res.status(201).json(taskResponse(task));
  } catch (error) {
    next(error);
  }
});



tasksRouter.post('/:taskId/events', async (req, res, next) => {
  try {
    const eventType = taskEventType(req.body?.type || req.body?.eventType);
    const summary = String(req.body?.summary || req.body?.message || '').trim();
    if (!summary) {
      res.status(400).json({ error: 'summary is required' });
      return;
    }

    const details = req.body?.details && typeof req.body.details === 'object' && !Array.isArray(req.body.details) ? req.body.details : undefined;
    const task = await appendDelegatedTaskEvent(req.params.taskId, eventType, summary, {
      actor: taskEventActor(req.body?.actor),
      details,
      log: eventType === 'task.log' || req.body?.log === true,
    });
    if (!task) {
      res.status(404).json({ error: 'task not found' });
      return;
    }
    res.status(201).json(taskResponse(task));
  } catch (error) {
    next(error);
  }
});

const approveTask: RequestHandler<{ taskId: string }> = async (req, res, next) => {
  try {
    if (req.body?.confirmedByUser !== true) {
      res.status(400).json({ error: 'confirmedByUser=true is required to approve a pending task' });
      return;
    }
    const task = await approveDelegatedTask(req.params.taskId, String(req.body?.approver || 'user'), String(req.body?.note || ''));
    if (!task) {
      res.status(404).json({ error: 'task not found' });
      return;
    }
    if (task.status === 'queued') durableTaskQueue.enqueue(task);
    res.json(taskResponse(task));
  } catch (error) {
    next(error);
  }
};

tasksRouter.post('/:taskId/approve', approveTask);
tasksRouter.post('/:taskId/approval', approveTask);

const cancellationReason = (value: unknown, fallback: string) => String(value || fallback);

const approvalDenialReason = (value: unknown) => {
  const note = String(value || '').trim();
  return note ? `Denied by user during approval flow: ${note}` : 'Denied by user during approval flow';
};

const cancelTaskWithReason = async (taskId: string, reason: string) => {
  cancelActiveNexoraCommand(taskId, reason);
  return durableTaskQueue.cancel(taskId, reason, 'user');
};

const approveStep: RequestHandler<{ taskId: string; stepId: string }> = async (req, res, next) => {
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
};

tasksRouter.post('/:taskId/steps/:stepId/approve', approveStep);
tasksRouter.post('/:taskId/steps/:stepId/approval', approveStep);


const denyTask: RequestHandler<{ taskId: string }> = async (req, res, next) => {
  try {
    const reason = approvalDenialReason(req.body?.reason || req.body?.note);
    const task = await cancelTaskWithReason(req.params.taskId, reason);
    if (!task) {
      res.status(404).json({ error: 'task not found' });
      return;
    }
    res.json(taskResponse(task));
  } catch (error) {
    next(error);
  }
};

tasksRouter.post('/:taskId/deny', denyTask);
tasksRouter.post('/:taskId/reject', denyTask);

const denyStep: RequestHandler<{ taskId: string; stepId: string }> = async (req, res, next) => {
  try {
    const existing = await getDelegatedTask(req.params.taskId);
    const step = existing?.executionPlan?.find((candidate) => candidate.id === req.params.stepId);
    if (!existing || !step) {
      res.status(404).json({ error: 'task or step not found' });
      return;
    }

    const reason = approvalDenialReason(req.body?.reason || req.body?.note);
    const task = await cancelTaskWithReason(req.params.taskId, reason);
    if (!task) {
      res.status(404).json({ error: 'task or step not found' });
      return;
    }
    res.json(taskResponse(task));
  } catch (error) {
    next(error);
  }
};

tasksRouter.post('/:taskId/steps/:stepId/deny', denyStep);
tasksRouter.post('/:taskId/steps/:stepId/reject', denyStep);

tasksRouter.post('/:taskId/cancel', async (req, res, next) => {
  try {
    const reason = cancellationReason(req.body?.reason, 'Task cancellation requested.');
    const task = await cancelTaskWithReason(req.params.taskId, reason);
    if (!task) {
      res.status(404).json({ error: 'task not found' });
      return;
    }
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
