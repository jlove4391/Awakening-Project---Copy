import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { runtimeConfig } from './config.js';
import type { ToolRiskLevel } from './tools/registry.js';
import type { ApprovalScope } from './tasks/types.js';
import { redactProviderReceiptPayload, safeReceiptSummary } from './workflows/nexora/secretsPolicy.js';

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
    memoryIds?: string[];
    taskIds?: string[];
    toolCallId?: string;
    voiceSessionId?: string;
    executionMode?: string;
  };
  status: ExecutionStatus;
  receipt: {
    summary: string;
    status: ExecutionStatus;
    issuedAt: string;
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
}): ExecutionRecord {
  const requestedAt = input.requestedAt || now();
  const status = input.status || 'requested';
  return {
    id: randomUUID(),
    kind: input.kind,
    whoRequested: input.whoRequested,
    chosenByAgent: input.chosenByAgent,
    action: input.action,
    inputPayload: redactProviderReceiptPayload(input.inputPayload),
    riskLevel: input.riskLevel,
    approvalStatus: input.approvalStatus,
    approvalScope: input.approvalScope,
    approvalRequest: input.approvalRequest,
    executionResult: redactProviderReceiptPayload(input.executionResult),
    providerResponseSummary: input.providerResponseSummary ? redactProviderReceiptPayload(input.providerResponseSummary) : input.providerResponseSummary,
    errors: input.errors || [],
    timestamps: {
      requestedAt,
      startedAt: input.startedAt,
    },
    linkedIds: input.linkedIds,
    status,
    receipt: {
      summary: input.receiptSummary || `${input.action} ${status}`,
      status,
      issuedAt: now(),
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
  },
): ExecutionRecord {
  const completedAt = patch.completedAt || now();
  return {
    ...record,
    status: patch.status,
    approvalStatus: patch.approvalStatus || record.approvalStatus,
    approvalScope: record.approvalScope,
    approvalRequest: record.approvalRequest,
    executionResult: redactProviderReceiptPayload(patch.executionResult),
    providerResponseSummary: patch.providerResponseSummary ? redactProviderReceiptPayload(patch.providerResponseSummary) : summarizeProviderResponse(patch.executionResult),
    errors: redactProviderReceiptPayload(patch.errors || record.errors),
    timestamps: {
      ...record.timestamps,
      completedAt,
    },
    receipt: {
      summary: patch.receiptSummary || `${record.action} ${patch.status}`,
      status: patch.status,
      issuedAt: completedAt,
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

export async function writeExecutionRecord(record: ExecutionRecord) {
  await ensureStore();
  record = redactProviderReceiptPayload(record);
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
