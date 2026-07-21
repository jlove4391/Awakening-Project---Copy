import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { runtimeConfig } from './config.js';
import { getActiveCoreExecutionContext } from './core/executionContextStore.js';
import type { ToolRiskLevel } from './tools/registry.js';
import type { ApprovalScope } from './tasks/types.js';
import type { PolicyAction, PolicyBoundary, PolicyDecision } from './governance/policyDecision.js';
import type { ExecutionMode } from './types.js';
import { redactProviderReceiptPayload, safeReceiptSummary } from './workflows/nexora/secretsPolicy.js';
import { createAlphaReceipt, validateAlphaReceipt, type AlphaReceiptPayload, type AlphaReceiptValidation } from './alpha/receipts.js';
import { canonicalReceiptId, upsertCanonicalReceipt, type CanonicalReceiptInput } from './receipts.js';

export type ExecutionKind = 'tool_call' | 'delegated_task' | 'runtime_action';
export type ExecutionApprovalStatus = 'not_required' | 'approved' | 'blocked' | 'pending' | 'rejected' | 'unknown';
export type ExecutionStatus = 'requested' | 'running' | 'completed' | 'blocked' | 'failed';

export interface ExecutionApprovalRequest {
  toolName: string;
  requestedAction: string;
  sanitizedInputSummary: string;
  reason: string;
  originalInput: Record<string, unknown>;
  requestedAt: string;
  approvalNote?: string;
  approvalScope?: ApprovalScope;
}

export interface ExecutionRecord {
  id: string;
  kind: ExecutionKind;
  whoRequested: string;
  chosenByAgent: string;
  action: string;
  inputPayload: unknown;
  riskLevel: ToolRiskLevel | 'unknown';
  approvalStatus: ExecutionApprovalStatus;
  approvalScope?: ApprovalScope;
  trustDomain?: string;
  policyAction?: PolicyAction;
  policyClassification?: PolicyDecision['policyClassification'];
  policyBoundary?: PolicyBoundary;
  approvalRequest?: ExecutionApprovalRequest;
  executionResult?: unknown;
  providerResponseSummary?: string;
  errors: string[];
  timestamps: {
    requestedAt: string;
    startedAt?: string;
    completedAt?: string;
  };
  linkedIds: {
    sessionId?: string;
    commandId?: string;
    contextBundleId?: string;
    identityIds?: string[];
    memoryIds?: string[];
    relationshipEntryIds?: string[];
    priorCommandIds?: string[];
    taskIds?: string[];
    executionIds?: string[];
    receiptIds?: string[];
    trustDomains?: string[];
    validationRequirement?: string;
    scopeLimit?: string;
    toolCallId?: string;
    voiceSessionId?: string;
    executionMode?: string;
    executionOrigin?: ExecutionMode;
    autonomyLevel?: number;
    rootTaskId?: string;
    parentTaskId?: string;
  };
  status: ExecutionStatus;
  receipt: {
    primaryReceiptId: string;
    summary: string;
    status: ExecutionStatus;
    issuedAt: string;
    executionOrigin?: ExecutionMode;
    autonomyLevel?: number;
    alpha?: AlphaReceiptPayload;
    alphaValidation?: AlphaReceiptValidation;
  };
}

const executionsDir = path.join(runtimeConfig.dataDir, 'executions');
const executionLogPath = path.join(executionsDir, 'execution-records.jsonl');

function now() {
  return new Date().toISOString();
}

async function ensureStore() {
  await fs.mkdir(executionsDir, { recursive: true });
}

function sessionExecutionPath(sessionId: string) {
  return path.join(executionsDir, `${sessionId}.json`);
}

function truncate(value: string, maxLength = 360) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function unique(values: string[] = []) {
  return [...new Set(values.filter(Boolean))];
}

function mergeContextLinks(linkedIds: ExecutionRecord['linkedIds']) {
  const active = getActiveCoreExecutionContext(linkedIds.sessionId);
  if (!active) return { linkedIds, authorityBasis: undefined as string | undefined };
  return {
    linkedIds: {
      ...linkedIds,
      commandId: linkedIds.commandId || active.commandId,
      contextBundleId: linkedIds.contextBundleId || active.contextBundleId,
      identityIds: unique([...(linkedIds.identityIds || []), ...active.identityIds]),
      memoryIds: unique([...(linkedIds.memoryIds || []), ...active.memoryIds]),
      relationshipEntryIds: unique([...(linkedIds.relationshipEntryIds || []), ...active.relationshipEntryIds]),
      priorCommandIds: unique([...(linkedIds.priorCommandIds || []), ...active.priorCommandIds]),
      taskIds: unique([...(linkedIds.taskIds || []), ...active.taskIds]),
      executionIds: unique([...(linkedIds.executionIds || []), ...active.executionIds]),
      receiptIds: unique([...(linkedIds.receiptIds || []), ...active.receiptIds]),
      trustDomains: unique([...(linkedIds.trustDomains || []), ...active.trustDomains]),
      validationRequirement: linkedIds.validationRequirement || active.validationRequirement,
      scopeLimit: linkedIds.scopeLimit || active.scopeLimit,
    },
    authorityBasis: active.authorityBasis,
  };
}

function memoryEvidence(linkedIds: ExecutionRecord['linkedIds']) {
  return [
    ...(linkedIds.memoryIds || []),
    ...(linkedIds.identityIds || []).map((id) => ({ type: 'identity', id })),
    ...(linkedIds.relationshipEntryIds || []).map((id) => ({ type: 'relationship', id })),
    ...(linkedIds.priorCommandIds || []).map((id) => ({ type: 'prior_command', id })),
    ...(linkedIds.receiptIds || []).map((id) => ({ type: 'prior_receipt', id })),
    ...(linkedIds.commandId ? [{ type: 'command', id: linkedIds.commandId }] : []),
    ...(linkedIds.contextBundleId ? [{ type: 'context_bundle', id: linkedIds.contextBundleId }] : []),
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function idsFromUnknown(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.flatMap((value) => {
    if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
    if (!isRecord(value)) return [];
    const id = value.id || value.memoryId || value.memory_id || value.receiptId || value.receipt_id;
    return typeof id === 'string' && id.trim() ? [id.trim()] : [];
  });
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => typeof entry === 'string' && entry.trim() ? [entry.trim()] : []);
}

function artifactPaths(result: unknown) {
  if (!isRecord(result)) return [];
  const paths: string[] = [];
  for (const key of ['path', 'file', 'filePath', 'artifactPath', 'targetPath']) {
    const value = result[key];
    if (typeof value === 'string' && value.trim()) paths.push(value.trim());
  }
  for (const key of ['paths', 'changedFiles', 'artifactsChanged', 'artifact_paths']) paths.push(...strings(result[key]));
  if (Array.isArray(result.manifest)) {
    for (const entry of result.manifest) {
      if (isRecord(entry) && typeof entry.path === 'string' && entry.path.trim()) paths.push(entry.path.trim());
    }
  }
  return unique(paths);
}

function commandValues(record: ExecutionRecord) {
  if (!isRecord(record.executionResult)) return [];
  const values = [record.executionResult.command, record.executionResult.script]
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()));
  return unique(values);
}

function trustDomainForExecution(record: ExecutionRecord) {
  if (record.trustDomain) return record.trustDomain;
  if (record.approvalScope === 'repo.command') return 'commands';
  if (record.approvalScope?.startsWith('repo.')) return 'repository';
  const category = record.action.split('.', 1)[0];
  if (category === 'code' || category === 'vscode' || category === 'nexora') return record.riskLevel === 'code_execution' ? 'commands' : 'repository';
  if (category === 'delegation') return 'work_orders';
  if (['drive', 'calendar', 'gmail', 'memory'].includes(category)) return category;
  return category || 'runtime';
}

function rollbackGuidance(record: ExecutionRecord) {
  const result = isRecord(record.executionResult) ? record.executionResult : {};
  for (const key of ['rollbackGuidance', 'rollback_guidance', 'reversalPath', 'reversal_path']) {
    const value = result[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  if (record.riskLevel === 'read') return 'No mutation was performed; discard the read-only result if it is not useful.';
  if (record.action.startsWith('code.') || record.action.startsWith('nexora.')) return 'Restore affected workspace paths from version control or the recorded pre-change state. Do not push or merge automatically.';
  return 'Use the provider- or workflow-specific reversal path before relying on this action as irreversible proof.';
}

function canonicalReceiptForExecution(record: ExecutionRecord): CanonicalReceiptInput {
  const receiptId = record.receipt.primaryReceiptId || canonicalReceiptId('execution', record.id);
  const completed = record.status === 'completed';
  const failed = record.status === 'failed';
  const blocked = record.status === 'blocked';
  const policyAction = record.policyAction || (blocked ? 'ask_before_execution' : 'execute');
  const policyClassification = record.policyClassification || (blocked ? 'explicit_boundary' : 'execute_with_receipt');
  const validationStatus = completed ? 'passed' : failed ? 'failed' : blocked ? 'pending' : 'pending';
  const alphaId = record.receipt.alpha?.receipt_id;
  const supportingExecution = Boolean(record.linkedIds.taskIds?.length);
  return {
    id: receiptId,
    subject: { kind: 'execution', id: record.id },
    actor: record.chosenByAgent,
    requestedBy: record.whoRequested,
    action: record.action,
    summary: record.receipt.summary || `${record.action} ${record.status}`,
    status: record.status,
    trustDomain: trustDomainForExecution(record),
    policy: {
      action: policyAction,
      classification: policyClassification,
      boundary: record.policyBoundary,
      approvalStatus: record.approvalStatus,
      approvalScope: record.approvalScope,
      authorityBasis: record.receipt.alpha?.authority_basis || record.approvalStatus || 'runtime_policy',
    },
    timestamps: {
      requestedAt: record.timestamps.requestedAt,
      startedAt: record.timestamps.startedAt,
      completedAt: record.timestamps.completedAt,
      createdAt: record.timestamps.requestedAt,
      updatedAt: record.timestamps.completedAt || record.receipt.issuedAt,
    },
    links: {
      sessionId: record.linkedIds.sessionId,
      commandId: record.linkedIds.commandId,
      contextBundleId: record.linkedIds.contextBundleId,
      identityIds: record.linkedIds.identityIds || [],
      memoryReferenceIds: record.linkedIds.memoryIds || [],
      memoryCandidateIds: idsFromUnknown(record.receipt.alpha?.memory_candidates),
      relationshipEntryIds: record.linkedIds.relationshipEntryIds || [],
      priorCommandIds: record.linkedIds.priorCommandIds || [],
      taskIds: record.linkedIds.taskIds || [],
      workOrderIds: [],
      executionIds: unique([record.id, ...(record.linkedIds.executionIds || [])]),
      supportingReceiptIds: alphaId && alphaId !== receiptId ? [alphaId] : [],
    },
    evidence: {
      resultSummary: record.providerResponseSummary || record.receipt.summary,
      toolsUsed: record.kind === 'tool_call' ? [record.action] : [],
      commandsRun: commandValues(record),
      artifactsChanged: artifactPaths(record.executionResult),
      errors: record.errors,
      remainingWork: blocked ? [record.approvalRequest?.reason || 'Approval or setup remains pending.'] : [],
      rollbackGuidance: rollbackGuidance(record),
      result: record.executionResult,
    },
    validation: {
      status: validationStatus,
      required: record.status !== 'requested' && record.status !== 'running',
      checks: record.status === 'requested' || record.status === 'running'
        ? []
        : [{ id: `${record.id}:execution-result`, status: validationStatus, summary: record.providerResponseSummary || record.receipt.summary }],
    },
    trustImpact: supportingExecution
      ? { eligible: false, reasons: ['This execution is supporting evidence for a primary delegated work-order receipt.'] }
      : undefined,
  };
}

export function summarizeProviderResponse(result: unknown) {
  result = redactProviderReceiptPayload(result);
  if (result === undefined) return 'No provider response body returned.';
  if (result === null) return 'Provider returned null.';
  if (typeof result === 'string') return truncate(result);
  if (typeof result === 'number' || typeof result === 'boolean') return String(result);

  if (typeof result === 'object') {
    const objectResult = result as Record<string, unknown>;
    const status = objectResult.status ? `status=${String(objectResult.status)}` : undefined;
    const ok = typeof objectResult.ok === 'boolean' ? `ok=${String(objectResult.ok)}` : undefined;
    const message = typeof objectResult.message === 'string' ? truncate(objectResult.message, 180) : undefined;
    const id = typeof objectResult.id === 'string' ? `id=${objectResult.id}` : undefined;
    const parts = [ok, status, id, message].filter(Boolean);
    if (parts.length) return parts.join('; ');
  }

  try {
    return truncate(safeReceiptSummary(result));
  } catch (_error) {
    return 'Provider response could not be serialized.';
  }
}

export function createExecutionRecord(input: Omit<ExecutionRecord, 'id' | 'timestamps' | 'status' | 'receipt' | 'errors'> & {
  requestedAt?: string;
  startedAt?: string;
  status?: ExecutionStatus;
  errors?: string[];
  receiptSummary?: string;
  alphaReceipt?: Partial<AlphaReceiptPayload>;
}): ExecutionRecord {
  const id = randomUUID();
  const primaryReceiptId = canonicalReceiptId('execution', id);
  const requestedAt = input.requestedAt || now();
  const status = input.status || 'requested';
  const context = mergeContextLinks(input.linkedIds);
  const linkedIds = {
    ...context.linkedIds,
    executionIds: unique([id, ...(context.linkedIds.executionIds || [])]),
    receiptIds: unique([primaryReceiptId, ...(context.linkedIds.receiptIds || [])]),
  };
  const executionOrigin = linkedIds.executionOrigin || (linkedIds.executionMode === 'reactive' || linkedIds.executionMode === 'delegated' || linkedIds.executionMode === 'autonomous' ? linkedIds.executionMode : undefined);
  const alpha = createAlphaReceipt({
    receipt_id: primaryReceiptId,
    timestamp: input.alphaReceipt?.timestamp || requestedAt,
    actor: input.alphaReceipt?.actor || input.chosenByAgent,
    requested_by: input.alphaReceipt?.requested_by || input.whoRequested,
    action: input.alphaReceipt?.action || input.action,
    reason: input.alphaReceipt?.reason || input.receiptSummary || `${input.action} ${status}`,
    memory_used: input.alphaReceipt?.memory_used || memoryEvidence(linkedIds),
    authority_basis: input.alphaReceipt?.authority_basis || context.authorityBasis || input.approvalStatus,
    tools_used: input.alphaReceipt?.tools_used || (input.kind === 'tool_call' ? [input.action] : []),
    outcome: input.alphaReceipt?.outcome || status,
    artifact_paths: input.alphaReceipt?.artifact_paths || [],
    reversal_path: input.alphaReceipt?.reversal_path || 'No reversal path recorded.',
    memory_candidates: input.alphaReceipt?.memory_candidates || [],
  });
  return {
    id,
    kind: input.kind,
    whoRequested: input.whoRequested,
    chosenByAgent: input.chosenByAgent,
    action: input.action,
    inputPayload: redactProviderReceiptPayload(input.inputPayload),
    riskLevel: input.riskLevel,
    approvalStatus: input.approvalStatus,
    approvalScope: input.approvalScope,
    trustDomain: input.trustDomain || getActiveCoreExecutionContext(linkedIds.sessionId)?.trustDomain,
    policyAction: input.policyAction,
    policyClassification: input.policyClassification,
    policyBoundary: input.policyBoundary,
    approvalRequest: input.approvalRequest,
    executionResult: redactProviderReceiptPayload(input.executionResult),
    providerResponseSummary: input.providerResponseSummary ? redactProviderReceiptPayload(input.providerResponseSummary) : input.providerResponseSummary,
    errors: input.errors || [],
    timestamps: {
      requestedAt,
      startedAt: input.startedAt,
    },
    linkedIds,
    status,
    receipt: {
      primaryReceiptId,
      summary: input.receiptSummary || `${input.action} ${status}`,
      status,
      issuedAt: now(),
      executionOrigin,
      autonomyLevel: linkedIds.autonomyLevel,
      alpha,
      alphaValidation: validateAlphaReceipt(alpha),
    },
  };
}

export function completeExecutionRecord(
  record: ExecutionRecord,
  patch: {
    status: ExecutionStatus;
    executionResult?: unknown;
    providerResponseSummary?: string;
    errors?: string[];
    approvalStatus?: ExecutionApprovalStatus;
    completedAt?: string;
    receiptSummary?: string;
    alphaReceipt?: Partial<AlphaReceiptPayload>;
  },
): ExecutionRecord {
  const completedAt = patch.completedAt || now();
  const alpha = createAlphaReceipt({
    ...(record.receipt.alpha || {}),
    ...(patch.alphaReceipt || {}),
    receipt_id: record.receipt.primaryReceiptId,
    timestamp: patch.alphaReceipt?.timestamp || completedAt,
    actor: patch.alphaReceipt?.actor || record.receipt.alpha?.actor || record.chosenByAgent,
    requested_by: patch.alphaReceipt?.requested_by || record.receipt.alpha?.requested_by || record.whoRequested,
    action: patch.alphaReceipt?.action || record.receipt.alpha?.action || record.action,
    reason: patch.alphaReceipt?.reason || record.receipt.alpha?.reason || patch.receiptSummary || `${record.action} ${patch.status}`,
    memory_used: patch.alphaReceipt?.memory_used || record.receipt.alpha?.memory_used || memoryEvidence(record.linkedIds),
    authority_basis: patch.alphaReceipt?.authority_basis || record.receipt.alpha?.authority_basis || patch.approvalStatus || record.approvalStatus,
    tools_used: patch.alphaReceipt?.tools_used || record.receipt.alpha?.tools_used || (record.kind === 'tool_call' ? [record.action] : []),
    outcome: patch.alphaReceipt?.outcome || patch.status,
    artifact_paths: patch.alphaReceipt?.artifact_paths || record.receipt.alpha?.artifact_paths || [],
    reversal_path: patch.alphaReceipt?.reversal_path || record.receipt.alpha?.reversal_path || 'No reversal path recorded.',
    memory_candidates: patch.alphaReceipt?.memory_candidates || record.receipt.alpha?.memory_candidates || [],
  });
  return {
    ...record,
    status: patch.status,
    approvalStatus: patch.approvalStatus || record.approvalStatus,
    approvalScope: record.approvalScope,
    trustDomain: record.trustDomain,
    policyAction: record.policyAction,
    policyClassification: record.policyClassification,
    policyBoundary: record.policyBoundary,
    approvalRequest: record.approvalRequest,
    executionResult: redactProviderReceiptPayload(patch.executionResult),
    providerResponseSummary: patch.providerResponseSummary ? redactProviderReceiptPayload(patch.providerResponseSummary) : summarizeProviderResponse(patch.executionResult),
    errors: redactProviderReceiptPayload(patch.errors || record.errors),
    timestamps: {
      ...record.timestamps,
      completedAt,
    },
    linkedIds: {
      ...record.linkedIds,
      receiptIds: unique([record.receipt.primaryReceiptId, ...(record.linkedIds.receiptIds || [])]),
    },
    receipt: {
      primaryReceiptId: record.receipt.primaryReceiptId,
      summary: patch.receiptSummary || `${record.action} ${patch.status}`,
      status: patch.status,
      issuedAt: completedAt,
      executionOrigin: record.receipt.executionOrigin,
      autonomyLevel: record.receipt.autonomyLevel,
      alpha,
      alphaValidation: validateAlphaReceipt(alpha),
    },
  };
}

async function readSessionRecords(sessionId: string) {
  try {
    return JSON.parse(await fs.readFile(sessionExecutionPath(sessionId), 'utf8')) as ExecutionRecord[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function writeSessionRecords(sessionId: string, records: ExecutionRecord[]) {
  await fs.writeFile(sessionExecutionPath(sessionId), `${JSON.stringify(records.slice(0, 250), null, 2)}\n`);
}

async function readGlobalRecords() {
  try {
    const raw = await fs.readFile(executionLogPath, 'utf8');
    return raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ExecutionRecord);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function writeGlobalRecords(records: ExecutionRecord[]) {
  await fs.writeFile(executionLogPath, records.map((record) => JSON.stringify(record)).join('\n') + (records.length ? '\n' : ''));
}

function publicExecutionRecord(record: ExecutionRecord): ExecutionRecord {
  if (!record.approvalRequest) return record;
  return {
    ...record,
    approvalRequest: {
      ...record.approvalRequest,
      originalInput: {},
    },
  };
}

async function appendSessionRecord(record: ExecutionRecord) {
  const sessionId = record.linkedIds.sessionId;
  if (!sessionId) return;
  const records = await readSessionRecords(sessionId);
  records.unshift(record);
  await writeSessionRecords(sessionId, records);
}

async function attachCanonicalReceipt(record: ExecutionRecord) {
  const receipt = await upsertCanonicalReceipt(canonicalReceiptForExecution(record));
  record.receipt.primaryReceiptId = receipt.id;
  if (record.receipt.alpha) record.receipt.alpha.receipt_id = receipt.id;
  record.linkedIds.receiptIds = unique([receipt.id, ...(record.linkedIds.receiptIds || [])]);
  return record;
}

export async function writeExecutionRecord(record: ExecutionRecord) {
  await ensureStore();
  record = redactProviderReceiptPayload(record);
  record = await attachCanonicalReceipt(record);
  await fs.appendFile(executionLogPath, `${JSON.stringify(record)}\n`);
  await appendSessionRecord(record);
  return record;
}

export async function listExecutionRecords(options: { sessionId?: string; limit?: number } = {}) {
  await ensureStore();
  const limit = Math.max(1, Math.min(options.limit || 25, 100));

  if (options.sessionId) {
    try {
      const records = await readSessionRecords(options.sessionId);
      return records.slice(0, limit).map(publicExecutionRecord);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  try {
    const records = await readGlobalRecords();
    return records.slice(-limit).reverse().map(publicExecutionRecord);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export async function getExecutionRecord(id: string) {
  await ensureStore();
  const records = await readGlobalRecords();
  return records.find((record) => record.id === id);
}

export async function updateExecutionRecord(updatedRecord: ExecutionRecord) {
  await ensureStore();
  updatedRecord = await attachCanonicalReceipt(redactProviderReceiptPayload(updatedRecord));
  const records = await readGlobalRecords();
  const index = records.findIndex((record) => record.id === updatedRecord.id);
  if (index === -1) throw new Error(`Execution record not found: ${updatedRecord.id}`);
  records[index] = updatedRecord;
  await writeGlobalRecords(records);

  const sessionId = updatedRecord.linkedIds.sessionId;
  if (sessionId) {
    const sessionRecords = await readSessionRecords(sessionId);
    const sessionIndex = sessionRecords.findIndex((record) => record.id === updatedRecord.id);
    if (sessionIndex === -1) sessionRecords.unshift(updatedRecord);
    else sessionRecords[sessionIndex] = updatedRecord;
    await writeSessionRecords(sessionId, sessionRecords);
  }

  return updatedRecord;
}
