import { taskEvents } from './events.js';
import { getDelegatedTask, listDelegatedTasks, resumeDelegatedTask, updateDelegatedTask } from './store.js';
import { nexoraToolExecutionWorker } from './nexoraWorker.js';
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
        summary: 'Durable queue dispatched task to Nexora.',
      },
    });

    const latest = await getDelegatedTask(task.id);
    if (!latest) return;

    for (const handler of this.handlers) {
      const handled = await handler(latest);
      if (handled !== false) return;
    }

    await updateDelegatedTask(task.id, {
      status: 'blocked',
      blockedReason: 'worker_unavailable',
      log: 'No Nexora worker handler is configured for this task yet; task is durably recorded and awaiting worker pickup.',
      event: {
        type: 'task.blocked',
        actor: 'system',
        summary: 'Task is blocked until a Nexora worker handler is configured.',
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
durableTaskQueue.addHandler(nexoraToolExecutionWorker);

export async function enqueuePersistedQueuedTasks() {
  const queuedTasks = (await listDelegatedTasks()).filter((task) => task.status === 'queued');
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
