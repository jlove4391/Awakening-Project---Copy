import { createHash } from 'node:crypto';
import type { IntakeRecord, SharedRecordValue } from '@awakening/shared';
import { remember } from '../../memory/index.js';
import type { MemoryReference, MemoryScope } from '../../types.js';
import { IntakeFormSchema, type IntakeForm } from './types.js';

export interface CreateIntakeRecordOptions {
  sessionId?: string;
  leadId?: string;
  clientId?: string;
  submittedAt?: string | Date;
  memoryScope?: MemoryScope | string;
}

export interface CreateIntakeRecordResult {
  record: IntakeRecord;
  memoryId: string;
  memory: MemoryReference;
}

type IntakeInputEnvelope = Record<string, unknown> & {
  sessionId?: unknown;
  leadId?: unknown;
  clientId?: unknown;
  submittedAt?: unknown;
};

const INTAKE_MEMORY_SCOPE = 'business_context' satisfies MemoryScope;
const INTAKE_STATUS = 'submitted';

function isRecord(value: unknown): value is IntakeInputEnvelope {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
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

function stableHash(input: unknown) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 16);
}

function createStableIntakeId(form: IntakeForm) {
  return `intake_${stableHash({
    businessName: form.businessName.toLowerCase(),
    contactName: form.contactName.toLowerCase(),
    email: form.email.toLowerCase(),
    phone: form.phone,
    website: form.website.toLowerCase(),
  })}`;
}

function responseValue(value: unknown): SharedRecordValue {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value;
  }

  if (value === undefined) {
    return null;
  }

  return JSON.stringify(value);
}

function createResponses(form: IntakeForm): Record<string, SharedRecordValue> {
  return Object.fromEntries(Object.entries(form).map(([key, value]) => [key, responseValue(value)]));
}

function createIntakeSummary(form: IntakeForm) {
  return [
    `Intake submitted by ${form.contactName} for ${form.businessName}.`,
    form.industry ? `Industry: ${form.industry}.` : undefined,
    form.mainBottleneck ? `Main bottleneck: ${form.mainBottleneck}.` : undefined,
    form.desiredOutcome ? `Desired outcome: ${form.desiredOutcome}.` : undefined,
    form.timeline ? `Timeline: ${form.timeline}.` : undefined,
  ]
    .filter(Boolean)
    .join(' ');
}

export async function createIntakeRecord(rawInput: unknown, options: CreateIntakeRecordOptions = {}): Promise<CreateIntakeRecordResult> {
  const form = IntakeFormSchema.parse(rawInput);
  const envelope = isRecord(rawInput) ? rawInput : {};
  const submittedAt = timestamp(options.submittedAt ?? optionalString(envelope.submittedAt));
  const sessionId = options.sessionId ?? optionalString(envelope.sessionId) ?? 'global';
  const record: IntakeRecord = {
    id: createStableIntakeId(form),
    createdAt: submittedAt,
    updatedAt: submittedAt,
    status: INTAKE_STATUS,
    leadId: options.leadId ?? optionalString(envelope.leadId),
    clientId: options.clientId ?? optionalString(envelope.clientId),
    sessionId,
    submittedAt,
    summary: createIntakeSummary(form),
    responses: createResponses(form),
    metadata: {
      source: 'intake_form',
      uploadedNotesFileCount: form.uploadedNotesFilesMetadata.length,
    },
  };

  const memory = await remember(sessionId, record.summary || `Intake submitted for ${form.businessName}.`, {
    id: record.id,
    scope: options.memoryScope ?? INTAKE_MEMORY_SCOPE,
    tags: ['intake', INTAKE_STATUS, form.businessName],
    metadata: { intakeRecord: record, intakeForm: form },
    importance: 0.8,
    source: 'api',
    createdAt: submittedAt,
  });

  return { record, memoryId: memory.id, memory };
}
