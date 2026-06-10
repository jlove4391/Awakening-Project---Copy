// src/queue/JobQueue.ts
import { EventEmitter } from "events";
import { Task, TaskStatus } from "../../shared/types";
import { writeAuditRecord } from "../audit/auditLogger";
import { executeTask } from "../executors/registry";
import { createExecutionReceipt } from "../receipts/executionReceipt";

export class JobQueue {
  private q: Task[] = [];
  private active = false;
  public events = new EventEmitter(); // emits: task.update, task.created, task.finished

  enqueue(task: Task) {
    this.q.push(task);
    this.events.emit("task.created", task);
    this.run();
  }

  snapshot() {
    return [...this.q];
  }

  private async run() {
    if (this.active) return;
    this.active = true;

    while (this.q.length) {
      const task = this.q[0];
      await this.process(task).catch(() => void 0);
      this.q.shift();
    }
    this.active = false;
  }

  private async process(task: Task) {
    this.update(task, "running");

    try {
      const result = await executeTask(task);
      task.result = result;
      this.update(task, "success");
    } catch (err: any) {
      task.error = { message: err?.message ?? String(err), stack: err?.stack };
      this.update(task, "error");
    } finally {
      // Save proof first, then build the receipt Elora can show Jordan.
      task.audit = await writeAuditRecord(task);
      task.receipt = createExecutionReceipt(task);
      this.events.emit("task.finished", task);
    }
  }

  private update(task: Task, status: TaskStatus) {
    task.status = status;
    const now = Date.now();
    if (status === "running") task.timestamps.started = now;
    if (status === "success" || status === "error" || status === "cancelled") {
      task.timestamps.finished = now;
    }
    this.events.emit("task.update", task);
  }
}

export const Jobs = new JobQueue();
