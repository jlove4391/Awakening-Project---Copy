export interface NexoraExecutionPlanCommand {
  command: string;
  workingDirectory?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface NexoraExecutionRequest extends NexoraExecutionPlanCommand {
  taskId: string;
  stepId?: string;
  confirmedByUser?: boolean;
  approvalNote?: string;
}

export interface NexoraCommandPolicyDecision {
  ok: boolean;
  reason?: string;
  normalizedCommand?: string;
  executable?: string;
  args?: string[];
  cwd?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface NexoraCommandLogChunk {
  stream: 'stdout' | 'stderr' | 'system';
  text: string;
  at: string;
}

export interface NexoraCommandResult {
  ok: boolean;
  status: 'completed' | 'failed' | 'blocked' | 'timed_out' | 'cancelled';
  taskId: string;
  command: string;
  cwd: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  stdout: string;
  stderr: string;
  logs: NexoraCommandLogChunk[];
  policy: NexoraCommandPolicyDecision;
  error?: { message: string };
}
