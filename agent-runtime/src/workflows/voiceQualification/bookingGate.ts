import type { CallTranscriptRecord, IntakeRecord, LeadRecord } from '@awakening/shared';
import { defaultVoiceQualificationConfig, type VoiceQualificationConfig } from './types.js';
import type { QualificationScoreResult } from '../qualification/scoreQualification.js';
import type { QualificationRecord } from '../qualification/types.js';

export type VoiceQualificationBookingGateStatus = 'allowed' | 'blocked';

export type VoiceQualificationBookingGateReasonCode =
  | 'booking_allowed'
  | 'score_below_threshold'
  | 'missing_qualification_score'
  | 'opt_out_block'
  | 'compliance_block'
  | 'missing_required_transcript_or_form_data'
  | 'jordan_approval_required'
  | 'jordan_rules_block_booking'
  | 'missing_required_booking_criteria';

export interface VoiceQualificationBookingRuleDecision {
  allowed: boolean;
  reason?: string;
  blockedCriteriaIds?: string[];
}

export interface VoiceQualificationBookingRules {
  jordanApproved?: boolean;
  approvedBy?: string;
  approvalNote?: string;
  allowed?: boolean;
  reason?: string;
  satisfiedBookingCriteriaIds?: string[];
  blockedCriteriaIds?: string[];
}

export interface VoiceQualificationBookingGateInput {
  lead?: Partial<Pick<LeadRecord, 'id' | 'status' | 'metadata'>> | null;
  leadId?: string;
  qualificationRecord?: Partial<QualificationRecord> | null;
  qualificationScore?: number | QualificationScoreResult | null;
  minimumQualificationScore?: number;
  callTranscript?: Partial<CallTranscriptRecord> | null;
  transcript?: string;
  intakeRecord?: Partial<IntakeRecord> | null;
  formData?: Record<string, unknown> | null;
  optOutRecords?: Array<Partial<{ leadId?: string; status?: string; reason?: string }> | null | undefined>;
  complianceBlocked?: boolean;
  complianceBlockReason?: string;
  jordanRules?: VoiceQualificationBookingRules | VoiceQualificationBookingRuleDecision;
  voiceQualificationConfig?: VoiceQualificationConfig;
}

export interface VoiceQualificationBookingGateEvidence {
  leadId?: string;
  qualificationScore?: number;
  minimumQualificationScore: number;
  hasTranscriptData: boolean;
  hasFormData: boolean;
  optOutBlocked: boolean;
  complianceBlocked: boolean;
  jordanApproved: boolean;
  jordanApprovedBy?: string;
  satisfiedBookingCriteriaIds: string[];
  missingRequiredBookingCriteriaIds: string[];
  blockedBookingCriteriaIds: string[];
}

export interface VoiceQualificationBookingGateResult {
  status: VoiceQualificationBookingGateStatus;
  allowed: boolean;
  reasonCode: VoiceQualificationBookingGateReasonCode;
  reason: string;
  evidence: VoiceQualificationBookingGateEvidence;
}

const DEFAULT_MINIMUM_QUALIFICATION_SCORE = 68;
const OPT_OUT_STATUSES = new Set(['opt_out', 'opted_out', 'unsubscribed', 'unsubscribe', 'do_not_contact', 'do not contact']);
const COMPLIANCE_BLOCK_STATUSES = new Set(['compliance_blocked', 'manual_compliance_review', 'blocked_compliance', 'do_not_book']);

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalized(value: unknown) {
  return text(value).toLowerCase();
}

function unique(values: string[]) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function resolveLeadId(input: VoiceQualificationBookingGateInput) {
  return text(input.leadId) || text(input.lead?.id) || text(input.qualificationRecord?.leadId) || text(input.callTranscript?.leadId) || text(input.intakeRecord?.leadId) || undefined;
}

function resolveQualificationScore(input: VoiceQualificationBookingGateInput) {
  if (typeof input.qualificationScore === 'number' && Number.isFinite(input.qualificationScore)) {
    return input.qualificationScore;
  }

  if (input.qualificationScore && typeof input.qualificationScore === 'object' && Number.isFinite(input.qualificationScore.score)) {
    return input.qualificationScore.score;
  }

  const recordScore = input.qualificationRecord?.qualificationScore;
  return typeof recordScore === 'number' && Number.isFinite(recordScore) ? recordScore : undefined;
}

function metadataFlag(metadata: LeadRecord['metadata'] | undefined, keys: string[]) {
  return keys.some((key) => metadata?.[key] === true || normalized(metadata?.[key]) === 'true');
}

function hasOptOutBlock(input: VoiceQualificationBookingGateInput, leadId?: string) {
  const leadStatus = normalized(input.lead?.status);
  if (OPT_OUT_STATUSES.has(leadStatus) || leadStatus.includes('opt-out') || leadStatus.includes('unsubscribe') || leadStatus.includes('do_not_contact')) {
    return true;
  }

  if (metadataFlag(input.lead?.metadata, ['optOut', 'optedOut', 'unsubscribed', 'doNotContact'])) {
    return true;
  }

  return (input.optOutRecords ?? []).some((record) => {
    if (!record) return false;
    const recordLeadId = text(record.leadId);
    if (leadId && recordLeadId && recordLeadId !== leadId) return false;
    const status = normalized(record.status);
    return OPT_OUT_STATUSES.has(status) || status.includes('opt-out') || status.includes('unsubscribe') || status.includes('do_not_contact');
  });
}

function hasComplianceBlock(input: VoiceQualificationBookingGateInput) {
  if (input.complianceBlocked) return true;

  const status = normalized(input.qualificationRecord?.status);
  if (COMPLIANCE_BLOCK_STATUSES.has(status)) return true;

  if (input.qualificationScore && typeof input.qualificationScore === 'object') {
    return input.qualificationScore.recommendedNextAction === 'manual_compliance_review' || input.qualificationScore.disqualifiers.includes('unacceptable_compliance_risk');
  }

  return false;
}

function hasTranscriptData(input: VoiceQualificationBookingGateInput) {
  return Boolean(text(input.transcript) || text(input.callTranscript?.transcript) || text(input.callTranscript?.summary));
}

function hasFormData(input: VoiceQualificationBookingGateInput) {
  if (input.formData && Object.keys(input.formData).length > 0) return true;
  if (input.intakeRecord?.responses && Object.keys(input.intakeRecord.responses).length > 0) return true;
  if (text(input.intakeRecord?.summary)) return true;
  return Boolean(input.qualificationRecord && (text(input.qualificationRecord.source) === 'form' || text(input.qualificationRecord.intakeId)));
}

function resolveJordanRules(input: VoiceQualificationBookingGateInput) {
  const config = input.voiceQualificationConfig ?? defaultVoiceQualificationConfig;
  const rules = input.jordanRules ?? {};
  const approvedBy = 'approvedBy' in rules ? text(rules.approvedBy) : '';
  const jordanApproved = Boolean('jordanApproved' in rules && rules.jordanApproved) || approvedBy.toLowerCase() === 'jordan';
  const rulesAllowed = !('allowed' in rules) || rules.allowed !== false;
  const satisfied = unique('satisfiedBookingCriteriaIds' in rules ? rules.satisfiedBookingCriteriaIds ?? [] : []);
  const blocked = unique('blockedCriteriaIds' in rules ? rules.blockedCriteriaIds ?? [] : []);
  const requiredCriteria = config.bookingCriteria.filter((criterion) => criterion.required).map((criterion) => criterion.id);
  const missingRequired = requiredCriteria.filter((criterionId) => !satisfied.includes(criterionId));

  return {
    jordanApproved,
    approvedBy: approvedBy || undefined,
    rulesAllowed,
    rulesReason: text(rules.reason),
    satisfied,
    blocked,
    missingRequired,
  };
}

function blocked(reasonCode: VoiceQualificationBookingGateReasonCode, reason: string, evidence: VoiceQualificationBookingGateEvidence): VoiceQualificationBookingGateResult {
  return { status: 'blocked', allowed: false, reasonCode, reason, evidence };
}

export function checkVoiceQualificationBookingGate(input: VoiceQualificationBookingGateInput): VoiceQualificationBookingGateResult {
  const leadId = resolveLeadId(input);
  const qualificationScore = resolveQualificationScore(input);
  const minimumQualificationScore = input.minimumQualificationScore ?? DEFAULT_MINIMUM_QUALIFICATION_SCORE;
  const jordanRules = resolveJordanRules(input);

  const evidence: VoiceQualificationBookingGateEvidence = {
    leadId,
    qualificationScore,
    minimumQualificationScore,
    hasTranscriptData: hasTranscriptData(input),
    hasFormData: hasFormData(input),
    optOutBlocked: hasOptOutBlock(input, leadId),
    complianceBlocked: hasComplianceBlock(input),
    jordanApproved: jordanRules.jordanApproved,
    jordanApprovedBy: jordanRules.approvedBy,
    satisfiedBookingCriteriaIds: jordanRules.satisfied,
    missingRequiredBookingCriteriaIds: jordanRules.missingRequired,
    blockedBookingCriteriaIds: jordanRules.blocked,
  };

  if (qualificationScore === undefined) {
    return blocked('missing_qualification_score', 'Calendar booking is blocked until a qualification score is available.', evidence);
  }

  if (qualificationScore < minimumQualificationScore) {
    return blocked('score_below_threshold', `Calendar booking is blocked because qualification score ${qualificationScore}/100 is below the ${minimumQualificationScore}/100 threshold.`, evidence);
  }

  if (evidence.optOutBlocked) {
    return blocked('opt_out_block', 'Calendar booking is blocked because the lead has an opt-out, unsubscribe, or do-not-contact signal.', evidence);
  }

  if (evidence.complianceBlocked) {
    return blocked('compliance_block', input.complianceBlockReason || 'Calendar booking is blocked because a compliance review/block is present.', evidence);
  }

  if (!evidence.hasTranscriptData && !evidence.hasFormData) {
    return blocked('missing_required_transcript_or_form_data', 'Calendar booking is blocked until a call transcript, transcript summary, intake form, form responses, or form-backed qualification record is present.', evidence);
  }

  if (!evidence.jordanApproved) {
    return blocked('jordan_approval_required', 'Calendar booking is blocked until Jordan explicitly approves booking under the voice qualification rules.', evidence);
  }

  if (!jordanRules.rulesAllowed || evidence.blockedBookingCriteriaIds.length > 0) {
    return blocked('jordan_rules_block_booking', jordanRules.rulesReason || 'Calendar booking is blocked because Jordan-approved booking rules do not allow booking for this lead.', evidence);
  }

  if (evidence.missingRequiredBookingCriteriaIds.length > 0) {
    return blocked('missing_required_booking_criteria', `Calendar booking is blocked until required Jordan-approved booking criteria are satisfied: ${evidence.missingRequiredBookingCriteriaIds.join(', ')}.`, evidence);
  }

  return {
    status: 'allowed',
    allowed: true,
    reasonCode: 'booking_allowed',
    reason: `Calendar booking is allowed: qualification score ${qualificationScore}/100 meets the ${minimumQualificationScore}/100 threshold, no opt-out or compliance block exists, required transcript/form data is present, and Jordan-approved booking rules allow it.`,
    evidence,
  };
}
