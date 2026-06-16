export type RuntimeAgentName = 'elora' | 'nexora' | 'kaz' | 'jynx' | 'kalyra';

export type DelegatedTaskStatus = 'queued' | 'pending_approval' | 'running' | 'blocked' | 'completed' | 'failed' | 'cancelled';

export type DelegatedTaskBlockedReason = 'step_approval_required' | 'provider_configuration_required' | 'worker_unavailable' | 'policy_block' | 'unknown';

export type DelegatedTaskEventType =
  | 'task.created'
  | 'task.queued'
  | 'task.resumed'
  | 'task.approval_requested'
  | 'task.approved'
  | 'task.rejected'
  | 'task.started'
  | 'task.blocked'
  | 'task.approval_needed'
  | 'task.provider_blocked'
  | 'task.current_step_changed'
  | 'task.command_output_chunk'
  | 'task.completion_receipt'
  | 'task.log'
  | 'task.result_recorded'
  | 'task.completed'
  | 'task.failed'
  | 'task.cancelled'
  | 'task.cancellation_requested'
  | 'task.timeout'
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

export interface DelegatedTaskLogReference {
  path: string;
  byteLength: number;
  sha256?: string;
}

export interface DelegatedTaskCommandOutputSummary {
  stream?: 'stdout' | 'stderr' | 'combined';
  textPreview: string;
  byteLength: number;
  truncated: boolean;
  fullLog?: DelegatedTaskLogReference;
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

export type ExecutionPlanStepApprovalStatus = 'not_required' | 'pending' | 'approved' | 'rejected';

export type ExecutionPlanStepStatus = 'queued' | 'running' | 'blocked' | 'completed' | 'failed' | 'skipped' | 'cancelled';

export interface ExecutionPlanStepApproval {
  required: boolean;
  status: ExecutionPlanStepApprovalStatus;
  approver?: string;
  approvedAt?: string;
  rejectedAt?: string;
  note?: string;
  reason?: string;
}

export interface PendingToolAction {
  stepId: string;
  toolName: string;
  riskLevel?: string;
  action?: string;
  arguments?: unknown;
  argumentTemplate?: unknown;
  approvalStatus: ExecutionPlanStepApprovalStatus;
  reason: string;
}

export interface ExecutionPlanStep {
  id: string;
  order: number;
  targetTool: string;
  arguments?: unknown;
  argumentTemplate?: unknown;
  approvalStatus: ExecutionPlanStepApprovalStatus;
  approval?: ExecutionPlanStepApproval;
  status: ExecutionPlanStepStatus;
  resultSummary?: string;
  timeoutMs?: number;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type DelegatedTaskQueueStatus = 'queued' | 'active' | 'not_queued';

export interface DelegatedTaskUiState {
  taskId: string;
  status: DelegatedTaskStatus;
  approvalStatus: ApprovalRequirementStatus;
  queueStatus: DelegatedTaskQueueStatus;
  currentWorkerStep?: ExecutionPlanStep;
  blockedReason?: DelegatedTaskBlockedReason;
  missingApproval?: PendingToolAction | ApprovalRequirement | ExecutionPlanStepApproval;
  missingConfiguration?: {
    blockedReason: 'provider_configuration_required';
    provider?: string;
    providerName?: string;
    missingConfigHint?: string;
    nextManualAction?: string;
    message?: string;
  };
  executionResult?: DelegatedTaskResult;
  completionReport?: unknown;
  receiptId?: string;
}

export interface DelegatedTask {
  id: string;
  sessionId: string;
  parentAgent: 'elora';
  assignedAgent: Exclude<RuntimeAgentName, 'elora'>;
  objective: string;
  constraints: string[];
  requiredTools: string[];
  approvalRequirements: ApprovalRequirement[];
  executionPlan?: ExecutionPlanStep[];
  status: DelegatedTaskStatus;
  blockedReason?: DelegatedTaskBlockedReason;
  pendingToolAction?: PendingToolAction;
  logs: string[];
  logReferences?: DelegatedTaskLogReference[];
  events: DelegatedTaskEvent[];
  result?: DelegatedTaskResult;
  receipt?: TaskReceipt;
  auditTrail: TaskAuditEntry[];
  uiState?: DelegatedTaskUiState;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  timeoutMs?: number;
  finishedAt?: string;
}

export interface CreateDelegatedTaskInput {
  sessionId: string;
  objective: string;
  constraints?: string[];
  requiredTools?: string[];
  approvalRequirements?: Array<Partial<ApprovalRequirement> | string>;
  executionPlan?: AppendExecutionPlanStepInput[];
  initialLog?: string;
  timeoutMs?: number;
}


export interface AppendExecutionPlanStepInput {
  id?: string;
  order?: number;
  targetTool: string;
  arguments?: unknown;
  argumentTemplate?: unknown;
  approvalStatus?: ExecutionPlanStepApprovalStatus;
  approval?: Partial<ExecutionPlanStepApproval>;
  status?: ExecutionPlanStepStatus;
  resultSummary?: string;
  timeoutMs?: number;
}

export interface UpdateExecutionPlanStepInput {
  order?: number;
  targetTool?: string;
  arguments?: unknown;
  argumentTemplate?: unknown;
  approvalStatus?: ExecutionPlanStepApprovalStatus;
  approval?: Partial<ExecutionPlanStepApproval>;
  status?: ExecutionPlanStepStatus;
  resultSummary?: string;
  timeoutMs?: number;
}

export interface UpdateDelegatedTaskInput {
  status?: DelegatedTaskStatus;
  log?: string;
  result?: DelegatedTaskResult;
  blockedReason?: DelegatedTaskBlockedReason;
  pendingToolAction?: PendingToolAction;
  commandOutputChunk?: { stream?: 'stdout' | 'stderr' | 'combined'; text: string; command?: string; stepId?: string; fullLogPath?: string };
  event?: {
    type?: DelegatedTaskEventType;
    actor?: RuntimeAgentName | 'system' | 'user';
    summary: string;
    details?: Record<string, unknown>;
  };
}
