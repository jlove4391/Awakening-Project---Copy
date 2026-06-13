import { createHash } from 'node:crypto';
import type { CallTranscriptRecord } from '@awakening/shared';
import { z } from 'zod';
import { remember } from '../../memory/index.js';
import type { MemoryReference, MemoryScope, RuntimeAgentName } from '../../types.js';

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

const participantSchema = z.preprocess((value) => {
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === 'string' ? item.trim() : String(item).trim())).filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    return trimmed
      .split(/[\n,]+/u)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return value;
}, z.array(z.string()).default([]).catch([]));

export const ImportTranscriptInputSchema = z.object({
  transcript: requiredText,
  leadId: requiredText,
  callDate: z.union([z.string().min(1), z.date()]),
  participants: participantSchema,
  source: requiredText,
  recordingLink: optionalText,
  sessionId: optionalText,
  clientId: optionalText,
  proposalId: optionalText,
  endedAt: z.union([z.string().min(1), z.date()]).optional(),
  status: optionalText.default('imported'),
  memoryScope: z.string().optional(),
});

export type ImportTranscriptInput = z.input<typeof ImportTranscriptInputSchema>;
export type ImportTranscriptValidatedInput = z.infer<typeof ImportTranscriptInputSchema>;

export interface TranscriptSummaryReadyPayload {
  transcriptId: string;
  leadId: string;
  clientId?: string;
  proposalId?: string;
  sessionId: string;
  callDate: string;
  participants: string[];
  source: string;
  recordingLink?: string;
  transcript: string;
  transcriptExcerpt: string;
  summaryPrompt: string;
  routingTargets: RuntimeAgentName[];
  specialistContext: {
    elora: string;
    specialists: string;
  };
  metadata: {
    importedAt: string;
    wordCount: number;
    characterCount: number;
  };
}

export interface ImportTranscriptResult {
  record: CallTranscriptRecord;
  memoryId: string;
  memory: MemoryReference;
  payload: TranscriptSummaryReadyPayload;
}

const TRANSCRIPT_MEMORY_SCOPE = 'business_context' satisfies MemoryScope;
const TRANSCRIPT_STATUS = 'imported';
const MAX_EXCERPT_LENGTH = 4000;

const callTranscriptRecords = new Map<string, CallTranscriptRecord>();

function timestamp(value: string | Date | undefined) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return new Date(value).toISOString();
  }

  return new Date().toISOString();
}

function wordCount(text: string) {
  const words = text.trim().match(/\S+/gu);
  return words?.length ?? 0;
}

function stableHash(input: unknown) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 16);
}

function createTranscriptId(input: Pick<ImportTranscriptValidatedInput, 'leadId' | 'callDate' | 'participants' | 'source' | 'transcript'>) {
  return `call_transcript_${stableHash({
    leadId: input.leadId,
    callDate: timestamp(input.callDate),
    participants: input.participants,
    source: input.source.toLowerCase(),
    transcript: input.transcript,
  })}`;
}

function createTranscriptExcerpt(transcript: string) {
  if (transcript.length <= MAX_EXCERPT_LENGTH) {
    return transcript;
  }

  return `${transcript.slice(0, MAX_EXCERPT_LENGTH).trimEnd()}…`;
}

function createMemoryText(input: {
  leadId: string;
  callDate: string;
  participants: string[];
  source: string;
  recordingLink?: string;
  transcriptExcerpt: string;
}) {
  return [
    `Imported qualification call transcript for lead ${input.leadId}.`,
    `Call date: ${input.callDate}.`,
    input.participants.length ? `Participants: ${input.participants.join(', ')}.` : undefined,
    `Source: ${input.source}.`,
    input.recordingLink ? `Recording: ${input.recordingLink}.` : undefined,
    `Transcript excerpt: ${input.transcriptExcerpt}`,
  ]
    .filter(Boolean)
    .join(' ');
}

function createSummaryPrompt(input: {
  leadId: string;
  callDate: string;
  participants: string[];
  source: string;
  recordingLink?: string;
}) {
  return [
    `Summarize the qualification call for lead ${input.leadId}.`,
    `Call date: ${input.callDate}.`,
    input.participants.length ? `Participants: ${input.participants.join(', ')}.` : 'Participants were not provided.',
    `Source: ${input.source}.`,
    input.recordingLink ? `Recording link is available: ${input.recordingLink}.` : 'No recording link was provided.',
    'Extract business pain, lead-response gaps, current systems, objections, budget or value indicators, timeline, decision makers, risks, and recommended next steps for ELORA and the specialist agents.',
  ]
    .filter(Boolean)
    .join(' ');
}

function createSummaryReadyPayload(input: {
  record: CallTranscriptRecord;
  participants: string[];
  source: string;
  recordingLink?: string;
  importedAt: string;
}): TranscriptSummaryReadyPayload {
  const transcript = input.record.transcript || '';
  const transcriptExcerpt = createTranscriptExcerpt(transcript);
  const callDate = input.record.startedAt || input.record.createdAt;
  const summaryPrompt = createSummaryPrompt({
    leadId: input.record.leadId || '',
    callDate,
    participants: input.participants,
    source: input.source,
    recordingLink: input.recordingLink,
  });

  return {
    transcriptId: input.record.id,
    leadId: input.record.leadId || '',
    clientId: input.record.clientId,
    proposalId: input.record.proposalId,
    sessionId: input.record.sessionId || 'global',
    callDate,
    participants: input.participants,
    source: input.source,
    recordingLink: input.recordingLink,
    transcript,
    transcriptExcerpt,
    summaryPrompt,
    routingTargets: ['elora', 'nexora', 'kaz', 'jynx', 'kalyra'],
    specialistContext: {
      elora: 'Use this payload to create the executive qualification summary, coordinate specialist review, and determine next-step routing.',
      specialists: 'Use the transcript and metadata to extract domain-specific opportunities, objections, implementation requirements, and follow-up recommendations.',
    },
    metadata: {
      importedAt: input.importedAt,
      wordCount: wordCount(transcript),
      characterCount: transcript.length,
    },
  };
}

export function getImportedCallTranscript(id: string) {
  return callTranscriptRecords.get(id);
}

export function listImportedCallTranscripts() {
  return [...callTranscriptRecords.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export async function importTranscript(rawInput: ImportTranscriptInput): Promise<ImportTranscriptResult> {
  const input = ImportTranscriptInputSchema.parse(rawInput);
  const importedAt = new Date().toISOString();
  const callDate = timestamp(input.callDate);
  const endedAt = input.endedAt ? timestamp(input.endedAt) : undefined;
  const sessionId = input.sessionId || 'global';
  const record: CallTranscriptRecord = {
    id: createTranscriptId(input),
    createdAt: importedAt,
    updatedAt: importedAt,
    status: input.status || TRANSCRIPT_STATUS,
    leadId: input.leadId,
    clientId: input.clientId,
    proposalId: input.proposalId,
    sessionId,
    startedAt: callDate,
    endedAt,
    participantIds: input.participants,
    transcript: input.transcript,
    metadata: {
      source: input.source,
      recordingLink: input.recordingLink ?? null,
      callDate,
    },
  };

  const payload = createSummaryReadyPayload({
    record,
    participants: input.participants,
    source: input.source,
    recordingLink: input.recordingLink,
    importedAt,
  });

  const memory = await remember(
    sessionId,
    createMemoryText({
      leadId: input.leadId,
      callDate,
      participants: input.participants,
      source: input.source,
      recordingLink: input.recordingLink,
      transcriptExcerpt: payload.transcriptExcerpt,
    }),
    {
      id: record.id,
      scope: input.memoryScope ?? TRANSCRIPT_MEMORY_SCOPE,
      tags: ['qualification', 'transcript', input.leadId, input.source],
      metadata: { callTranscriptRecord: record, summaryReadyPayload: payload },
      importance: 0.85,
      source: 'api',
      createdAt: importedAt,
    },
  );

  callTranscriptRecords.set(record.id, record);

  return { record, memoryId: memory.id, memory, payload };
}
