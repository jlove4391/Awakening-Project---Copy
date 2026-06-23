import { randomUUID } from 'node:crypto';

export type AlphaReceiptCompleteness = 'complete' | 'incomplete';

export interface AlphaReceiptPayload {
  receipt_id: string;
  timestamp: string;
  actor: string;
  requested_by: string;
  action: string;
  reason: string;
  memory_used: unknown[];
  authority_basis: string;
  tools_used: string[];
  outcome: string;
  artifact_paths: string[];
  reversal_path: string;
  memory_candidates: unknown[];
}

export interface AlphaReceiptValidation {
  status: AlphaReceiptCompleteness;
  missingFields: Array<keyof AlphaReceiptPayload>;
}

export type AlphaReceiptInput = Partial<AlphaReceiptPayload> & {
  receipt_id?: string;
  timestamp?: string;
};

export const alphaReceiptRequiredFields: Array<keyof AlphaReceiptPayload> = [
  'receipt_id',
  'timestamp',
  'actor',
  'requested_by',
  'action',
  'reason',
  'memory_used',
  'authority_basis',
  'tools_used',
  'outcome',
  'artifact_paths',
  'reversal_path',
  'memory_candidates',
];

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const asStringArray = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);
const asString = (value: unknown): string => (typeof value === 'string' ? value : value == null ? '' : String(value));

export function createAlphaReceipt(input: AlphaReceiptInput): AlphaReceiptPayload {
  return {
    receipt_id: input.receipt_id || randomUUID(),
    timestamp: input.timestamp || new Date().toISOString(),
    actor: asString(input.actor),
    requested_by: asString(input.requested_by),
    action: asString(input.action),
    reason: asString(input.reason),
    memory_used: asArray(input.memory_used),
    authority_basis: asString(input.authority_basis),
    tools_used: asStringArray(input.tools_used),
    outcome: asString(input.outcome),
    artifact_paths: asStringArray(input.artifact_paths),
    reversal_path: asString(input.reversal_path),
    memory_candidates: asArray(input.memory_candidates),
  };
}

export function validateAlphaReceipt(receipt: Partial<AlphaReceiptPayload> | undefined): AlphaReceiptValidation {
  const missingFields = alphaReceiptRequiredFields.filter((field) => {
    const value = receipt?.[field];
    if (value === undefined || value === null) return true;
    if (typeof value === 'string') return value.trim().length === 0;
    if (Array.isArray(value)) return false;
    return false;
  });
  return { status: missingFields.length ? 'incomplete' : 'complete', missingFields };
}
