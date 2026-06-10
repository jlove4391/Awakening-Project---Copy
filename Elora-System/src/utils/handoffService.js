// src/utils/handoffService.js

let taskQueue = [];

export function routeToAI(target, task) {
  taskQueue.push({
    target: target.toLowerCase(),
    task,
    timestamp: Date.now()
  });
}

export function fetchNextTask(persona) {
  const index = taskQueue.findIndex(t => t.target === persona.toLowerCase());
  if (index !== -1) {
    const task = taskQueue[index];
    taskQueue.splice(index, 1); // Remove from queue
    return task.task;
  }
  return null;
}
