// src/receipts/executionReceipt.ts
import { randomUUID } from "crypto";

import { ExecutionReceipt, Task } from "../../shared/types";

export function createExecutionReceipt(task: Task): ExecutionReceipt {
  const receipt: ExecutionReceipt = {
    id: randomUUID(),
    taskId: task.id,
    taskKind: task.kind,
    status: task.status,
    createdAt: task.timestamps.created,
    finishedAt: task.timestamps.finished,
    summary: `Task ${task.kind} finished with status ${task.status}.`,
    proof: {},
  };

  // The audit ID connects this receipt back to the permanent proof notebook.
  if (task.audit) {
    receipt.proof.auditId = task.audit.id;
  }

  // Only include result proof when the worker actually returned a result.
  if (typeof task.result !== "undefined") {
    receipt.proof.result = task.result;
  }

  // Only include error proof when the task failed with an error.
  if (task.error) {
    receipt.proof.error = task.error;
  }

  return receipt;
}
