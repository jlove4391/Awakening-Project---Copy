import { EventEmitter } from 'node:events';
import type { DelegatedTask, DelegatedTaskEvent, DelegatedTaskUiState } from './types.js';

export type TaskRuntimeEvent =
  | { type: 'task.created'; task: DelegatedTask; taskState: DelegatedTaskUiState }
  | { type: 'task.updated'; task: DelegatedTask; taskState: DelegatedTaskUiState; event?: DelegatedTaskEvent }
  | { type: 'task.log'; task: DelegatedTask; taskState: DelegatedTaskUiState; event: DelegatedTaskEvent }
  | { type: 'task.current_step_changed'; task: DelegatedTask; taskState: DelegatedTaskUiState; event: DelegatedTaskEvent }
  | { type: 'task.command_output_chunk'; task: DelegatedTask; taskState: DelegatedTaskUiState; event: DelegatedTaskEvent }
  | { type: 'task.approval_needed'; task: DelegatedTask; taskState: DelegatedTaskUiState; event: DelegatedTaskEvent }
  | { type: 'task.provider_blocked'; task: DelegatedTask; taskState: DelegatedTaskUiState; event: DelegatedTaskEvent }
  | { type: 'task.completion_receipt'; task: DelegatedTask; taskState: DelegatedTaskUiState; event: DelegatedTaskEvent }
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
    if (event && isRuntimeEventType(event.eventType)) {
      this.emit(event.eventType, task, event, payloadState);
      this.emit('task.event', { type: event.eventType, task, taskState: payloadState, event } satisfies TaskRuntimeEvent);
    }
  }

  emitTaskFinished(task: DelegatedTask, taskState: DelegatedTaskUiState) {
    this.emit('task.finished', task, taskState);
    this.emit('task.event', { type: 'task.finished', task, taskState } satisfies TaskRuntimeEvent);
  }
}

function isRuntimeEventType(type: DelegatedTaskEvent['eventType']): type is Extract<TaskRuntimeEvent['type'], DelegatedTaskEvent['eventType']> {
  return [
    'task.log',
    'task.current_step_changed',
    'task.command_output_chunk',
    'task.approval_needed',
    'task.provider_blocked',
    'task.completion_receipt',
  ].includes(type);
}

export const taskEvents = new TaskEventBus();
