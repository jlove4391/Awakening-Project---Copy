import type { RunToolApprovalItem } from '@openai/agents';

export type SdkApprovalDecision = 'approve' | 'reject' | 'cancel';
export type SdkApprovalRiskLevel = 'low' | 'medium' | 'high' | 'unknown';

export interface PendingSdkApprovalRecord {
  approvalId: string;
  toolName: string;
  argumentsSummary: string;
  riskLevel: SdkApprovalRiskLevel;
  sessionId: string;
  allowedDecisions: SdkApprovalDecision[];
  callId?: string;
  itemId?: string;
}

export interface PendingSdkApproval {
  sessionId: string;
  runState: string;
  approvals: PendingSdkApprovalRecord[];
  createdAt: string;
  updatedAt: string;
}

const pendingApprovals = new Map<string, PendingSdkApproval>();

function rawCallId(item: RunToolApprovalItem) {
  const raw = item.rawItem as { callId?: string; call_id?: string; id?: string };
  return raw.callId || raw.call_id || raw.id;
}

function rawRiskLevel(item: RunToolApprovalItem): SdkApprovalRiskLevel {
  const raw = item.rawItem as { riskLevel?: unknown; risk_level?: unknown; risk?: unknown };
  const candidate = raw.riskLevel || raw.risk_level || raw.risk;
  return candidate === 'low' || candidate === 'medium' || candidate === 'high' ? candidate : 'unknown';
}

function summarizeArguments(argumentsJson: string | undefined) {
  if (!argumentsJson?.trim()) return 'No arguments provided.';
  const compact = argumentsJson.trim().replace(/\s+/g, ' ');
  return compact.length > 500 ? `${compact.slice(0, 497)}...` : compact;
}

export function approvalIdForItem(item: RunToolApprovalItem, index: number) {
  return rawCallId(item) || (item.rawItem as { id?: string }).id || `${item.name || item.toolName || 'tool'}-${index + 1}`;
}

export function summarizeApprovalItem(item: RunToolApprovalItem, sessionId: string, index: number): PendingSdkApprovalRecord {
  const callId = rawCallId(item);
  const itemId = (item.rawItem as { id?: string }).id;
  return {
    approvalId: approvalIdForItem(item, index),
    toolName: item.name || item.toolName || 'unknown_tool',
    argumentsSummary: summarizeArguments(item.arguments),
    riskLevel: rawRiskLevel(item),
    sessionId,
    allowedDecisions: ['approve', 'reject', 'cancel'],
    ...(callId ? { callId } : {}),
    ...(itemId ? { itemId } : {}),
  };
}

export function savePendingSdkApproval(sessionId: string, runState: string, interruptions: RunToolApprovalItem[]) {
  const now = new Date().toISOString();
  const existing = pendingApprovals.get(sessionId);
  const record: PendingSdkApproval = {
    sessionId,
    runState,
    approvals: interruptions.map((item, index) => summarizeApprovalItem(item, sessionId, index)),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  pendingApprovals.set(sessionId, record);
  return record;
}

export function getPendingSdkApproval(sessionId: string) {
  return pendingApprovals.get(sessionId);
}

export function clearPendingSdkApproval(sessionId: string) {
  pendingApprovals.delete(sessionId);
}

export function isApprovalReply(message: string) {
  const normalized = message.trim().replace(/[“”]/g, '"').replace(/[’]/g, "'").replace(/\s+/g, ' ').toLowerCase();
  return /^(i\s+approve|approve|approved|yes|yes,?\s+approve|confirm|confirmed)[.!\s]*$/.test(normalized);
}

export function formatApprovalPrompt(approval: PendingSdkApproval) {
  const items = approval.approvals.length
    ? approval.approvals
        .map((item) => {
          return `- approvalId: ${item.approvalId}; tool: ${item.toolName}; risk: ${item.riskLevel}; arguments: ${item.argumentsSummary}; decisions: ${item.allowedDecisions.join(', ')}`;
        })
        .join('\n')
    : '- A tool call requires approval.';

  const instruction = approval.approvals.length === 1
    ? 'Reply with an explicit approval decision (approve/reject/cancel and approvalId), or reply "I approve" to approve this single pending item.'
    : 'Multiple approvals are pending. Reply with an explicit approval decision and approvalId for each item; natural-language approval is ambiguous.';

  return `Approval required before I can continue. Please review the pending SDK tool call(s):\n${items}\n\n${instruction}`;
}
