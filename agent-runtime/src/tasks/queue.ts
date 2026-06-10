import { taskEvents } from './events.js';
import { getDelegatedTask, updateDelegatedTask } from './store.js';
import type { DelegatedTask } from './types.js';

export type DelegatedTaskHandler = (task: DelegatedTask) => Promise<void>;

class DurableTaskQueue {
  private pendingIds: string[] = [];
  private active = false;
  private handler?: DelegatedTaskHandler;

  setHandler(handler: DelegatedTaskHandler) {
    this.handler = handler;
  }

  enqueue(task: DelegatedTask | string) {
    const taskId = typeof task === 'string' ? task : task.id;
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

    if (this.handler) {
      const latest = await getDelegatedTask(task.id);
      if (latest) await this.handler(latest);
      return;
    }

    await updateDelegatedTask(task.id, {
      status: 'blocked',
      log: 'No Nexora worker handler is configured yet; task is durably recorded and awaiting worker pickup.',
      event: {
        type: 'task.blocked',
        actor: 'system',
        summary: 'Task is blocked until a Nexora worker handler is configured.',
      },
    });
  }
}

export const durableTaskQueue = new DurableTaskQueue();

// Automatically queue tasks once approval requirements are satisfied.
taskEvents.on('task.created', (task: DelegatedTask) => {
  if (task.status === 'queued') durableTaskQueue.enqueue(task);
});

taskEvents.on('task.updated', (task: DelegatedTask) => {
  if (task.status === 'queued') durableTaskQueue.enqueue(task);
});
