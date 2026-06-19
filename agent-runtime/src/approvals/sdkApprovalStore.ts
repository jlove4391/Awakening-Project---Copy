import type { RunToolApprovalItem } from '@openai/agents';

export interface PendingSdkApproval {
  sessionId: string;
  runState: string;
  approvalItems: Array<{
    name?: string;
    callId?: string;
    itemId?: string;
    arguments?: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

const pendingApprovals = new Map<string, PendingSdkApproval>();

function rawCallId(item: RunToolApprovalItem) {
  const raw = item.rawItem as { callId?: string; call_id?: string; id?: string };
  return raw.callId || raw.call_id || raw.id;
}

export function summarizeApprovalItem(item: RunToolApprovalItem): PendingSdkApproval['approvalItems'][number] {
  return {
    name: item.name || item.toolName,
    callId: rawCallId(item),
    itemId: (item.rawItem as { id?: string }).id,
    arguments: item.arguments,
  };
}

export function savePendingSdkApproval(sessionId: string, runState: string, interruptions: RunToolApprovalItem[]) {
  const now = new Date().toISOString();
  const existing = pendingApprovals.get(sessionId);
  const record: PendingSdkApproval = {
    sessionId,
    runState,
    approvalItems: interruptions.map(summarizeApprovalItem),
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
  const items = approval.approvalItems.length
    ? approval.approvalItems
        .map((item, index) => {
          const label = item.name || item.callId || item.itemId || `approval ${index + 1}`;
          const args = item.arguments ? ` with arguments ${item.arguments}` : '';
          return `- ${label}${args}`;
        })
        .join('\n')
    : '- A tool call requires approval.';

  return `Approval required before I can continue. Please review the pending SDK tool call(s):\n${items}\n\nReply \"I approve\" to approve and resume this run.`;
}
