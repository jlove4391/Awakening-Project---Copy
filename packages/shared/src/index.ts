export type RuntimeAgentName = 'elora' | 'nexora';

export interface ToolInvocation {
  id: string;
  toolName: string;
  input: unknown;
  startedAt: string;
  finishedAt?: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  output?: unknown;
  error?: { message: string; stack?: string };
}

export type RuntimeEventType =
  | 'agent.message'
  | 'tool.invocation.created'
  | 'tool.invocation.updated'
  | 'task.created'
  | 'task.updated'
  | 'task.finished';

export interface RuntimeEvent<TPayload = unknown> {
  id: string;
  type: RuntimeEventType;
  occurredAt: string;
  source: RuntimeAgentName | 'system' | 'user';
  payload: TPayload;
}

export type DelegatedTaskStatus =
  | 'queued'
  | 'pending_approval'
  | 'running'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type DelegatedTaskEventType =
  | 'task.created'
  | 'task.queued'
  | 'task.approval_requested'
  | 'task.approved'
  | 'task.rejected'
  | 'task.started'
  | 'task.blocked'
  | 'task.log'
  | 'task.result_recorded'
  | 'task.completed'
  | 'task.failed'
  | 'task.cancelled'
  | 'task.receipt_created';

export type ApprovalRequirementStatus = 'not_required' | 'pending' | 'approved' | 'rejected';

export interface ApprovalRequirement {
  required: boolean;
  status: ApprovalRequirementStatus;
  approver?: string;
  approvedAt?: string;
  rejectedAt?: string;
  note?: string;
  reason?: string;
}

export interface TaskAuditEntry {
  id: string;
  taskId: string;
  eventType: DelegatedTaskEventType;
  actor: RuntimeAgentName | 'system' | 'user';
  occurredAt: string;
  summary: string;
  details?: Record<string, unknown>;
}

export interface DelegatedTaskEvent extends TaskAuditEntry {}

export interface TaskReceipt {
  id: string;
  taskId: string;
  parentAgent: RuntimeAgentName;
  assignedAgent: RuntimeAgentName;
  status: DelegatedTaskStatus;
  createdAt: string;
  finishedAt?: string;
  summary: string;
  proof: {
    auditTrail: TaskAuditEntry[];
    result?: unknown;
    error?: { message: string; stack?: string };
  };
}

export interface DelegatedTaskResult {
  ok: boolean;
  summary: string;
  data?: unknown;
  error?: { message: string; stack?: string };
}

export interface DelegatedTask {
  id: string;
  sessionId: string;
  parentAgent: 'elora';
  assignedAgent: 'nexora';
  objective: string;
  constraints: string[];
  requiredTools: string[];
  approvalRequirements: ApprovalRequirement[];
  status: DelegatedTaskStatus;
  logs: string[];
  events: DelegatedTaskEvent[];
  result?: DelegatedTaskResult;
  receipt?: TaskReceipt;
  auditTrail: TaskAuditEntry[];
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface CreateDelegatedTaskInput {
  sessionId: string;
  objective: string;
  constraints?: string[];
  requiredTools?: string[];
  approvalRequirements?: Array<Partial<ApprovalRequirement> | string>;
  initialLog?: string;
}

export interface UpdateDelegatedTaskInput {
  status?: DelegatedTaskStatus;
  log?: string;
  result?: DelegatedTaskResult;
  event?: {
    type?: DelegatedTaskEventType;
    actor?: RuntimeAgentName | 'system' | 'user';
    summary: string;
    details?: Record<string, unknown>;
  };
}
