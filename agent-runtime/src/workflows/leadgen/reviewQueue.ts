import type { ApprovalRequest, LeadInboxItem, LeadRecord, LeadReviewStatus, LeadScore } from './types.js';

export interface LeadReviewQueueOptions {
  /** Leads at or above this compliance-risk score are hidden unless manually approved. */
  highComplianceRiskThreshold?: number;
  /** Lead ids that a human has explicitly approved for review despite compliance risk. */
  manuallyApprovedLeadIds?: string[];
  /** Optional owner to stamp on generated inbox items. */
  assignedTo?: string;
  /** Optional timestamp override for deterministic tests/callers. */
  now?: Date;
}

const DEFAULT_HIGH_COMPLIANCE_RISK_THRESHOLD = 70;

function scoreValue(lead: LeadRecord) {
  if (typeof lead.score === 'number' && Number.isFinite(lead.score)) return lead.score;
  if (typeof lead.scoreDetails?.value === 'number' && Number.isFinite(lead.scoreDetails.value)) return lead.scoreDetails.value;
  return 0;
}

function estimatedValue(lead: LeadRecord) {
  const value = lead.scoreDimensions?.estimatedValue ?? lead.scoreDetails?.dimensions?.estimatedValue;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function complianceRisk(lead: LeadRecord) {
  const risk = lead.scoreDimensions?.complianceRisk ?? lead.scoreDetails?.dimensions?.complianceRisk;
  return typeof risk === 'number' && Number.isFinite(risk) ? risk : 0;
}

function recommendedFirstOffer(lead: LeadRecord) {
  return (
    lead.scoreDimensions?.recommendedFirstOffer ||
    lead.scoreDetails?.dimensions?.recommendedFirstOffer ||
    'Low-risk revenue operations assessment'
  );
}

function metadataFlag(lead: LeadRecord, key: string) {
  return lead.enrichment?.[key] === true || lead.crm?.[key] === true || lead.scoreDetails?.metadata?.[key] === true;
}

function isManuallyApproved(lead: LeadRecord, manuallyApprovedLeadIds: Set<string>) {
  return (
    manuallyApprovedLeadIds.has(lead.id) ||
    lead.status === 'approved' ||
    metadataFlag(lead, 'manualApproval') ||
    metadataFlag(lead, 'manuallyApproved') ||
    metadataFlag(lead, 'complianceApproved')
  );
}

function reviewStatus(lead: LeadRecord, isHighComplianceRisk: boolean, manuallyApproved: boolean): LeadReviewStatus {
  if (isHighComplianceRisk && manuallyApproved) return 'manually_approved_compliance_risk';
  if (scoreValue(lead) <= 0) return 'needs_scoring';
  return 'ready_for_review';
}

function priorityFor(lead: LeadRecord, isHighComplianceRisk: boolean): LeadInboxItem['priority'] {
  const score = scoreValue(lead);
  const value = estimatedValue(lead);

  if (isHighComplianceRisk) return 'high';
  if (score >= 85 || value >= 25000) return 'urgent';
  if (score >= 70 || value >= 15000) return 'high';
  if (score >= 50 || value >= 7500) return 'medium';
  return 'low';
}

function scoreForInbox(lead: LeadRecord): LeadScore | undefined {
  if (lead.scoreDetails) return lead.scoreDetails;
  if (typeof lead.score !== 'number' || !Number.isFinite(lead.score)) return undefined;

  return {
    value: lead.score,
    dimensions: lead.scoreDimensions,
    reasons: lead.scoreReasons,
    scoredAt: lead.updatedAt,
    scoredBy: 'leadgen.score',
  };
}

function approvedComplianceRequest(lead: LeadRecord, now: string): ApprovalRequest {
  return {
    id: `leadgen-compliance-${lead.id}`,
    leadId: lead.id,
    action: 'leadgen.review_compliance_risk',
    status: 'approved',
    requestedBy: 'leadgen.review_queue',
    requestedAt: lead.updatedAt || now,
    reviewedBy: 'manual',
    reviewedAt: now,
    note: 'High compliance-risk lead manually approved for review queue.',
  };
}

function toInboxItem(
  lead: LeadRecord,
  options: Required<Pick<LeadReviewQueueOptions, 'highComplianceRiskThreshold'>> & Pick<LeadReviewQueueOptions, 'assignedTo'>,
  manuallyApprovedLeadIds: Set<string>,
  now: string,
): LeadInboxItem | undefined {
  const risk = complianceRisk(lead);
  const isHighComplianceRisk = risk >= options.highComplianceRiskThreshold;
  const manuallyApproved = isManuallyApproved(lead, manuallyApprovedLeadIds);

  if (isHighComplianceRisk && !manuallyApproved) return undefined;

  const firstOffer = recommendedFirstOffer(lead);
  const itemReviewStatus = reviewStatus(lead, isHighComplianceRisk, manuallyApproved);

  return {
    id: `lead-inbox-${lead.id}`,
    leadId: lead.id,
    title: `${lead.fullName} — ${lead.title}`,
    company: lead.company,
    contactName: lead.fullName,
    status: lead.status,
    score: scoreForInbox(lead),
    priority: priorityFor(lead, isHighComplianceRisk),
    source: lead.source,
    tags: [
      'leadgen',
      itemReviewStatus,
      ...(isHighComplianceRisk ? ['high-compliance-risk'] : []),
      ...(lead.market ? [lead.market] : []),
    ],
    assignedTo: options.assignedTo,
    createdAt: lead.updatedAt || now,
    updatedAt: now,
    recommendedFirstOffer: firstOffer,
    reviewStatus: itemReviewStatus,
    approvalRequest: isHighComplianceRisk ? approvedComplianceRequest(lead, now) : undefined,
    metadata: {
      estimatedValue: estimatedValue(lead),
      complianceRisk: risk,
      geography: lead.geography,
      signals: lead.signals,
      sourceLeadStatus: lead.status,
    },
  };
}

export function reviewLeadQueue(leads: LeadRecord[], options: LeadReviewQueueOptions = {}): LeadInboxItem[] {
  const highComplianceRiskThreshold = options.highComplianceRiskThreshold ?? DEFAULT_HIGH_COMPLIANCE_RISK_THRESHOLD;
  const manuallyApprovedLeadIds = new Set(options.manuallyApprovedLeadIds || []);
  const now = (options.now || new Date()).toISOString();

  return leads
    .map((lead) => toInboxItem(lead, { highComplianceRiskThreshold, assignedTo: options.assignedTo }, manuallyApprovedLeadIds, now))
    .filter((item): item is LeadInboxItem => Boolean(item))
    .sort((a, b) => {
      const scoreDelta = (b.score?.value ?? 0) - (a.score?.value ?? 0);
      if (scoreDelta !== 0) return scoreDelta;

      const valueDelta = Number(b.metadata?.estimatedValue ?? 0) - Number(a.metadata?.estimatedValue ?? 0);
      if (valueDelta !== 0) return valueDelta;

      return a.title.localeCompare(b.title);
    });
}
