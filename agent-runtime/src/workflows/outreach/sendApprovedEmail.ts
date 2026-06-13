import { randomUUID } from 'node:crypto';
import { completeExecutionRecord, createExecutionRecord, summarizeProviderResponse, writeExecutionRecord } from '../../executions.js';
import { remember } from '../../memory/index.js';
import { sendGmailEmail } from '../../providers/google/gmail.js';
import type { ApprovalGateInput, LeadRecord } from '../leadgen/types.js';
import type { RuntimeContext } from '../../types.js';
import type { ApprovedSendRequest, OptOutRecord, SentEmailReceipt } from './types.js';

export interface SendApprovedEmailInput extends ApprovalGateInput {
  lead: LeadRecord;
  sendRequest: ApprovedSendRequest;
  optOutRecords?: OptOutRecord[];
  followUpDueAt?: string;
  followUpDays?: number;
}

interface GmailSendSuccess {
  ok: true;
  provider: string;
  message: { id?: string; threadId?: string };
}

export interface SendApprovedEmailResult {
  ok: boolean;
  status: 'sent' | 'failed' | 'blocked';
  workflow: 'outreach';
  lead?: LeadRecord;
  receipt?: SentEmailReceipt;
  executionReceipt?: { id: string; summary: string; status: string };
  memoryIds?: string[];
  message: string;
}

function blocked(message: string): SendApprovedEmailResult {
  return { ok: false, status: 'blocked', workflow: 'outreach', message };
}

function normalizeEmail(email: string | undefined) {
  return (email || '').trim().toLowerCase();
}

function populated(values: string[] | undefined) {
  return (values || []).map((value) => value.trim()).filter(Boolean);
}

function recipientCount(sendRequest: ApprovedSendRequest) {
  return populated(sendRequest.to).length + populated(sendRequest.cc).length + populated(sendRequest.bcc).length;
}

function hasOptOutStatus(lead: LeadRecord, optOutRecords: OptOutRecord[] = []) {
  const status = String(lead.status || '').trim().toLowerCase();
  const blockedStatuses = new Set(['opt_out', 'opted_out', 'unsubscribed', 'unsubscribe', 'do_not_contact', 'do not contact']);
  if (blockedStatuses.has(status) || status.includes('opt-out') || status.includes('unsubscribe') || status.includes('do_not_contact')) {
    return true;
  }

  const enrichment = (lead.enrichment || {}) as Record<string, unknown>;
  const enrichmentOptOut = enrichment.optOut ?? enrichment.optedOut ?? enrichment.unsubscribed ?? enrichment.doNotContact;
  if (enrichmentOptOut === true) return true;

  const leadEmail = normalizeEmail(lead.email);
  return optOutRecords.some((record) => {
    const sameLead = Boolean(record.leadId && record.leadId === lead.id);
    const sameEmail = Boolean(leadEmail && normalizeEmail(record.email) === leadEmail);
    return sameLead || sameEmail;
  });
}

function nextFollowUpDueAt(input: SendApprovedEmailInput, sentAt: string) {
  if (input.followUpDueAt) return input.followUpDueAt;
  if (!input.followUpDays) return undefined;
  return new Date(Date.parse(sentAt) + Math.max(1, input.followUpDays) * 24 * 60 * 60 * 1000).toISOString();
}

function updateLeadAfterSend(input: SendApprovedEmailInput, receipt: SentEmailReceipt) {
  const followUpDueAt = nextFollowUpDueAt(input, receipt.sentAt);
  const enrichment = {
    ...(input.lead.enrichment || {}),
    lastOutreachReceiptId: receipt.id,
    lastOutreachSentAt: receipt.sentAt,
    lastOutreachProviderMessageId: receipt.providerMessageId,
    lastOutreachThreadId: receipt.threadId,
    ...(followUpDueAt ? { followUpDueAt } : {}),
  };

  return {
    ...input.lead,
    status: followUpDueAt ? ('follow_up_scheduled' as const) : ('contacted' as const),
    enrichment,
    updatedAt: receipt.sentAt,
  };
}

function receiptFromSendResult(input: SendApprovedEmailInput, result: GmailSendSuccess, sentAt: string): SentEmailReceipt {
  const providerMessage = result.message;
  return {
    id: randomUUID(),
    sendRequestId: input.sendRequest.id,
    provider: 'gmail',
    providerMessageId: providerMessage?.id,
    threadId: providerMessage?.threadId,
    to: populated(input.sendRequest.to),
    cc: populated(input.sendRequest.cc),
    bcc: populated(input.sendRequest.bcc),
    subject: input.sendRequest.subject,
    sentAt,
    status: 'sent',
    metadata: {
      leadId: input.lead.id,
      draftId: input.sendRequest.draftId,
      approvedBy: input.sendRequest.approvedBy,
      approvedAt: input.sendRequest.approvedAt,
      approvalNote: input.approvalNote || input.sendRequest.approvalNote,
    },
  };
}

function failedReceipt(input: SendApprovedEmailInput, error: unknown, sentAt: string): SentEmailReceipt {
  return {
    id: randomUUID(),
    sendRequestId: input.sendRequest.id,
    provider: 'gmail',
    to: populated(input.sendRequest.to),
    cc: populated(input.sendRequest.cc),
    bcc: populated(input.sendRequest.bcc),
    subject: input.sendRequest.subject,
    sentAt,
    status: 'failed',
    errorMessage: error instanceof Error ? error.message : String(error),
    metadata: { leadId: input.lead.id, draftId: input.sendRequest.draftId },
  };
}

async function writeSendExecution(
  input: SendApprovedEmailInput,
  context: RuntimeContext,
  receipt: SentEmailReceipt,
  providerResult: unknown,
  status: 'completed' | 'failed',
  errors: string[] = [],
) {
  const record = createExecutionRecord({
    kind: 'runtime_action',
    whoRequested: 'outreach.workflow',
    chosenByAgent: context.agent || 'elora',
    action: 'outreach.send_approved_email',
    inputPayload: {
      leadId: input.lead.id,
      sendRequestId: input.sendRequest.id,
      draftId: input.sendRequest.draftId,
      to: populated(input.sendRequest.to),
      subject: input.sendRequest.subject,
    },
    riskLevel: 'external_send',
    approvalStatus: 'approved',
    executionResult: providerResult,
    providerResponseSummary: summarizeProviderResponse(providerResult),
    linkedIds: { sessionId: context.sessionId, voiceSessionId: context.voiceSessionId },
    status: 'running',
    startedAt: receipt.sentAt,
    receiptSummary: `Approved outreach email requested for lead ${input.lead.id}`,
  });

  const completed = completeExecutionRecord(record, {
    status,
    executionResult: { providerResult, receipt },
    errors,
    approvalStatus: 'approved',
    receiptSummary:
      status === 'completed'
        ? `Sent approved outreach email to ${receipt.to[0]} for lead ${input.lead.id}`
        : `Failed to send approved outreach email to ${receipt.to[0]} for lead ${input.lead.id}`,
  });
  await writeExecutionRecord(completed);
  return { id: completed.id, summary: completed.receipt.summary, status: completed.status };
}

export async function sendApprovedEmail(input: SendApprovedEmailInput, context: RuntimeContext): Promise<SendApprovedEmailResult> {
  if (input.confirmedByUser !== true) {
    return blocked('Approved outreach email sends require confirmedByUser=true before Gmail is called.');
  }

  if (recipientCount(input.sendRequest) !== 1 || populated(input.sendRequest.to).length !== 1) {
    return blocked('Mass sends are blocked: send exactly one email to exactly one lead contact, with no cc or bcc recipients.');
  }

  const leadEmail = normalizeEmail(input.lead.email);
  const recipientEmail = normalizeEmail(input.sendRequest.to[0]);
  if (!leadEmail) return blocked(`Lead ${input.lead.id} does not have an email address to contact.`);
  if (recipientEmail !== leadEmail) {
    return blocked(`Recipient ${input.sendRequest.to[0]} does not match lead ${input.lead.id} email ${input.lead.email}.`);
  }

  if (hasOptOutStatus(input.lead, input.optOutRecords)) {
    return blocked(`Lead ${input.lead.id} has opt-out/do-not-contact status and cannot be emailed.`);
  }

  try {
    const providerResult = await sendGmailEmail({
      to: [input.sendRequest.to[0]],
      subject: input.sendRequest.subject,
      body: input.sendRequest.body,
      confirmedByUser: true,
      approvalNote: input.approvalNote || input.sendRequest.approvalNote,
    });

    if (!providerResult.ok) {
      const providerMessage = typeof providerResult.message === 'string' ? providerResult.message : 'Gmail send was not approved.';
      const receipt = failedReceipt(input, providerResult, new Date().toISOString());
      const executionReceipt = await writeSendExecution(input, context, receipt, providerResult, 'failed', [providerMessage]);
      return { ok: false, status: 'failed', workflow: 'outreach', receipt, executionReceipt, message: providerMessage };
    }

    const receipt = receiptFromSendResult(input, providerResult as GmailSendSuccess, new Date().toISOString());
    const updatedLead = updateLeadAfterSend(input, receipt);
    const executionReceipt = await writeSendExecution(input, context, receipt, providerResult, 'completed');

    const [leadMemory, receiptMemory] = await Promise.all([
      remember(context.sessionId, `Lead ${updatedLead.fullName} at ${updatedLead.company} was emailed; status=${updatedLead.status}.`, {
        scope: 'leads',
        tags: ['outreach', 'gmail', updatedLead.status],
        metadata: { lead: updatedLead, receipt },
        importance: Math.max(0.5, (updatedLead.score || 50) / 100),
        source: 'agent',
      }),
      remember(context.sessionId, `Sent approved outreach email to ${receipt.to[0]} with subject "${receipt.subject}".`, {
        scope: 'contacts',
        tags: ['outreach', 'gmail', 'sent'],
        metadata: { leadId: updatedLead.id, receipt },
        importance: 0.6,
        source: 'agent',
      }),
    ]);

    return {
      ok: true,
      status: 'sent',
      workflow: 'outreach',
      lead: updatedLead,
      receipt,
      executionReceipt,
      memoryIds: [leadMemory.id, receiptMemory.id],
      message: `Sent approved outreach email to ${receipt.to[0]} for lead ${updatedLead.id}.`,
    };
  } catch (error) {
    const receipt = failedReceipt(input, error, new Date().toISOString());
    const executionReceipt = await writeSendExecution(input, context, receipt, { ok: false, error: receipt.errorMessage }, 'failed', [receipt.errorMessage || 'Unknown Gmail send failure']);
    return {
      ok: false,
      status: 'failed',
      workflow: 'outreach',
      receipt,
      executionReceipt,
      message: receipt.errorMessage || 'Gmail send failed.',
    };
  }
}
