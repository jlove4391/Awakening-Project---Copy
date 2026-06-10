// shared/types.ts

export type TaskKind = "fs.write" | "fs.read" | "fs.append" | "fs.delete" | "system.echo";
export type TaskStatus = "queued" | "running" | "success" | "error" | "cancelled";
export type AuditStatus = "not_started" | "pending" | "written" | "failed";

export interface TaskError {
  message: string;
  stack?: string;
}

export interface TaskTimestamps {
  created: number;
  started?: number;
  finished?: number;
}

export interface AuditRecordReference {
  id: string;
  path?: string;
  writtenAt?: number;
  status: AuditStatus;
  error?: string;
}

export interface ExecutionReceipt {
  id: string;
  taskId: string;
  taskKind: TaskKind;
  status: TaskStatus;
  createdAt: number;
  finishedAt?: number;
  summary: string;
  proof: {
    auditId?: string;
    result?: unknown;
    error?: TaskError;
  };
}

export type PayloadMap = {
  "fs.write": { path: string; content: string; overwrite?: boolean };
  "fs.read": { path: string };
  "fs.append": { path: string; content: string };
  "fs.delete": { path: string };
  "system.echo": { message: string };
};

export interface Task<K extends TaskKind = TaskKind> {
  id: string;
  owner: string;
  createdBy: string;
  kind: K;
  status: TaskStatus;
  payload: PayloadMap[K];
  result?: unknown;
  error?: TaskError;
  timestamps: TaskTimestamps;
  logs: string[];
  audit?: AuditRecordReference;
  receipt?: ExecutionReceipt;
}
