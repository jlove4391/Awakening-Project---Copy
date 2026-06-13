import type { ClientRecord as SharedClientRecord, ProjectRecord as SharedProjectRecord } from '@awakening/shared';
import { z } from 'zod';

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
const confidenceScore = z.coerce.number().min(0).max(100).optional().catch(undefined);
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

export const ClientRecordSchema = z.object({
  id: requiredText,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  status: requiredText,
  leadId: optionalText,
  sourceLeadId: optionalText,
  sourceProposalId: optionalText,
  intakeId: optionalText,
  sessionId: optionalText,
  name: optionalText,
  email: optionalText,
  company: optionalText,
  closeDate: optionalTimestamp,
  emotionalState: optionalText,
  confidence: confidenceScore,
  concerns: stringList,
  kickoffStatus: optionalText,
  assignedSpecialist: optionalText,
  firstWinTarget: optionalText,
  tags: stringList,
  notes: optionalText,
  metadata: metadataSchema,
});

export const ProjectRecordSchema = z.object({
  id: requiredText,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  status: requiredText,
  clientId: requiredText,
  sourceLeadId: optionalText,
  sourceProposalId: optionalText,
  closeDate: optionalTimestamp,
  emotionalState: optionalText,
  confidence: confidenceScore,
  concerns: stringList,
  kickoffStatus: optionalText,
  assignedSpecialist: optionalText,
  firstWinTarget: optionalText,
  name: optionalText,
  notes: optionalText,
  metadata: metadataSchema,
});

type SharedClientRecordCompatible<T extends SharedClientRecord> = T;
type SharedProjectRecordCompatible<T extends SharedProjectRecord> = T;

export type ClientRecord = SharedClientRecordCompatible<z.infer<typeof ClientRecordSchema>>;
export type ProjectRecord = SharedProjectRecordCompatible<z.infer<typeof ProjectRecordSchema>>;
