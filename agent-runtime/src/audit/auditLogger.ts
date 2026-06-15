import { promises as fs } from 'node:fs';
import path from 'node:path';
import { runtimeConfig } from '../config.js';
import { redactForLogs } from '../workflows/nexora/secretsPolicy.js';

export interface ToolAuditLogEntry {
  event: string;
  tool: string;
  sessionId: string;
  riskLevel: string;
  humanApprovalRequired: boolean;
  approved: boolean;
  workspaceRoot?: string;
  input?: Record<string, unknown>;
  resultStatus?: string;
  error?: string;
  occurredAt?: string;
}

const auditDir = path.join(runtimeConfig.dataDir, 'audit');
const auditLogPath = path.join(auditDir, 'tool-audit.jsonl');

function redactValue(value: unknown): unknown {
  const secretRedacted = redactForLogs(value);
  if (secretRedacted !== value) return secretRedacted;
  if (typeof value === 'string') return value.length > 120 ? `${value.slice(0, 117)}...` : value;
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, redactValue(nested)]));
  }
  return value;
}

export function sanitizeAuditInput(input: Record<string, unknown>, sensitiveFields: string[] = []) {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, sensitiveFields.includes(key) ? '[redacted]' : redactValue(value)]),
  );
}

export async function writeToolAuditLog(entry: ToolAuditLogEntry) {
  await fs.mkdir(auditDir, { recursive: true });
  await fs.appendFile(auditLogPath, `${JSON.stringify({ ...entry, occurredAt: entry.occurredAt || new Date().toISOString() })}\n`);
}
