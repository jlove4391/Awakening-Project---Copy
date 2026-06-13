import { randomUUID } from 'node:crypto';
import type { ApprovalRequest, LeadRecord } from '../leadgen/types.js';
import { shouldPreventOutreachSend } from '../outreach/optOut.js';
import type { ApprovedSendRequest, OptOutRecord, ReplyClassification, SentEmailReceipt } from '../outreach/types.js';

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled' | (string & {});
export type CampaignGuardrailDecision = 'allow' | 'block' | 'pause';
export type CampaignGuardrailSeverity = 'info' | 'warning' | 'blocker';

export interface CampaignRecord {
  id: string;
  name?: string;
  status: CampaignStatus;
  allowMassSend?: boolean;
  manuallyApprovedRegulatedOutreach?: boolean;
  regulatedIndustryApproval?: ApprovalRequest;
  pausedAt?: string;
  pausedReason?: string;
  metadata?: Record<string, unknown>;
}

export interface CampaignLeadApproval {
  leadId: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | (string & {});
  approvedBy?: string;
  approvedAt?: string;
  note?: string;
  metadata?: Record<string, unknown>;
}

export interface CampaignGuardrailSendCandidate {
  lead: LeadRecord;
  sendRequest?: ApprovedSendRequest;
  leadApproval?: CampaignLeadApproval | ApprovalRequest;
  receipts?: SentEmailReceipt[];
}

export interface CampaignComplaintSignal {
  id?: string;
  leadId?: string;
  email?: string;
  source: 'reply' | 'provider' | 'manual' | 'webhook' | (string & {});
  message?: string;
  receivedAt?: string;
  classification?: ReplyClassification;
  metadata?: Record<string, unknown>;
}

export interface CampaignGuardrailInput {
  campaign: CampaignRecord;
  candidates: CampaignGuardrailSendCandidate[];
  optOutRecords?: OptOutRecord[];
  complaintSignals?: CampaignComplaintSignal[];
  error?: unknown;
  now?: string;
}

export interface CampaignGuardrailViolation {
  code:
    | 'campaign_paused'
    | 'mass_send_blocked'
    | 'per_lead_approval_required'
    | 'opt_out_suppressed'
    | 'regulated_industry_requires_manual_approval'
    | 'send_receipt_required'
    | 'campaign_paused_on_error'
    | 'campaign_paused_on_complaint';
  severity: CampaignGuardrailSeverity;
  message: string;
  leadId?: string;
  metadata?: Record<string, unknown>;
}

export interface CampaignGuardrailReceipt {
  id: string;
  campaignId: string;
  checkedAt: string;
  decision: CampaignGuardrailDecision;
  violations: CampaignGuardrailViolation[];
  candidateCount: number;
  sendReceiptCount: number;
  metadata?: Record<string, unknown>;
}

export interface CampaignGuardrailResult {
  ok: boolean;
  decision: CampaignGuardrailDecision;
  campaign: CampaignRecord;
  allowedLeadIds: string[];
  blockedLeadIds: string[];
  violations: CampaignGuardrailViolation[];
  receipt: CampaignGuardrailReceipt;
  message: string;
}

const REGULATED_INDUSTRY_TERMS = [
  'bank',
  'banking',
  'broker',
  'credit',
  'crypto',
  'debt',
  'financial services',
  'fintech',
  'insurance',
  'investment',
  'legal',
  'law firm',
  'loan',
  'medical',
  'mortgage',
  'pharma',
  'pharmaceutical',
  'healthcare',
  'real estate',
  'securities',
];

function normalize(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function isApproved(approval: CampaignLeadApproval | ApprovalRequest | undefined) {
  if (!approval || normalize(approval.status) !== 'approved') return false;
  const reviewer = (approval as { approvedBy?: string; reviewedBy?: string }).approvedBy || (approval as { approvedBy?: string; reviewedBy?: string }).reviewedBy;
  return Boolean(reviewer);
}

function recipientCount(sendRequest: ApprovedSendRequest | undefined) {
  if (!sendRequest) return 0;
  return [...(sendRequest.to || []), ...(sendRequest.cc || []), ...(sendRequest.bcc || [])].map((value) => value.trim()).filter(Boolean).length;
}

function hasManualRegulatedApproval(campaign: CampaignRecord) {
  return campaign.manuallyApprovedRegulatedOutreach === true || normalize(campaign.regulatedIndustryApproval?.status) === 'approved';
}

function leadIndustryText(lead: LeadRecord) {
  const enrichment = lead.enrichment || {};
  const values = [lead.market, lead.company, lead.title, ...(lead.signals || []), enrichment.industry, enrichment.naicsDescription, enrichment.sector];
  return values.map(normalize).filter(Boolean).join(' ');
}

export function isRegulatedIndustryLead(lead: LeadRecord) {
  const text = leadIndustryText(lead);
  return REGULATED_INDUSTRY_TERMS.some((term) => text.includes(term));
}

function hasReceiptForCandidate(candidate: CampaignGuardrailSendCandidate) {
  if (!candidate.sendRequest) return false;
  return (candidate.receipts || []).some((receipt) => receipt.sendRequestId === candidate.sendRequest?.id && Boolean(receipt.id) && Boolean(receipt.sentAt));
}

function isComplaintSignal(signal: CampaignComplaintSignal) {
  const replyClass = signal.classification?.replyClass;
  const text = normalize([signal.message, signal.classification?.summary].filter(Boolean).join(' '));
  return replyClass === 'unsubscribe/do not contact' || text.includes('complaint') || text.includes('spam') || text.includes('abuse') || text.includes('do not contact');
}

export function pauseCampaign(campaign: CampaignRecord, reason: string, pausedAt = new Date().toISOString()): CampaignRecord {
  return {
    ...campaign,
    status: 'paused',
    pausedAt,
    pausedReason: reason,
    metadata: {
      ...(campaign.metadata || {}),
      pausedByGuardrail: true,
      pausedReason: reason,
      pausedAt,
    },
  };
}

export function evaluateCampaignGuardrails(input: CampaignGuardrailInput): CampaignGuardrailResult {
  const now = input.now || new Date().toISOString();
  const violations: CampaignGuardrailViolation[] = [];
  const allowedLeadIds = new Set<string>();
  const blockedLeadIds = new Set<string>();

  if (normalize(input.campaign.status) === 'paused') {
    violations.push({ code: 'campaign_paused', severity: 'blocker', message: `Campaign ${input.campaign.id} is paused and cannot send.` });
  }

  const totalRecipients = input.candidates.reduce((sum, candidate) => sum + recipientCount(candidate.sendRequest), 0);
  if (input.campaign.allowMassSend !== true && (input.candidates.length > 1 || totalRecipients > 1)) {
    violations.push({
      code: 'mass_send_blocked',
      severity: 'blocker',
      message: 'Mass-send is disabled by default; evaluate and send exactly one approved lead at a time unless allowMassSend is explicitly true.',
      metadata: { candidateCount: input.candidates.length, recipientCount: totalRecipients },
    });
  }

  for (const candidate of input.candidates) {
    const leadId = candidate.lead.id;
    let blocked = false;

    if (!isApproved(candidate.leadApproval) || normalize(candidate.sendRequest?.approvedBy) === '') {
      blocked = true;
      violations.push({ code: 'per_lead_approval_required', severity: 'blocker', leadId, message: `Lead ${leadId} requires explicit per-lead approval before outreach.` });
    }

    if (shouldPreventOutreachSend(candidate.lead, input.optOutRecords || [])) {
      blocked = true;
      violations.push({ code: 'opt_out_suppressed', severity: 'blocker', leadId, message: `Lead ${leadId} is suppressed by opt-out/do-not-contact guardrails.` });
    }

    if (isRegulatedIndustryLead(candidate.lead) && !hasManualRegulatedApproval(input.campaign)) {
      blocked = true;
      violations.push({
        code: 'regulated_industry_requires_manual_approval',
        severity: 'blocker',
        leadId,
        message: `Lead ${leadId} appears to be in a regulated industry and requires manual campaign approval before outreach.`,
      });
    }

    if (candidate.sendRequest && !hasReceiptForCandidate(candidate)) {
      blocked = true;
      violations.push({ code: 'send_receipt_required', severity: 'blocker', leadId, message: `Lead ${leadId} send request ${candidate.sendRequest.id} must produce and retain a send receipt.` });
    }

    if (blocked) blockedLeadIds.add(leadId);
    else allowedLeadIds.add(leadId);
  }

  const complaintSignals = (input.complaintSignals || []).filter(isComplaintSignal);
  if (input.error) {
    violations.push({ code: 'campaign_paused_on_error', severity: 'blocker', message: 'Campaign paused because an error signal was provided.', metadata: { error: input.error instanceof Error ? input.error.message : String(input.error) } });
  }
  if (complaintSignals.length > 0) {
    violations.push({ code: 'campaign_paused_on_complaint', severity: 'blocker', message: 'Campaign paused because a complaint or unsubscribe signal was detected.', metadata: { complaintSignalIds: complaintSignals.map((signal) => signal.id).filter(Boolean) } });
  }

  const shouldPause = Boolean(input.error) || complaintSignals.length > 0;
  const campaign = shouldPause ? pauseCampaign(input.campaign, input.error ? 'error_signal' : 'complaint_signal', now) : input.campaign;
  const decision: CampaignGuardrailDecision = shouldPause ? 'pause' : violations.some((violation) => violation.severity === 'blocker') ? 'block' : 'allow';
  const receipt: CampaignGuardrailReceipt = {
    id: randomUUID(),
    campaignId: input.campaign.id,
    checkedAt: now,
    decision,
    violations,
    candidateCount: input.candidates.length,
    sendReceiptCount: input.candidates.reduce((sum, candidate) => sum + (candidate.receipts || []).length, 0),
    metadata: { guardrails: ['no_mass_send_by_default', 'per_lead_approval', 'opt_out_suppression', 'regulated_industry_manual_approval', 'send_receipts', 'pause_on_error_or_complaint'] },
  };

  return {
    ok: decision === 'allow',
    decision,
    campaign,
    allowedLeadIds: [...allowedLeadIds],
    blockedLeadIds: [...blockedLeadIds],
    violations,
    receipt,
    message: decision === 'allow' ? 'Campaign guardrails passed.' : decision === 'pause' ? `Campaign ${campaign.id} paused by guardrails.` : 'Campaign guardrails blocked one or more sends.',
  };
}
