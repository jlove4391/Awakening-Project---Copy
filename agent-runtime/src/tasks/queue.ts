import { taskEvents } from './events.js';
import { cancelDelegatedTask, getDelegatedTask, listDelegatedTasks, resumeDelegatedTask, updateDelegatedTask } from './store.js';
import { nexoraWorkOrderExecutionWorker } from './nexoraWorkOrderWorker.js';
import { prepareNexoraWorkOrderForRecovery } from './workOrders.js';
import type { DelegatedTask } from './types.js';

export type DelegatedTaskHandlerResult = boolean | void;
export type DelegatedTaskHandler = (task: DelegatedTask) => Promise<DelegatedTaskHandlerResult>;

function taskNeedsSafeDemoWorker(task: DelegatedTask) {
  const objective = task.objective.toLowerCase();
  const requiredTools = task.requiredTools.map((tool) => tool.toLowerCase());
  return (
    objective.includes('safe demo') ||
    objective.includes('delegation smoke') ||
    requiredTools.includes('nexora.demo.complete') ||
    requiredTools.includes('delegation.smoke.safe_demo')
  );
}

async function completeSafeDemoTask(task: DelegatedTask) {
  await updateDelegatedTask(task.id, {
    status: 'completed',
    result: {
      ok: true,
      summary: 'Nexora completed the safe local delegation smoke task.',
      data: {
        handledBy: 'nexora.safe-demo-worker',
        objective: task.objective,
        constraints: task.constraints,
        requiredTools: task.requiredTools,
        approvalRequirements: task.approvalRequirements,
      },
    },
    log: 'Nexora safe demo worker completed the task without external side effects.',
    event: {
      type: 'task.completed',
      actor: 'nexora',
      summary: 'Nexora safe demo worker recorded terminal completion.',
      details: {
        worker: 'nexora.safe-demo-worker',
        safeLocalOnly: true,
      },
    },
  });
}

class DurableTaskQueue {
  private pendingIds: string[] = [];
  private active = false;
  private handlers: DelegatedTaskHandler[] = [];

  setHandler(handler: DelegatedTaskHandler) {
    this.handlers = [handler];
  }

  addHandler(handler: DelegatedTaskHandler) {
    this.handlers.push(handler);
  }

  clearHandlers() {
    this.handlers = [];
  }

  enqueue(task: DelegatedTask | string) {
    const taskId = typeof task === 'string' ? task : task.id;
    this.addPendingId(taskId);
  }

  async enqueueById(taskId: string, note = 'Queued by task ID after missing approval/configuration was satisfied.') {
    const task = await getDelegatedTask(taskId);
    if (!task) return undefined;

    const queueableTask = task.status === 'blocked' ? await resumeDelegatedTask(taskId, 'system', note) : task;
    if (queueableTask?.status === 'queued') this.addPendingId(taskId);
    return queueableTask;
  }

  private addPendingId(taskId: string) {
    if (!this.pendingIds.includes(taskId)) this.pendingIds.push(taskId);
    this.run().catch(() => undefined);
  }

  snapshot() {
    return [...this.pendingIds];
  }

  async cancel(taskId: string, reason = 'Task cancellation requested.', actor: 'system' | 'user' = 'user') {
    this.pendingIds = this.pendingIds.filter((id) => id !== taskId);
    return cancelDelegatedTask(taskId, actor, reason);
  }

  private async run() {
    if (this.active) return;
    this.active = true;
    try {
      while (this.pendingIds.length) {
        const taskId = this.pendingIds.shift()!;
        await this.process(taskId).catch(async (error) => {
          await updateDelegatedTask(taskId, {
            status: 'failed',
            result: {
              ok: false,
              summary: error instanceof Error ? error.message : String(error),
              error: error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) },
            },
          });
        });
      }
    } finally {
      this.active = false;
    }
  }

  private async process(taskId: string) {
    const task = await getDelegatedTask(taskId);
    if (!task || task.status !== 'queued') return;

    await updateDelegatedTask(task.id, {
      status: 'running',
      event: {
        type: 'task.started',
        actor: 'system',
        summary: task.assignedAgent === 'nexora'
          ? 'Durable queue dispatched the task to the Nexora work-order worker.'
          : `Durable queue dispatched the bounded ${task.assignedAgent} specialist call.`,
      },
    });

    const latest = await getDelegatedTask(task.id);
    if (!latest || latest.status === 'cancelled') return;

    for (const handler of this.handlers) {
      const handled = await handler(latest);
      const afterHandler = await getDelegatedTask(task.id);
      if (afterHandler?.status === 'cancelled') return;
      if (handled !== false) return;
    }

    await updateDelegatedTask(task.id, {
      status: 'blocked',
      blockedReason: 'worker_unavailable',
      log: `No execution worker is configured for ${task.assignedAgent}; the specialist call is durably recorded and awaiting an implementation or explicit deferral.`,
      event: {
        type: 'task.blocked',
        actor: 'system',
        summary: `Task is blocked until an execution worker for ${task.assignedAgent} is configured.`,
      },
    });
  }
}

export const durableTaskQueue = new DurableTaskQueue();

export const nexoraSafeDemoWorker: DelegatedTaskHandler = async (task) => {
  if (!taskNeedsSafeDemoWorker(task)) return false;
  await completeSafeDemoTask(task);
  return true;
};

durableTaskQueue.addHandler(nexoraSafeDemoWorker);
durableTaskQueue.addHandler(nexoraWorkOrderExecutionWorker);

export async function enqueuePersistedQueuedTasks() {
  const tasks = await listDelegatedTasks();
  const queuedTasks: DelegatedTask[] = [];

  for (const task of tasks) {
    if (task.status === 'queued') {
      queuedTasks.push(task);
      continue;
    }
    if (task.assignedAgent === 'nexora' && task.status === 'running') {
      await prepareNexoraWorkOrderForRecovery(task);
      const resumed = await resumeDelegatedTask(task.id, 'system', 'Recovered interrupted Nexora work after runtime restart; completed plan steps will not be repeated.');
      if (resumed?.status === 'queued') queuedTasks.push(resumed);
    }
  }

  queuedTasks.forEach((task) => durableTaskQueue.enqueue(task));
  return queuedTasks;
}

// Automatically queue tasks once approval requirements are satisfied.
taskEvents.on('task.created', (task: DelegatedTask) => {
  if (task.status === 'queued') durableTaskQueue.enqueue(task);
});

taskEvents.on('task.updated', (task: DelegatedTask) => {
  if (task.status === 'queued') durableTaskQueue.enqueue(task);
});
