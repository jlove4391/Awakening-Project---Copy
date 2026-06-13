import type { ObjectionRecord as SharedObjectionRecord } from '@awakening/shared';
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
const metadataSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}).catch({});

export const ObjectionCategorySchema = z.enum([
  'price',
  'timing',
  'trust',
  'complexity',
  'already have a tool',
  'need to talk to partner/team',
  'unclear ROI',
  'fear of AI',
  'privacy/compliance',
  'implementation burden',
  'bad past vendor experience',
]);

export const ObjectionRecordSchema = z.object({
  id: requiredText,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  status: requiredText,
  leadId: optionalText,
  clientId: optionalText,
  proposalId: optionalText,
  sessionId: optionalText,
  callTranscriptId: optionalText,
  category: ObjectionCategorySchema,
  summary: optionalText,
  resolution: optionalText,
  metadata: metadataSchema,
});

export type ObjectionCategory = z.infer<typeof ObjectionCategorySchema>;
type SharedObjectionRecordCompatible<T extends SharedObjectionRecord> = T;
export type ObjectionRecord = SharedObjectionRecordCompatible<z.infer<typeof ObjectionRecordSchema>>;
