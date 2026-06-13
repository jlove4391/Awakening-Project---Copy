import { createHash } from 'node:crypto';
import type { CallTranscriptRecord } from '@awakening/shared';
import { z } from 'zod';
import { scoreQualification, type QualificationFitTier, type QualificationNextAction, type QualificationScoreResult } from '../qualification/scoreQualification.js';
import { QualificationRecordSchema, type QualificationRecord } from '../qualification/types.js';

const normalizeBlankString = (value: unknown) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeText = (value: unknown) => {
  if (typeof value !== 'string') {
    return value;
  }

  return value.trim();
};

const requiredText = z.preprocess(normalizeBlankString, z.string().min(1));
const optionalText = z.preprocess(normalizeText, z.string().optional());
const optionalMetadata = z.record(z.string(), z.unknown()).optional().default({});

export const VoiceCallOutcomeSchema = z.enum(['completed', 'booked', 'booking_requested', 'needs_review', 'disqualified', 'no_answer', 'abandoned']);

export const VoiceCallerMetadataSchema = z.object({
  leadId: optionalText,
  intakeId: optionalText,
  clientId: optionalText,
  proposalId: optionalText,
  callerId: optionalText,
  callerName: optionalText,
  phone: optionalText,
  company: optionalText,
  email: optionalText,
  callStartedAt: z.union([z.string().min(1), z.date()]).optional(),
  callEndedAt: z.union([z.string().min(1), z.date()]).optional(),
  monthlyLeadVolume: z.coerce.number().int().nonnegative().optional(),
  responseSpeed: optionalText,
  missedCallsMessages: z.coerce.number().int().nonnegative().optional(),
  crmTrackingSystem: optionalText,
  averageJobCustomerValue: z.coerce.number().nonnegative().optional(),
  closeRate: z.coerce.number().min(0).max(100).optional(),
  crackFallthroughPoints: z.array(z.string()).optional(),
  desired30DayImprovement: optionalText,
  metadata: optionalMetadata,
}).catchall(z.unknown());

export const SyncVoiceQualificationTranscriptInputSchema = z.object({
  voiceSessionId: requiredText,
  transcript: requiredText,
  callerMetadata: VoiceCallerMetadataSchema.default({ metadata: {} }),
  callOutcome: VoiceCallOutcomeSchema.or(requiredText).default('completed'),
});

export type VoiceCallOutcome = z.infer<typeof VoiceCallOutcomeSchema> | (string & {});
export type VoiceCallerMetadata = z.infer<typeof VoiceCallerMetadataSchema>;
export type SyncVoiceQualificationTranscriptInput = z.input<typeof SyncVoiceQualificationTranscriptInputSchema>;
export type SyncVoiceQualificationTranscriptValidatedInput = z.infer<typeof SyncVoiceQualificationTranscriptInputSchema>;

export type RecommendedBookingDecisionStatus = 'book' | 'book_after_roi_context' | 'audit_first' | 'manual_review' | 'nurture' | 'do_not_book';

export interface RecommendedBookingDecision {
  status: RecommendedBookingDecisionStatus;
  shouldBook: boolean;
  requiresHumanReview: boolean;
  recommendedNextAction: QualificationNextAction;
  fitTier: QualificationFitTier;
  qualificationScore: number;
  rationale: string[];
}

export interface SyncVoiceQualificationTranscriptResult {
  callTranscriptRecord: CallTranscriptRecord;
  qualificationRecord: QualificationRecord;
  bookingDecision: RecommendedBookingDecision;
  qualificationScore: QualificationScoreResult;
}

function timestamp(value: string | Date | undefined, fallback = new Date()) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return new Date(value).toISOString();
  }

  return fallback.toISOString();
}

function stableHash(input: unknown) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 16);
}

function normalized(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function numberFromText(transcript: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = transcript.match(pattern);
    if (match?.[1]) {
      const value = Number(match[1].replace(/,/gu, ''));
      if (Number.isFinite(value)) return value;
    }
  }

  return undefined;
}

function textFromTranscript(transcript: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = transcript.match(pattern);
    const value = match?.[1]?.trim();
    if (value) return value.replace(/[.。]$/u, '').trim();
  }

  return '';
}

function compactList(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function inferCrackFallthroughPoints(transcript: string, callerMetadata: VoiceCallerMetadata) {
  if (callerMetadata.crackFallthroughPoints?.length) {
    return compactList(callerMetadata.crackFallthroughPoints);
  }

  const lower = transcript.toLowerCase();
  return compactList([
    /missed calls?/u.test(lower) ? 'Missed calls' : undefined,
    /voicemail/u.test(lower) ? 'Voicemails are not handled quickly' : undefined,
    /after[ -]?hours/u.test(lower) ? 'After-hours response gap' : undefined,
    /slow (response|follow[ -]?up)/u.test(lower) ? 'Slow follow-up' : undefined,
    /(lost|losing) leads?/u.test(lower) ? 'Lost leads' : undefined,
    /manual/u.test(lower) ? 'Manual tracking or handoff' : undefined,
  ]);
}

function firstPresent<T>(...values: Array<T | undefined>) {
  return values.find((value) => value !== undefined);
}

function buildQualificationRecord(input: SyncVoiceQualificationTranscriptValidatedInput, nowIso: string) {
  const transcript = input.transcript;
  const lower = transcript.toLowerCase();
  const callerMetadata = input.callerMetadata;
  const leadId = normalized(callerMetadata.leadId) || `voice_lead_${stableHash({ voiceSessionId: input.voiceSessionId, caller: callerMetadata.phone || callerMetadata.email || callerMetadata.callerName || transcript.slice(0, 200) })}`;
  const intakeId = normalized(callerMetadata.intakeId) || `voice_intake_${stableHash({ voiceSessionId: input.voiceSessionId, leadId })}`;
  const monthlyLeadVolume = firstPresent(
    callerMetadata.monthlyLeadVolume,
    numberFromText(lower, [/(?:about|around|roughly)?\s*([\d,]+)\s*(?:new\s*)?(?:leads|calls|inquiries)\s*(?:a|per|each)?\s*month/u, /(?:handle|get|receive)\s*(?:about|around|roughly)?\s*([\d,]+)\s*(?:a|per|each)?\s*month/u]),
  ) ?? 0;
  const missedCallsMessages = firstPresent(
    callerMetadata.missedCallsMessages,
    numberFromText(lower, [/([\d,]+)\s*(?:missed calls?|voicemails?|messages?)\s*(?:a|per|each)?\s*month/u, /miss(?:ing|ed)\s*(?:about|around|roughly)?\s*([\d,]+)\s*(?:calls?|leads?|messages?)/u]),
  ) ?? 0;
  const averageJobCustomerValue = firstPresent(
    callerMetadata.averageJobCustomerValue,
    numberFromText(lower, [/(?:average|typical)\s*(?:job|customer|deal|ticket)\s*(?:value|is|worth)?\s*\$?([\d,]+)/u, /\$([\d,]+)\s*(?:average|typical)?\s*(?:job|customer|deal|ticket)/u]),
  ) ?? 0;
  const closeRate = firstPresent(
    callerMetadata.closeRate,
    numberFromText(lower, [/(?:close|conversion)\s*rate\s*(?:is|of)?\s*([\d.]+)\s*%/u, /(?:close|convert)\s*(?:about|around)?\s*([\d.]+)\s*%/u]),
  ) ?? 0;
  const responseSpeed = normalized(callerMetadata.responseSpeed) || textFromTranscript(transcript, [/(?:respond|reply|call back)[^\r\n.]{0,40}(?:within|in|after|takes?)\s*([^\r\n.]{2,80})/iu]) || (lower.includes('same day') ? 'same day' : '');
  const crmTrackingSystem = normalized(callerMetadata.crmTrackingSystem) || textFromTranscript(transcript, [/(?:use|using|in)\s+([A-Z][\w -]{1,40}|hubspot|salesforce|jobber|service titan|servicetitan|housecall pro|pipedrive|go high level|gohighlevel)\s*(?:as|for|crm|calendar|pipeline|tracking)?/iu]);
  const desired30DayImprovement = normalized(callerMetadata.desired30DayImprovement) || textFromTranscript(transcript, [/(?:want|need|hoping|goal is)\s+(?:to\s+)?([^\r\n.]{8,140})/iu]);

  return QualificationRecordSchema.parse({
    id: `voice_qualification_${stableHash({ voiceSessionId: input.voiceSessionId, leadId, transcript })}`,
    leadId,
    intakeId,
    source: 'transcript',
    monthlyLeadVolume,
    responseSpeed,
    missedCallsMessages,
    crmTrackingSystem,
    averageJobCustomerValue,
    closeRate,
    crackFallthroughPoints: inferCrackFallthroughPoints(transcript, callerMetadata),
    desired30DayImprovement,
    qualificationScore: 0,
    status: input.callOutcome === 'disqualified' ? 'disqualified' : 'needs_review',
    createdAt: nowIso,
    updatedAt: nowIso,
  });
}

function asMetadataValue(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value;
  }

  if (value === undefined) {
    return null;
  }

  return JSON.stringify(value);
}

function createCallTranscriptRecord(input: SyncVoiceQualificationTranscriptValidatedInput, qualificationRecord: QualificationRecord, nowIso: string): CallTranscriptRecord {
  const metadataEntries = Object.entries(input.callerMetadata.metadata ?? {}).map(([key, value]) => [key, asMetadataValue(value)] as const);

  return {
    id: `call_transcript_${stableHash({ voiceSessionId: input.voiceSessionId, transcript: input.transcript })}`,
    createdAt: nowIso,
    updatedAt: nowIso,
    status: input.callOutcome === 'abandoned' || input.callOutcome === 'no_answer' ? input.callOutcome : 'imported',
    leadId: qualificationRecord.leadId,
    clientId: normalized(input.callerMetadata.clientId) || undefined,
    proposalId: normalized(input.callerMetadata.proposalId) || undefined,
    sessionId: input.voiceSessionId,
    startedAt: timestamp(input.callerMetadata.callStartedAt, new Date(nowIso)),
    endedAt: input.callerMetadata.callEndedAt ? timestamp(input.callerMetadata.callEndedAt, new Date(nowIso)) : undefined,
    participantIds: compactList([input.callerMetadata.callerId, input.callerMetadata.callerName, input.callerMetadata.phone, input.callerMetadata.email]),
    transcript: input.transcript,
    metadata: {
      ...Object.fromEntries(metadataEntries),
      source: 'voice_qualification',
      callOutcome: input.callOutcome,
      qualificationRecordId: qualificationRecord.id,
      company: normalized(input.callerMetadata.company) || null,
      syncedAt: nowIso,
    },
  };
}

function bookingDecision(scoreResult: QualificationScoreResult): RecommendedBookingDecision {
  const statusByAction: Record<QualificationNextAction, RecommendedBookingDecisionStatus> = {
    book_core_diagnostic: 'book',
    send_roi_case_study_then_book: 'book_after_roi_context',
    run_revenue_leak_audit: 'audit_first',
    manual_compliance_review: 'manual_review',
    nurture_until_ready: 'nurture',
    disqualify: 'do_not_book',
  };
  const status = statusByAction[scoreResult.recommendedNextAction];

  return {
    status,
    shouldBook: status === 'book' || status === 'book_after_roi_context',
    requiresHumanReview: status === 'manual_review' || status === 'book_after_roi_context' || status === 'audit_first',
    recommendedNextAction: scoreResult.recommendedNextAction,
    fitTier: scoreResult.fitTier,
    qualificationScore: scoreResult.score,
    rationale: scoreResult.reasons,
  };
}

export function syncVoiceQualificationTranscript(rawInput: SyncVoiceQualificationTranscriptInput): SyncVoiceQualificationTranscriptResult {
  const input = SyncVoiceQualificationTranscriptInputSchema.parse(rawInput);
  const nowIso = new Date().toISOString();
  const baseQualificationRecord = buildQualificationRecord(input, nowIso);
  const scoreResult = scoreQualification(baseQualificationRecord);
  const qualificationRecord = QualificationRecordSchema.parse({
    ...baseQualificationRecord,
    qualificationScore: scoreResult.score,
    status: scoreResult.recommendedNextAction === 'disqualify' ? 'disqualified' : scoreResult.score >= 68 ? 'qualified' : baseQualificationRecord.status,
    updatedAt: nowIso,
  });
  const callTranscriptRecord = createCallTranscriptRecord(input, qualificationRecord, nowIso);

  return {
    callTranscriptRecord,
    qualificationRecord,
    bookingDecision: bookingDecision(scoreResult),
    qualificationScore: scoreResult,
  };
}
