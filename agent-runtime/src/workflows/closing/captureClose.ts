import { createHash } from 'node:crypto';
import { z } from 'zod';
import { remember } from '../../memory/index.js';
import type { MemoryReference, MemoryScope } from '../../types.js';
import { ClientRecordSchema, ProjectRecordSchema, type ClientRecord, type ProjectRecord } from './types.js';

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
const optionalText = z.preprocess(normalizeText, z.string().default('').catch(''));
const optionalTimestamp = z.preprocess(normalizeText, z.string().datetime().optional().catch(undefined));
const confidenceLevel = z.coerce.number().min(0).max(100);
const metadataSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}).catch({});

const stringList = z.preprocess((value) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : String(item).trim()))
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return [];
    }

    return trimmed
      .split(/[\n,]+/u)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return value;
}, z.array(z.string()).default([]).catch([]));

export const CaptureCloseInputSchema = z.object({
  leadId: requiredText,
  proposalId: requiredText,
  jordanCloseNote: requiredText,
  movingForwardFeeling: requiredText,
  confidenceLevel,
  concerns: stringList,
  agreedNextStep: requiredText,
  sessionId: optionalText,
  clientName: optionalText,
  clientEmail: optionalText,
  company: optionalText,
  projectName: optionalText,
  assignedSpecialist: optionalText,
  firstWinTarget: optionalText,
  closedAt: optionalTimestamp,
  metadata: metadataSchema,
});

export type CaptureCloseInput = z.infer<typeof CaptureCloseInputSchema>;

export interface InitialKickoffStatus {
  status: 'ready_for_kickoff';
  agreedNextStep: string;
  confidenceLevel: number;
  concerns: string[];
  capturedAt: string;
  owner: 'ELORA';
}

export interface CaptureCloseResult {
  clientRecord: ClientRecord;
  projectRecord: ProjectRecord;
  initialKickoffStatus: InitialKickoffStatus;
  memoryEntries: MemoryReference[];
}

export interface CaptureCloseOptions {
  memoryScope?: MemoryScope | string;
}

const CLOSE_STATUS = 'closed_won';
const KICKOFF_STATUS = 'ready_for_kickoff';
const CLOSE_MEMORY_SCOPE = 'business_context' satisfies MemoryScope;

function timestamp(value: string | Date | undefined) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return new Date(value).toISOString();
  }

  return new Date().toISOString();
}

function stableHash(input: unknown) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 16);
}

function closeSummary(input: CaptureCloseInput) {
  return [
    `Jordan closed proposal ${input.proposalId} for lead ${input.leadId}.`,
    `Close note: ${input.jordanCloseNote}.`,
    `Client answer to "How do you feel about moving forward?": ${input.movingForwardFeeling}.`,
    `Confidence level: ${input.confidenceLevel}/100.`,
    input.concerns.length > 0 ? `Concerns: ${input.concerns.join('; ')}.` : 'Concerns: none captured.',
    `Agreed next step: ${input.agreedNextStep}.`,
  ].join(' ');
}

function kickoffSummary(input: CaptureCloseInput) {
  return [
    `Initial kickoff is ${KICKOFF_STATUS} for proposal ${input.proposalId}.`,
    `ELORA should anchor kickoff on the agreed next step: ${input.agreedNextStep}.`,
    input.firstWinTarget ? `First win target: ${input.firstWinTarget}.` : undefined,
    input.assignedSpecialist ? `Assigned specialist: ${input.assignedSpecialist}.` : undefined,
  ]
    .filter(Boolean)
    .join(' ');
}

export async function captureClose(rawInput: unknown, options: CaptureCloseOptions = {}): Promise<CaptureCloseResult> {
  const input = CaptureCloseInputSchema.parse(rawInput);
  const closedAt = timestamp(input.closedAt);
  const sessionId = input.sessionId || 'global';
  const clientId = `client_${stableHash({ leadId: input.leadId, proposalId: input.proposalId })}`;
  const projectId = `project_${stableHash({ clientId, proposalId: input.proposalId })}`;
  const initialKickoffStatus: InitialKickoffStatus = {
    status: KICKOFF_STATUS,
    agreedNextStep: input.agreedNextStep,
    confidenceLevel: input.confidenceLevel,
    concerns: input.concerns,
    capturedAt: closedAt,
    owner: 'ELORA',
  };

  const sharedFields = {
    createdAt: closedAt,
    updatedAt: closedAt,
    status: CLOSE_STATUS,
    sourceLeadId: input.leadId,
    sourceProposalId: input.proposalId,
    closeDate: closedAt,
    emotionalState: input.movingForwardFeeling,
    confidence: input.confidenceLevel,
    concerns: input.concerns,
    kickoffStatus: initialKickoffStatus.status,
    assignedSpecialist: input.assignedSpecialist,
    firstWinTarget: input.firstWinTarget,
    notes: input.jordanCloseNote,
    metadata: {
      ...input.metadata,
      agreedNextStep: input.agreedNextStep,
      capturedBy: 'captureClose',
      kickoffOwner: initialKickoffStatus.owner,
    },
  };

  const clientRecord = ClientRecordSchema.parse({
    id: clientId,
    ...sharedFields,
    leadId: input.leadId,
    sessionId,
    name: input.clientName,
    email: input.clientEmail,
    company: input.company,
    tags: ['closed-won', 'kickoff-ready'],
  });

  const projectRecord = ProjectRecordSchema.parse({
    id: projectId,
    ...sharedFields,
    clientId,
    name: input.projectName || input.company || `Project for proposal ${input.proposalId}`,
  });

  const memoryEntries = await Promise.all([
    remember(sessionId, closeSummary(input), {
      id: `memory_close_${stableHash({ leadId: input.leadId, proposalId: input.proposalId, type: 'close' })}`,
      scope: options.memoryScope ?? CLOSE_MEMORY_SCOPE,
      tags: ['elora', 'close', 'closed-won', input.leadId, input.proposalId],
      metadata: { clientRecord, projectRecord, initialKickoffStatus },
      importance: 0.9,
      source: 'api',
      createdAt: closedAt,
    }),
    remember(sessionId, kickoffSummary(input), {
      id: `memory_close_${stableHash({ leadId: input.leadId, proposalId: input.proposalId, type: 'kickoff' })}`,
      scope: 'task_history',
      tags: ['elora', 'kickoff', KICKOFF_STATUS, input.leadId, input.proposalId],
      metadata: { clientId, projectId, agreedNextStep: input.agreedNextStep, initialKickoffStatus },
      importance: 0.85,
      source: 'api',
      createdAt: closedAt,
    }),
  ]);

  return { clientRecord, projectRecord, initialKickoffStatus, memoryEntries };
}
