// shared/types.ts
export type Persona = "Elora" | "Nexora";

export type TaskKind =
  | "fs.write"
  | "fs.read"
  | "code.search"
  | "code.refactor"
  | "generic";

export type TaskStatus = "queued" | "running" | "success" | "error" | "cancelled";

export interface TaskPayloads {
  "fs.write": { path: string; content: string; overwrite?: boolean };
  "fs.read": { path: string };
  "code.search": { query: string; globs?: string[] };
  "code.refactor": { description: string };
  "generic": Record<string, unknown>;
}

export interface Task<T extends TaskKind = TaskKind> {
  id: string;
  kind: T;
  owner: Persona;          // "Nexora"
  createdBy: Persona;      // "Elora"
  status: TaskStatus;
  payload: TaskPayloads[T];
  result?: unknown;
  error?: { message: string; stack?: string };
  timestamps: {
    created: number;
    started?: number;
    finished?: number;
  };
  logs: string[];
}
