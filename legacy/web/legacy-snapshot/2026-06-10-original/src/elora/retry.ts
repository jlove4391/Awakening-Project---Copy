// frontend/src/elora/retry.ts
import { createTask } from "../lib/bridge";

export function retryAsNexora(prevTask: { kind: string; payload: any }) {
  return createTask(prevTask.kind as any, prevTask.payload);
}
