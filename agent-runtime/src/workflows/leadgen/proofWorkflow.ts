import { randomUUID } from 'node:crypto';
import { remember } from '../../memory/index.js';
import { sendApprovedEmail } from '../outreach/sendApprovedEmail.js';
import type { ApprovedSendRequest, SentEmailReceipt } from '../outreach/types.js';
import { createWorkflowExecutionRecord, summarizeProviderResponse, writeCompletedWorkflowExecutionReceipt, type WorkflowExecutionReceipt } from '../receipts.js';
import { attachOutreachDrafts } from './draftOutreach.js';
import { defineIcp } from './defineIcp.js';
import { reviewLeadQueue } from './reviewQueue.js';
import { scoreLeads } from './score.js';
import { sourceLeadsForMode } from './source.js';
import type { LeadInboxItem, LeadRecord, LeadgenIcpInput, LeadgenSourceMode, LeadgenStepContext } from './types.js';

export interface LeadgenProofWorkflowInput extends LeadgenIcpInput {
  sourceMode?: LeadgenSourceMode;
  approvalMessage?: string;
  approvalNote?: string;
  followUpDays?: number;
  assignedTo?: string;
}

export interface LeadgenProofWorkflowResult {
  ok: boolean;
  status: 'approval_required' | 'sent' | 'blocked' | 'failed';
  workflow: 'leadgen';
  sessionId: string;
  lead?: LeadRecord;
  inboxItem?: LeadInboxItem;
  sendRequest?: ApprovedSendRequest;
  sentReceipt?: SentEmailReceipt;
  receipts: WorkflowExecutionReceipt[];
  memoryIds: string[];
  message: string;
}

function isJordanApproval(message: string | undefined) {
  return /^i\s+approve[.!\s]*$/i.test(String(message || '').trim().replace(/\s+/g, ' '));
}

function toOutreachDraftRecord(lead: LeadRecord) {
  const draft = lead.outreachDraft;
  return {
    id: `leadgen-proof-draft-${lead.id}`,
    leadId: lead.id,
    contactEmail: lead.email || '',
    contactName: lead.fullName,
    company: lead.company,
    subject: draft?.subject || `${lead.company} + ${lead.market}`,
    body: draft?.body || '',
    callToAction: draft?.callToAction,
    status: 'ready_for_approval' as const,
    createdAt: lead.updatedAt,
    updatedAt: lead.updatedAt,
    metadata: { source: 'leadgen.proof_workflow' },
  };
}

async function writeProofReceipt(input: LeadgenProofWorkflowInput, context: LeadgenStepContext, result: unknown, summary: string, status: 'completed' | 'failed' = 'completed') {
  const record = createWorkflowExecutionRecord({
    workflow: 'leadgen',
    context,
    action: 'leadgen.live_proof_workflow',
    inputPayload: {
      market: input.market,
      sourceMode: input.sourceMode,
      limit: 1,
      approvalMessage: input.approvalMessage ? '[provided]' : '',
    },
    riskLevel: 'external_send',
    approvalStatus: isJordanApproval(input.approvalMessage) ? 'approved' : 'pending',
    executionResult: result,
    providerResponseSummary: summarizeProviderResponse(result),
    status: 'running',
    receiptSummary: 'Lead-gen proof workflow requested',
  });

  return writeCompletedWorkflowExecutionReceipt(record, {
    status,
    executionResult: result,
    providerResponseSummary: summarizeProviderResponse(result),
    approvalStatus: isJordanApproval(input.approvalMessage) ? 'approved' : 'pending',
    receiptSummary: summary,
  });
}

export async function runLeadgenProofWorkflow(input: LeadgenProofWorkflowInput, context: LeadgenStepContext): Promise<LeadgenProofWorkflowResult> {
  const icp = defineIcp({ ...input, limit: 1 });
  const sourced = await sourceLeadsForMode(icp, input.sourceMode || 'sheets');
  const [scoredLead] = scoreLeads(sourced.slice(0, 1), icp);

  if (!scoredLead) {
    const receipt = await writeProofReceipt(input, context, { ok: false, status: 'failed', reason: 'no_lead_imported' }, 'Lead-gen proof workflow imported no leads.', 'failed');
    return { ok: false, status: 'failed', workflow: 'leadgen', sessionId: context.sessionId, receipts: [receipt], memoryIds: [], message: 'No lead was imported from the selected source.' };
  }

  const [inboxItem] = reviewLeadQueue([scoredLead], { assignedTo: input.assignedTo || 'Jordan' });
  const [draftedLead] = attachOutreachDrafts([scoredLead]);
  const draft = toOutreachDraftRecord(draftedLead);
  const memory = await remember(context.sessionId, `Lead-gen proof workflow drafted one email for ${draftedLead.fullName} at ${draftedLead.company}; awaiting Jordan approval.`, {
    id: `leadgen-proof-${draftedLead.id}`,
    scope: 'leads',
    tags: ['leadgen', 'proof', 'inbox', 'drafted'],
    metadata: { lead: draftedLead, inboxItem, draft, approvalPrompt: 'Jordan, reply exactly: I approve' },
    importance: Math.max(0.5, (draftedLead.score || 50) / 100),
    source: 'agent',
  });

  if (!isJordanApproval(input.approvalMessage)) {
    const receipt = await writeProofReceipt(input, context, { leadId: draftedLead.id, inboxItemId: inboxItem?.id, draftId: draft.id }, `Drafted one lead-gen email for ${draftedLead.id}; awaiting Jordan approval.`);
    return {
      ok: false,
      status: 'approval_required',
      workflow: 'leadgen',
      sessionId: context.sessionId,
      lead: draftedLead,
      inboxItem,
      receipts: [receipt],
      memoryIds: [memory.id],
      message: 'Jordan approval required. Reply exactly `I approve` to send one Gmail email.',
    };
  }

  const approvedAt = new Date().toISOString();
  const sendRequest: ApprovedSendRequest = {
    id: randomUUID(),
    draftId: draft.id,
    approvedBy: 'Jordan',
    approvedAt,
    to: [draft.contactEmail],
    cc: [],
    bcc: [],
    subject: draft.subject,
    body: draft.body,
    approvalNote: input.approvalNote || 'Jordan said "I approve".',
    metadata: { source: 'leadgen.proof_workflow', inboxItemId: inboxItem?.id },
  };

  const sendResult = await sendApprovedEmail({ lead: draftedLead, sendRequest, followUpDays: input.followUpDays || 3, confirmedByUser: true, approvalNote: sendRequest.approvalNote }, context);
  const finalLead = sendResult.lead || draftedLead;
  const receipt = await writeProofReceipt(input, context, { leadId: finalLead.id, sendResult }, sendResult.ok ? `Completed live lead-gen proof workflow for ${finalLead.id}.` : `Lead-gen proof workflow send did not complete for ${finalLead.id}.`, sendResult.ok ? 'completed' : 'failed');

  return {
    ok: sendResult.ok,
    status: sendResult.status === 'sent' ? 'sent' : sendResult.status,
    workflow: 'leadgen',
    sessionId: context.sessionId,
    lead: finalLead,
    inboxItem: inboxItem ? { ...inboxItem, followUpStatus: finalLead.status === 'follow_up_scheduled' ? 'scheduled' : inboxItem.followUpStatus, updatedAt: finalLead.updatedAt } : undefined,
    sendRequest,
    sentReceipt: sendResult.receipt,
    receipts: [receipt, ...(sendResult.executionReceipt ? [sendResult.executionReceipt as WorkflowExecutionReceipt] : [])],
    memoryIds: [memory.id, ...(sendResult.memoryIds || [])],
    message: sendResult.message,
  };
}
