// src/audit/auditLogger.ts
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

import { AuditRecordReference, Task } from "../../shared/types";

const DATA_DIR = path.resolve(process.cwd(), "data");
const AUDIT_LOG_PATH = path.join(DATA_DIR, "audit.log");

interface AuditLogRecord {
  id: string;
  taskId: string;
  taskKind: Task["kind"];
  taskStatus: Task["status"];
  owner: string;
  createdBy: string;
  loggedAt: number;
  timestamps: Task["timestamps"];
  result?: unknown;
  error?: Task["error"];
}

export async function writeAuditRecord(task: Task): Promise<AuditRecordReference> {
  const id = randomUUID();
  const loggedAt = Date.now();

  const record: AuditLogRecord = {
    id,
    taskId: task.id,
    taskKind: task.kind,
    taskStatus: task.status,
    owner: task.owner,
    createdBy: task.createdBy,
    loggedAt,
    timestamps: task.timestamps,
    result: task.result,
    error: task.error,
  };

  try {
    // Make sure the data folder exists before writing the proof line.
    await fs.mkdir(DATA_DIR, { recursive: true });

    // One JSON record per line makes the log easy to scan and easy to parse later.
    await fs.appendFile(AUDIT_LOG_PATH, `${JSON.stringify(record)}\n`, "utf8");

    return {
      id,
      path: AUDIT_LOG_PATH,
      writtenAt: loggedAt,
      status: "written",
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    return {
      id,
      path: AUDIT_LOG_PATH,
      writtenAt: loggedAt,
      status: "failed",
      error: `Audit log write failed: ${message}`,
    };
  }
}
