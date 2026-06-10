// src/executors/registry.ts
import { Task } from "../../shared/types";
import { readFile, writeFile } from "../workers/fs";

export async function executeTask(task: Task): Promise<unknown> {
  switch (task.kind) {
    case "fs.write":
      return writeFile(task as Task<"fs.write">);

    case "fs.read":
      return readFile(task as Task<"fs.read">);

    case "system.echo":
      // Echo is a safe test task. It returns the message it received.
      return { ok: true, message: (task as Task<"system.echo">).payload.message };

    case "fs.append":
      throw new Error("fs.append is not implemented yet.");

    case "fs.delete":
      throw new Error("fs.delete is not implemented yet.");

    default:
      throw new Error(`Unsupported task kind: ${(task as Task).kind}`);
  }
}
