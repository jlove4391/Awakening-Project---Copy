import type { CallTranscriptRecord, IntakeRecord, LeadRecord, QualificationRecord } from '@awakening/shared';

export type QualificationGateStatus = 'allowed' | 'blocked';

export type QualificationGateReasonCode =
  | 'submitted_intake_form'
  | 'imported_call_transcript'
  | 'qualification_record'
  | 'missing_qualification_evidence';

export interface QualificationGateEvidence {
  submittedIntakeForm: boolean;
  importedCallTranscript: boolean;
  qualificationRecord: boolean;
  matchedIntakeIds: string[];
  matchedTranscriptIds: string[];
  matchedQualificationIds: string[];
}

export interface QualificationGateInput {
  leadId?: string;
  lead?: Pick<LeadRecord, 'id' | 'intakeId' | 'status'> | null;
  intakeRecords?: Array<Partial<IntakeRecord> | null | undefined>;
  callTranscripts?: Array<Partial<CallTranscriptRecord> | null | undefined>;
  qualificationRecords?: Array<Partial<QualificationRecord> | null | undefined>;
  hasSubmittedIntakeForm?: boolean;
  hasImportedCallTranscript?: boolean;
  hasQualificationRecord?: boolean;
}

export interface QualificationGateResult {
  status: QualificationGateStatus;
  allowed: boolean;
  reasonCode: QualificationGateReasonCode;
  reason: string;
  leadId?: string;
  evidence: QualificationGateEvidence;
}

const SUBMITTED_INTAKE_STATUSES = new Set(['submitted', 'completed', 'review_ready', 'routed']);
const IMPORTED_TRANSCRIPT_STATUSES = new Set(['imported', 'summarized', 'summary_ready', 'processed', 'completed']);
const QUALIFICATION_RECORD_BLOCKED_STATUSES = new Set(['archived', 'deleted']);

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStatus(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function resolveLeadId(input: QualificationGateInput) {
  return normalizeText(input.leadId) || normalizeText(input.lead?.id) || undefined;
}

function matchesLead(recordLeadId: unknown, leadId?: string) {
  const normalizedRecordLeadId = normalizeText(recordLeadId);
  return !leadId || !normalizedRecordLeadId || normalizedRecordLeadId === leadId;
}

function isSubmittedIntakeRecord(record: Partial<IntakeRecord>, leadId?: string) {
  if (!matchesLead(record.leadId, leadId)) {
    return false;
  }

  const status = normalizeStatus(record.status);
  return Boolean(record.submittedAt || SUBMITTED_INTAKE_STATUSES.has(status));
}

function isImportedCallTranscript(record: Partial<CallTranscriptRecord>, leadId?: string) {
  if (!matchesLead(record.leadId, leadId)) {
    return false;
  }

  const status = normalizeStatus(record.status);
  return Boolean(record.transcript || IMPORTED_TRANSCRIPT_STATUSES.has(status));
}

function isActiveQualificationRecord(record: Partial<QualificationRecord>, leadId?: string) {
  if (!matchesLead(record.leadId, leadId)) {
    return false;
  }

  const status = normalizeStatus(record.status);
  const hasRecordSignal = Boolean(record.id || record.leadId || record.intakeId || record.source || record.createdAt || status);
  return hasRecordSignal && !QUALIFICATION_RECORD_BLOCKED_STATUSES.has(status);
}

function matchingRecords<T extends { id?: string }>(records: Array<Partial<T> | null | undefined> | undefined, predicate: (record: Partial<T>) => boolean) {
  return (records ?? []).filter((record): record is Partial<T> => Boolean(record)).filter(predicate);
}

function recordIds<T extends { id?: string }>(records: Array<Partial<T>>) {
  return unique(records.map((record) => normalizeText(record.id)));
}

function createAllowedReason(evidence: QualificationGateEvidence) {
  const reasons = [
    evidence.submittedIntakeForm ? 'submitted intake form' : undefined,
    evidence.importedCallTranscript ? 'imported call transcript' : undefined,
    evidence.qualificationRecord ? 'qualification record' : undefined,
  ].filter(Boolean);

  return `Lead is eligible for proposal review call creation because it has ${reasons.join(', ')}.`;
}

function createReasonCode(evidence: QualificationGateEvidence): QualificationGateReasonCode {
  if (evidence.submittedIntakeForm) {
    return 'submitted_intake_form';
  }

  if (evidence.importedCallTranscript) {
    return 'imported_call_transcript';
  }

  if (evidence.qualificationRecord) {
    return 'qualification_record';
  }

  return 'missing_qualification_evidence';
}

export function checkQualificationGate(input: QualificationGateInput): QualificationGateResult {
  const leadId = resolveLeadId(input);
  const leadIntakeId = normalizeText(input.lead?.intakeId);
  const matchedIntakes = matchingRecords<IntakeRecord>(input.intakeRecords, (record) => isSubmittedIntakeRecord(record, leadId));
  const matchedTranscripts = matchingRecords<CallTranscriptRecord>(input.callTranscripts, (record) => isImportedCallTranscript(record, leadId));
  const matchedQualifications = matchingRecords<QualificationRecord>(input.qualificationRecords, (record) => isActiveQualificationRecord(record, leadId));

  const evidence: QualificationGateEvidence = {
    submittedIntakeForm: Boolean(input.hasSubmittedIntakeForm || leadIntakeId || matchedIntakes.length),
    importedCallTranscript: Boolean(input.hasImportedCallTranscript || matchedTranscripts.length),
    qualificationRecord: Boolean(input.hasQualificationRecord || matchedQualifications.length),
    matchedIntakeIds: unique([...recordIds(matchedIntakes), leadIntakeId]),
    matchedTranscriptIds: recordIds(matchedTranscripts),
    matchedQualificationIds: recordIds(matchedQualifications),
  };

  const allowed = evidence.submittedIntakeForm || evidence.importedCallTranscript || evidence.qualificationRecord;
  const reasonCode = createReasonCode(evidence);

  return {
    status: allowed ? 'allowed' : 'blocked',
    allowed,
    reasonCode,
    reason: allowed
      ? createAllowedReason(evidence)
      : 'Lead is blocked from proposal review call creation until an intake form, imported call transcript, or qualification record exists.',
    leadId,
    evidence,
  };
}
