import { randomUUID } from 'node:crypto';
import { createWorkflowExecutionRecord, writeCompletedWorkflowExecutionReceipt } from '../receipts.js';
import { remember } from '../../memory/index.js';
import type { LeadRecord } from '../leadgen/types.js';
import type { RuntimeContext } from '../../types.js';
import type { OptOutRecord, ReplyClassification } from './types.js';

export interface OptOutDetectionInput {
  text: string;
  subject?: string;
}

export interface OptOutDetectionResult {
  explicit: boolean;
  matchedPhrase?: string;
  reason: string;
}

export interface OptOutUpdateReceipt {
  id: string;
  leadId: string;
  email?: string;
  optOutRecordId: string;
  status: 'opted_out';
  action: 'outreach.opt_out';
  requestedAt: string;
  recordedAt: string;
  source: OptOutRecord['source'];
  reason: string;
  preservedLead: true;
  metadata?: Record<string, unknown>;
}

export interface OptOutInput {
  lead: LeadRecord;
  messageText?: string;
  subject?: string;
  source?: OptOutRecord['source'];
  requestedAt?: string;
  recordedAt?: string;
  receiptId?: string;
  replyClassification?: ReplyClassification;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface OptOutResult {
  ok: boolean;
  status: 'opted_out' | 'not_opt_out';
  workflow: 'outreach';
  lead: LeadRecord;
  optOutRecord?: OptOutRecord;
  receipt?: OptOutUpdateReceipt;
  executionReceipt?: { id: string; summary: string; status: string };
  memoryIds?: string[];
  detection: OptOutDetectionResult;
  message: string;
}

const EXPLICIT_OPT_OUT_PATTERNS: RegExp[] = [
  /\bunsubscribe\b/i,
  /\bopt\s*-?\s*out\b/i,
  /\bremove me(?: from (?:your|the|this) (?:list|emails?|mailing list|database))?\b/i,
  /\btake me off(?: (?:your|the|this) (?:list|emails?|mailing list|database))?\b/i,
  /\bdo not (?:email|contact|message|call|text|send)\b/i,
  /\bdon't (?:email|contact|message|call|text|send)\b/i,
  /\bstop (?:emailing|contacting|messaging|calling|texting|sending)\b/i,
  /\bno (?:further|more) (?:emails?|contact|messages?|calls?|texts?)\b/i,
  /\b(?:please )?(?:delete|remove) (?:my|this) (?:email|contact info|contact information)\b/i,
  /\bnever (?:email|contact|message|call|text) me\b/i,
];

function normalizeEmail(email: string | undefined) {
  return (email || '').trim().toLowerCase();
}

function combinedText(input: OptOutDetectionInput) {
  return [input.subject, input.text].filter(Boolean).join('\n').trim();
}

export function detectOptOutLanguage(input: OptOutDetectionInput): OptOutDetectionResult {
  const text = combinedText(input);
  if (!text) {
    return { explicit: false, reason: 'No reply text or subject was provided to inspect for opt-out language.' };
  }

  for (const pattern of EXPLICIT_OPT_OUT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return {
        explicit: true,
        matchedPhrase: match[0],
        reason: `Matched explicit unsubscribe/do-not-contact language: "${match[0]}".`,
      };
    }
  }

  return { explicit: false, reason: 'No explicit unsubscribe/do-not-contact language was detected.' };
}

export function shouldPreventOutreachSend(lead: LeadRecord, optOutRecords: OptOutRecord[] = []) {
  const status = String(lead.status || '').trim().toLowerCase();
  if (['opt_out', 'opted_out', 'unsubscribed', 'unsubscribe', 'do_not_contact', 'do not contact'].includes(status)) return true;
  if (status.includes('opt-out') || status.includes('unsubscribe') || status.includes('do_not_contact')) return true;

  const enrichment = (lead.enrichment || {}) as Record<string, unknown>;
  if (enrichment.optOut === true || enrichment.optedOut === true || enrichment.unsubscribed === true || enrichment.doNotContact === true) return true;

  const leadEmail = normalizeEmail(lead.email);
  return optOutRecords.some((record) => {
    const sameLead = Boolean(record.leadId && record.leadId === lead.id);
    const sameEmail = Boolean(leadEmail && normalizeEmail(record.email) === leadEmail);
    return sameLead || sameEmail;
  });
}

export function markLeadOptedOut(lead: LeadRecord, optOutRecord: OptOutRecord, receipt: OptOutUpdateReceipt): LeadRecord {
  return {
    ...lead,
    status: 'do_not_contact',
    enrichment: {
      ...(lead.enrichment || {}),
      optOut: true,
      optedOut: true,
      unsubscribed: true,
      doNotContact: true,
      optOutRecordId: optOutRecord.id,
      optOutReceiptId: receipt.id,
      optOutReason: optOutRecord.reason,
      optOutRequestedAt: optOutRecord.requestedAt,
      optOutRecordedAt: optOutRecord.recordedAt,
      futureOutreachSuppressed: true,
    },
    updatedAt: optOutRecord.recordedAt,
  };
}

async function writeOptOutExecution(input: OptOutInput, context: RuntimeContext, updatedLead: LeadRecord, optOutRecord: OptOutRecord, receipt: OptOutUpdateReceipt) {
  const record = createWorkflowExecutionRecord({
    workflow: 'outreach',
    context,
    action: 'outreach.opt_out',
    inputPayload: {
      leadId: input.lead.id,
      email: input.lead.email,
      optOutRecordId: optOutRecord.id,
      source: optOutRecord.source,
      reason: optOutRecord.reason,
    },
    riskLevel: 'write',
    approvalStatus: 'not_required',
    executionResult: { lead: updatedLead, optOutRecord, receipt },
    providerResponseSummary: `status=opted_out; id=${optOutRecord.id}`,
    status: 'running',
    startedAt: optOutRecord.recordedAt,
    receiptSummary: `Opt-out update requested for lead ${input.lead.id}`,
  });

  return writeCompletedWorkflowExecutionReceipt(record, {
    status: 'completed',
    executionResult: { lead: updatedLead, optOutRecord, receipt },
    approvalStatus: 'not_required',
    completedAt: optOutRecord.recordedAt,
    receiptSummary: `Recorded opt-out/do-not-contact update for lead ${input.lead.id}; lead preserved with audit history.`,
  });
}

export async function recordOptOut(input: OptOutInput, context: RuntimeContext): Promise<OptOutResult> {
  const classificationOptOut = input.replyClassification?.replyClass === 'unsubscribe/do not contact';
  const detection = detectOptOutLanguage({ text: input.messageText || input.replyClassification?.summary || '', subject: input.subject });
  const source = input.source || (input.replyClassification ? 'reply' : 'manual');
  const explicit = detection.explicit || classificationOptOut || source === 'manual';

  if (!explicit) {
    return {
      ok: false,
      status: 'not_opt_out',
      workflow: 'outreach',
      lead: input.lead,
      detection,
      message: `Lead ${input.lead.id} was not changed because no explicit opt-out/do-not-contact request was detected.`,
    };
  }

  const recordedAt = input.recordedAt || new Date().toISOString();
  const requestedAt = input.requestedAt || input.replyClassification?.classifiedAt || recordedAt;
  const reason = input.reason || detection.matchedPhrase || input.replyClassification?.summary || 'Manual opt-out/do-not-contact update.';
  const optOutRecord: OptOutRecord = {
    id: randomUUID(),
    email: normalizeEmail(input.lead.email),
    leadId: input.lead.id,
    receiptId: input.receiptId || input.replyClassification?.receiptId,
    replyClassificationId: input.replyClassification?.id,
    source,
    reason,
    requestedAt,
    recordedAt,
    metadata: {
      ...input.metadata,
      detection,
      replyClassificationId: input.replyClassification?.id,
      preserveLead: true,
      futureOutreachSuppressed: true,
    },
  };

  const receipt: OptOutUpdateReceipt = {
    id: randomUUID(),
    leadId: input.lead.id,
    email: normalizeEmail(input.lead.email) || undefined,
    optOutRecordId: optOutRecord.id,
    status: 'opted_out',
    action: 'outreach.opt_out',
    requestedAt,
    recordedAt,
    source,
    reason,
    preservedLead: true,
    metadata: {
      priorStatus: input.lead.status,
      newStatus: 'do_not_contact',
      futureOutreachSuppressed: true,
    },
  };

  const updatedLead = markLeadOptedOut(input.lead, optOutRecord, receipt);
  const executionReceipt = await writeOptOutExecution(input, context, updatedLead, optOutRecord, receipt);
  const memory = await remember(context.sessionId, `Lead ${updatedLead.fullName} at ${updatedLead.company} opted out; future outreach is suppressed and the lead was preserved.`, {
    scope: 'leads',
    tags: ['outreach', 'opt-out', 'do_not_contact'],
    metadata: { lead: updatedLead, optOutRecord, receipt },
    importance: 0.9,
    source: 'agent',
  });

  return {
    ok: true,
    status: 'opted_out',
    workflow: 'outreach',
    lead: updatedLead,
    optOutRecord,
    receipt,
    executionReceipt,
    memoryIds: [memory.id],
    detection,
    message: `Recorded opt-out/do-not-contact for lead ${updatedLead.id}; future outreach sends are suppressed and the lead was preserved.`,
  };
}
