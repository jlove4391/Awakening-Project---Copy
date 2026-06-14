import { EventEmitter } from 'node:events';
import type { DelegatedTask, DelegatedTaskEvent, DelegatedTaskUiState } from './types.js';

export type TaskRuntimeEvent =
  | { type: 'task.created'; task: DelegatedTask; taskState: DelegatedTaskUiState }
  | { type: 'task.updated'; task: DelegatedTask; taskState: DelegatedTaskUiState; event?: DelegatedTaskEvent }
  | { type: 'task.finished'; task: DelegatedTask; taskState: DelegatedTaskUiState };

export interface TaskRuntimeEventPayload {
  task: DelegatedTask;
  taskState: DelegatedTaskUiState;
  event?: DelegatedTaskEvent;
}

class TaskEventBus extends EventEmitter {
  emitTaskCreated(task: DelegatedTask, taskState: DelegatedTaskUiState) {
    this.emit('task.created', task, taskState);
    this.emit('task.event', { type: 'task.created', task, taskState } satisfies TaskRuntimeEvent);
  }

  emitTaskUpdated(task: DelegatedTask, event?: DelegatedTaskEvent, taskState?: DelegatedTaskUiState) {
    const payloadState = taskState || ({ taskId: task.id, status: task.status, approvalStatus: 'not_required', queueStatus: 'not_queued' } satisfies DelegatedTaskUiState);
    this.emit('task.updated', task, event, payloadState);
    this.emit('task.event', { type: 'task.updated', task, taskState: payloadState, event } satisfies TaskRuntimeEvent);
  }

  emitTaskFinished(task: DelegatedTask, taskState: DelegatedTaskUiState) {
    this.emit('task.finished', task, taskState);
    this.emit('task.event', { type: 'task.finished', task, taskState } satisfies TaskRuntimeEvent);
  }
}

export const taskEvents = new TaskEventBus();
