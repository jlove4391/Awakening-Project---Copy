import { EventEmitter } from 'node:events';
import type { DelegatedTask, DelegatedTaskEvent } from './types.js';

export type TaskRuntimeEvent =
  | { type: 'task.created'; task: DelegatedTask }
  | { type: 'task.updated'; task: DelegatedTask; event?: DelegatedTaskEvent }
  | { type: 'task.finished'; task: DelegatedTask };

class TaskEventBus extends EventEmitter {
  emitTaskCreated(task: DelegatedTask) {
    this.emit('task.created', task);
    this.emit('task.event', { type: 'task.created', task } satisfies TaskRuntimeEvent);
  }

  emitTaskUpdated(task: DelegatedTask, event?: DelegatedTaskEvent) {
    this.emit('task.updated', task, event);
    this.emit('task.event', { type: 'task.updated', task, event } satisfies TaskRuntimeEvent);
  }

  emitTaskFinished(task: DelegatedTask) {
    this.emit('task.finished', task);
    this.emit('task.event', { type: 'task.finished', task } satisfies TaskRuntimeEvent);
  }
}

export const taskEvents = new TaskEventBus();
