import {
  completeExecutionRecord as completeRuntimeExecutionRecord,
  createExecutionRecord as createRuntimeExecutionRecord,
  summarizeProviderResponse as summarizeRuntimeProviderResponse,
  writeExecutionRecord as writeRuntimeExecutionRecord,
  type ExecutionApprovalStatus,
  type ExecutionKind,
  type ExecutionRecord,
  type ExecutionStatus,
} from '../executions.js';
import type { ToolRiskLevel } from '../tools/registry.js';
import type { RuntimeContext } from '../types.js';

export type WorkflowExecutionReceipt = Pick<ExecutionRecord, 'id' | 'status'> & {
  summary: string;
};

export interface WorkflowReceiptContext extends Pick<RuntimeContext, 'agent' | 'sessionId' | 'voiceSessionId'> {}

export interface CreateWorkflowExecutionRecordInput {
  workflow: string;
  action: string;
  context: WorkflowReceiptContext;
  inputPayload: unknown;
  riskLevel: ToolRiskLevel | 'unknown';
  approvalStatus: ExecutionApprovalStatus;
  kind?: ExecutionKind;
  whoRequested?: string;
  chosenByAgent?: string;
  executionResult?: unknown;
  providerResponseSummary?: string;
  status?: ExecutionStatus;
  startedAt?: string;
  requestedAt?: string;
  receiptSummary?: string;
  errors?: string[];
}

export interface CompleteWorkflowExecutionRecordInput {
  status: ExecutionStatus;
  executionResult?: unknown;
  providerResponseSummary?: string;
  errors?: string[];
  approvalStatus?: ExecutionApprovalStatus;
  completedAt?: string;
  receiptSummary?: string;
}

export function summarizeProviderResponse(result: unknown) {
  return summarizeRuntimeProviderResponse(result);
}

export function createExecutionRecord(input: Parameters<typeof createRuntimeExecutionRecord>[0]) {
  return createRuntimeExecutionRecord(input);
}

export function completeExecutionRecord(record: ExecutionRecord, patch: Parameters<typeof completeRuntimeExecutionRecord>[1]) {
  return completeRuntimeExecutionRecord(record, patch);
}

export async function writeExecutionRecord(record: ExecutionRecord) {
  return writeRuntimeExecutionRecord(record);
}

export function createWorkflowExecutionRecord(input: CreateWorkflowExecutionRecordInput) {
  return createExecutionRecord({
    kind: input.kind || 'runtime_action',
    whoRequested: input.whoRequested || `${input.workflow}.workflow`,
    chosenByAgent: input.chosenByAgent || input.context.agent || 'elora',
    action: input.action,
    inputPayload: input.inputPayload,
    riskLevel: input.riskLevel,
    approvalStatus: input.approvalStatus,
    executionResult: input.executionResult,
    providerResponseSummary: input.providerResponseSummary ?? summarizeProviderResponse(input.executionResult),
    linkedIds: { sessionId: input.context.sessionId, voiceSessionId: input.context.voiceSessionId },
    status: input.status || 'running',
    startedAt: input.startedAt,
    requestedAt: input.requestedAt,
    errors: input.errors,
    receiptSummary: input.receiptSummary || `${input.action} requested`,
  });
}

export async function writeCompletedWorkflowExecutionReceipt(
  record: ExecutionRecord,
  patch: CompleteWorkflowExecutionRecordInput,
): Promise<WorkflowExecutionReceipt> {
  const completed = completeExecutionRecord(record, patch);
  await writeExecutionRecord(completed);
  return { id: completed.id, summary: completed.receipt.summary, status: completed.status };
}
