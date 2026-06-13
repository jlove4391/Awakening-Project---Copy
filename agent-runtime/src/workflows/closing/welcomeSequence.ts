import { z } from 'zod';
import type { ClientRecord, ProjectRecord } from './types.js';

const normalizeText = (value: unknown) => {
  if (typeof value !== 'string') {
    return value;
  }

  return value.trim();
};

const optionalText = z.preprocess(normalizeText, z.string().default('').catch(''));
const optionalTimestamp = z.preprocess(normalizeText, z.string().datetime().optional().catch(undefined));
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

export const WelcomeSequenceInputSchema = z.object({
  clientRecord: z.custom<Partial<ClientRecord>>().optional(),
  projectRecord: z.custom<Partial<ProjectRecord>>().optional(),
  clientName: optionalText,
  company: optionalText,
  projectName: optionalText,
  agreedNextStep: optionalText,
  firstWinTarget: optionalText,
  assignedSpecialist: optionalText,
  buyerConfidenceSignals: stringList,
  knownConcerns: stringList,
  kickoffExpectations: stringList,
  firstUsefulArtifact: optionalText,
  firstUsefulArtifactDueAt: optionalTimestamp,
  nextStepOwner: optionalText,
  nextStepDueAt: optionalTimestamp,
  jordanApprovalNote: optionalText,
  createdAt: optionalTimestamp,
  sequenceId: optionalText,
  metadata: metadataSchema,
});

export type WelcomeSequenceInput = z.infer<typeof WelcomeSequenceInputSchema>;

export interface WelcomeSequenceMessage {
  subject: string;
  body: string;
  buyerConfidenceMessage: string;
  kickoffExpectations: string[];
  firstUsefulArtifactTimeline: string;
  nextStepChecklist: string[];
}

export interface WelcomeSequenceApprovalGate {
  requiredApprover: 'Jordan';
  status: 'jordan_review_required';
  externalSendAllowed: false;
  sendImplementation: 'use_outreach_gmail_approval_path';
  requiredBeforeExternalSend: string[];
}

export interface WelcomeSequence {
  id: string;
  createdAt: string;
  status: 'draft_ready_for_jordan_review';
  internalOnly: true;
  externalSend: false;
  approvedForExternalSend: false;
  message: WelcomeSequenceMessage;
  approvalGate: WelcomeSequenceApprovalGate;
  metadata: Record<string, string | number | boolean | null>;
}

function timestamp(value: string | Date | undefined) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return new Date(value).toISOString();
  }

  return new Date().toISOString();
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return '';
}

function dateLabel(value: string | undefined, fallback: string): string {
  return value ? new Date(value).toISOString() : fallback;
}

function sentenceList(values: string[], fallback: string[]): string[] {
  const unique = values.filter((value, index, list) => value.length > 0 && list.indexOf(value) === index);
  return unique.length > 0 ? unique : fallback;
}

function buildBuyerConfidenceMessage(input: WelcomeSequenceInput, clientName: string, projectName: string): string {
  const confidenceSignals = sentenceList(input.buyerConfidenceSignals, [
    'You have already made the most important decision: choosing the next focused step instead of letting the bottleneck stay vague.',
    'We will keep the first phase practical, visible, and easy to approve before anything expands in scope.',
  ]);
  const concernLine = input.knownConcerns.length > 0
    ? `We also captured the open concerns around ${input.knownConcerns.join(', ')} and will treat them as review points, not assumptions.`
    : 'If anything feels unclear, we will surface it early instead of letting it become hidden scope.';

  return [
    `${clientName ? `${clientName}, w` : 'W'}e are excited to get started on ${projectName}.`,
    confidenceSignals.join(' '),
    concernLine,
  ].join(' ');
}

function buildKickoffExpectations(input: WelcomeSequenceInput): string[] {
  return sentenceList(input.kickoffExpectations, [
    'Confirm the goal, success criteria, access needs, and communication rhythm before production work begins.',
    'Review the source context Jordan approved so the team is not inventing scope or client-facing promises.',
    'Identify blockers, owners, and dependencies that could affect the first useful artifact timeline.',
  ]);
}

function buildArtifactTimeline(input: WelcomeSequenceInput): string {
  const artifact = input.firstUsefulArtifact || input.firstWinTarget || 'first useful artifact';
  const due = dateLabel(input.firstUsefulArtifactDueAt, 'the first agreed delivery checkpoint');
  return `We will aim to produce the ${artifact} by ${due}, after kickoff context is confirmed and before any broader implementation promises are made.`;
}

function buildChecklist(input: WelcomeSequenceInput): string[] {
  return sentenceList([
    input.agreedNextStep ? `Confirm agreed next step: ${input.agreedNextStep}.` : '',
    input.nextStepOwner ? `Confirm owner for the next step: ${input.nextStepOwner}.` : 'Confirm the owner for the next step.',
    input.nextStepDueAt ? `Confirm next-step timing: ${dateLabel(input.nextStepDueAt, '')}.` : 'Confirm the next-step timing.',
    'Confirm any access, assets, examples, or source materials needed for kickoff.',
    'Jordan must approve this welcome sequence before any external send.',
  ], []);
}

export function createWelcomeSequence(rawInput: unknown): WelcomeSequence {
  const input = WelcomeSequenceInputSchema.parse(rawInput);
  const createdAt = timestamp(input.createdAt);
  const clientName = firstText(input.clientName, input.clientRecord?.name, input.company, input.clientRecord?.company, 'there');
  const company = firstText(input.company, input.clientRecord?.company);
  const projectName = firstText(input.projectName, input.projectRecord?.name, company, 'your project');
  const buyerConfidenceMessage = buildBuyerConfidenceMessage(input, clientName, projectName);
  const kickoffExpectations = buildKickoffExpectations(input);
  const firstUsefulArtifactTimeline = buildArtifactTimeline(input);
  const nextStepChecklist = buildChecklist(input);
  const subject = `Welcome aboard${company ? `, ${company}` : ''}: kickoff and first useful artifact plan`;
  const body = [
    buyerConfidenceMessage,
    '',
    'Kickoff expectations:',
    ...kickoffExpectations.map((item) => `- ${item}`),
    '',
    `First useful artifact timeline: ${firstUsefulArtifactTimeline}`,
    '',
    'Next-step checklist:',
    ...nextStepChecklist.map((item) => `- ${item}`),
    '',
    'Internal approval note: this draft is not approved for external send until Jordan approves it.',
  ].join('\n');

  return {
    id: input.sequenceId || `welcome_sequence_${input.projectRecord?.id || input.clientRecord?.id || createdAt}`,
    createdAt,
    status: 'draft_ready_for_jordan_review',
    internalOnly: true,
    externalSend: false,
    approvedForExternalSend: false,
    message: {
      subject,
      body,
      buyerConfidenceMessage,
      kickoffExpectations,
      firstUsefulArtifactTimeline,
      nextStepChecklist,
    },
    approvalGate: {
      requiredApprover: 'Jordan',
      status: 'jordan_review_required',
      externalSendAllowed: false,
      sendImplementation: 'use_outreach_gmail_approval_path',
      requiredBeforeExternalSend: [
        'Jordan reviews and approves the final subject, recipient list, and body.',
        'When sending is implemented, route through outreach.approve_send and outreach.send_email / Gmail with confirmedByUser=true only after approval.',
        'Do not bypass the outreach/Gmail approval path for any external send.',
      ],
    },
    metadata: {
      ...input.metadata,
      createdBy: 'createWelcomeSequence',
      jordanApprovalRequired: true,
      externalSend: false,
      approvedForExternalSend: false,
      sendImplementation: 'use_outreach_gmail_approval_path',
      jordanApprovalNote: input.jordanApprovalNote || null,
    },
  };
}
