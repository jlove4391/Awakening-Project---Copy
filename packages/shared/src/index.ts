export type RuntimeAgentName = 'elora' | 'nexora' | 'kaz' | 'jynx' | 'kalyra';

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

export type DelegatedTaskBlockedReason = 'step_approval_required' | 'worker_unavailable' | 'policy_block' | 'unknown';

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
  createdAt: string;
  updatedAt: string;
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
  executionPlan?: AppendExecutionPlanStepInput[];
  initialLog?: string;
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
}

export interface UpdateDelegatedTaskInput {
  status?: DelegatedTaskStatus;
  log?: string;
  result?: DelegatedTaskResult;
  blockedReason?: DelegatedTaskBlockedReason;
  pendingToolAction?: PendingToolAction;
  event?: {
    type?: DelegatedTaskEventType;
    actor?: RuntimeAgentName | 'system' | 'user';
    summary: string;
    details?: Record<string, unknown>;
  };
}
export type SharedRecordValue = string | number | boolean | null;

export type LeadStatus =
  | 'new'
  | 'discovered'
  | 'enriched'
  | 'scored'
  | 'approved'
  | 'exported'
  | 'contacted'
  | 'follow_up_due'
  | 'follow_up_scheduled'
  | 'responded'
  | 'qualified'
  | 'disqualified'
  | 'converted'
  | 'lost'
  | 'archived'
  | (string & {});

export type FollowUpStatus =
  | 'not_scheduled'
  | 'scheduled'
  | 'due'
  | 'sent'
  | 'completed'
  | 'skipped'
  | 'cancelled'
  | 'failed'
  | (string & {});

export interface ApprovalRequest {
  id: string;
  leadId?: string;
  action: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | (string & {});
  requestedBy: string;
  requestedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  note?: string;
  metadata?: Record<string, unknown>;
}

export interface LeadScoreDimensions {
  industryFit?: number;
  localServiceFit?: number;
  missedCallLikelihood?: number;
  followUpPainLikelihood?: number;
  aiAutomationFit?: number;
  abilityToPay?: number;
  decisionMakerIdentified?: number;
  emailPhoneConfidence?: number;
  complianceRisk?: number;
  estimatedValue?: number;
  recommendedFirstOffer?: string;
  [dimension: string]: number | string | undefined;
}

export interface LeadScore {
  value: number;
  dimensions?: LeadScoreDimensions;
  reasons?: string[];
  scoredAt?: string;
  scoredBy?: string;
  metadata?: Record<string, unknown>;
}

export interface LeadInboxItem {
  id: string;
  leadId: string;
  title: string;
  company?: string;
  contactName?: string;
  status: LeadStatus;
  score?: LeadScore;
  followUpStatus?: FollowUpStatus;
  approvalRequest?: ApprovalRequest;
  priority?: 'low' | 'medium' | 'high' | 'urgent' | (string & {});
  source?: string;
  tags?: string[];
  assignedTo?: string;
  dueAt?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface LeadRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: LeadStatus;
  sessionId?: string;
  intakeId?: string;
  clientId?: string;
  name?: string;
  email?: string;
  company?: string;
  source?: string;
  tags?: string[];
  notes?: string;
  score?: number;
  scoreDetails?: LeadScore;
  followUpStatus?: FollowUpStatus;
  approvalRequest?: ApprovalRequest;
  metadata?: Record<string, SharedRecordValue>;
}


export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled' | (string & {});

export interface CampaignRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: CampaignStatus;
  name?: string;
  description?: string;
  owner?: string;
  allowMassSend?: boolean;
  manuallyApprovedRegulatedOutreach?: boolean;
  regulatedIndustryApproval?: CampaignApprovalState;
  pausedAt?: string;
  pausedReason?: string;
  tags?: string[];
  metadata?: Record<string, SharedRecordValue>;
}

export type CampaignApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | (string & {});

export interface CampaignApprovalState {
  id?: string;
  campaignId?: string;
  leadId?: string;
  action?: string;
  status: CampaignApprovalStatus;
  requestedBy?: string;
  requestedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  note?: string;
  metadata?: Record<string, unknown>;
}

export interface CampaignLeadItem {
  id: string;
  campaignId: string;
  leadId: string;
  status: LeadStatus;
  priority?: 'low' | 'medium' | 'high' | 'urgent' | (string & {});
  approvalState?: CampaignApprovalState;
  sendRequestId?: string;
  receiptIds?: string[];
  addedAt: string;
  updatedAt: string;
  metadata?: Record<string, SharedRecordValue>;
}

export interface CampaignSendReceipt {
  id: string;
  campaignId: string;
  leadId?: string;
  sendRequestId: string;
  provider: 'gmail' | 'smtp' | (string & {});
  providerMessageId?: string;
  threadId?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  sentAt: string;
  status: 'sent' | 'failed' | 'bounced' | (string & {});
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export type QualificationSource = 'form' | 'transcript' | 'manual';

export type QualificationStatus =
  | 'draft'
  | 'needs_review'
  | 'qualified'
  | 'disqualified'
  | 'archived'
  | (string & {});

export interface QualificationRecord {
  id: string;
  leadId: string;
  intakeId: string;
  source: QualificationSource;
  monthlyLeadVolume: number;
  responseSpeed: string;
  missedCallsMessages: number;
  crmTrackingSystem: string;
  averageJobCustomerValue: number;
  closeRate: number;
  crackFallthroughPoints: string[];
  desired30DayImprovement: string;
  qualificationScore: number;
  status: QualificationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface IntakeRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  leadId?: string;
  clientId?: string;
  sessionId?: string;
  submittedAt?: string;
  summary?: string;
  responses?: Record<string, SharedRecordValue>;
  metadata?: Record<string, SharedRecordValue>;
}

export interface ClientRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  leadId?: string;
  sourceLeadId?: string;
  sourceProposalId?: string;
  intakeId?: string;
  sessionId?: string;
  name?: string;
  email?: string;
  company?: string;
  closeDate?: string;
  emotionalState?: string;
  confidence?: number;
  concerns?: string[];
  kickoffStatus?: string;
  assignedSpecialist?: string;
  firstWinTarget?: string;
  tags?: string[];
  notes?: string;
  metadata?: Record<string, SharedRecordValue>;
}

export interface ProjectRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  clientId: string;
  sourceLeadId?: string;
  sourceProposalId?: string;
  closeDate?: string;
  emotionalState?: string;
  confidence?: number;
  concerns?: string[];
  kickoffStatus?: string;
  assignedSpecialist?: string;
  firstWinTarget?: string;
  name?: string;
  notes?: string;
  metadata?: Record<string, SharedRecordValue>;
}

export interface DeliverableRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  clientId?: string;
  intakeId?: string;
  proposalId?: string;
  sessionId?: string;
  title?: string;
  description?: string;
  dueAt?: string;
  deliveredAt?: string;
  artifactIds?: string[];
  metadata?: Record<string, SharedRecordValue>;
}

export interface OfferTemplateRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  name: string;
  description?: string;
  recommendedSolution?: string;
  implementationScope?: string[];
  included?: string[];
  notIncluded?: string[];
  timeline?: string;
  priceOptions?: string[];
  quickWinPromise?: string;
  metadata?: Record<string, SharedRecordValue>;
}

export interface ProposalReviewCall {
  id: string;
  proposalId: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  scheduledFor?: string;
  agenda: string[];
  unresolvedQuestions?: string[];
  notes?: string;
  metadata?: Record<string, SharedRecordValue>;
}

export interface ProposalRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  leadId?: string;
  clientId?: string;
  intakeId?: string;
  sessionId?: string;
  offerTemplateId?: string;
  title?: string;
  summary?: string;
  painSummaryInProspectLanguage?: string;
  currentState?: string;
  costOfInaction?: string;
  desiredOutcome?: string;
  recommendedSolution?: string;
  first30DayPlan?: string;
  quickWinPromise?: string;
  implementationScope?: string[];
  included?: string[];
  notIncluded?: string[];
  timeline?: string;
  priceOptions?: string[];
  reviewCallAgenda?: string[];
  unresolvedQuestions?: string[];
  reviewCall?: ProposalReviewCall;
  totalAmount?: number;
  currency?: string;
  validUntil?: string;
  acceptedAt?: string;
  metadata?: Record<string, SharedRecordValue>;
}

export interface CallTranscriptRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  leadId?: string;
  clientId?: string;
  proposalId?: string;
  sessionId?: string;
  startedAt?: string;
  endedAt?: string;
  participantIds?: string[];
  transcript?: string;
  summary?: string;
  metadata?: Record<string, SharedRecordValue>;
}


export type ObjectionCategory =
  | 'price'
  | 'timing'
  | 'trust'
  | 'complexity'
  | 'already have a tool'
  | 'need to talk to partner/team'
  | 'unclear ROI'
  | 'fear of AI'
  | 'privacy/compliance'
  | 'implementation burden'
  | 'bad past vendor experience'
  | (string & {});

export interface ObjectionRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  leadId?: string;
  clientId?: string;
  proposalId?: string;
  sessionId?: string;
  callTranscriptId?: string;
  category?: ObjectionCategory;
  summary?: string;
  resolution?: string;
  metadata?: Record<string, SharedRecordValue>;
}

export interface FollowUpRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  leadId?: string;
  clientId?: string;
  intakeId?: string;
  proposalId?: string;
  sessionId?: string;
  objectionId?: string;
  dueAt?: string;
  completedAt?: string;
  channel?: string;
  note?: string;
  metadata?: Record<string, SharedRecordValue>;
}
