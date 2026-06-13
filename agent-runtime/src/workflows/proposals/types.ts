import type {
  OfferTemplateRecord as SharedOfferTemplateRecord,
  ProposalRecord as SharedProposalRecord,
  ProposalReviewCall as SharedProposalReviewCall,
} from '@awakening/shared';
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

const metadataSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}).catch({});

export const OfferTemplateRecordSchema = z.object({
  id: requiredText,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  status: requiredText,
  name: requiredText,
  description: optionalText,
  recommendedSolution: optionalText,
  implementationScope: stringList,
  included: stringList,
  notIncluded: stringList,
  timeline: optionalText,
  priceOptions: stringList,
  quickWinPromise: optionalText,
  metadata: metadataSchema,
});

export const ProposalReviewCallSchema = z.object({
  id: requiredText,
  proposalId: requiredText,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  status: requiredText,
  scheduledFor: optionalText,
  agenda: stringList,
  unresolvedQuestions: stringList,
  notes: optionalText,
  metadata: metadataSchema,
});

export const ProposalRecordSchema = z.object({
  id: requiredText,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  status: requiredText,
  leadId: optionalText,
  clientId: optionalText,
  intakeId: optionalText,
  sessionId: optionalText,
  offerTemplateId: optionalText,
  title: optionalText,
  summary: optionalText,
  painSummaryInProspectLanguage: optionalText,
  currentState: optionalText,
  costOfInaction: optionalText,
  desiredOutcome: optionalText,
  recommendedSolution: optionalText,
  first30DayPlan: optionalText,
  quickWinPromise: optionalText,
  implementationScope: stringList,
  included: stringList,
  notIncluded: stringList,
  timeline: optionalText,
  priceOptions: stringList,
  reviewCallAgenda: stringList,
  unresolvedQuestions: stringList,
  reviewCall: ProposalReviewCallSchema.optional(),
  totalAmount: z.coerce.number().nonnegative().optional(),
  currency: optionalText,
  validUntil: optionalText,
  acceptedAt: optionalText,
  metadata: metadataSchema,
});

type SharedOfferTemplateRecordCompatible<T extends SharedOfferTemplateRecord> = T;
type SharedProposalReviewCallCompatible<T extends SharedProposalReviewCall> = T;
type SharedProposalRecordCompatible<T extends SharedProposalRecord> = T;

export type OfferTemplateRecord = SharedOfferTemplateRecordCompatible<z.infer<typeof OfferTemplateRecordSchema>>;
export type ProposalReviewCall = SharedProposalReviewCallCompatible<z.infer<typeof ProposalReviewCallSchema>>;
export type ProposalRecord = SharedProposalRecordCompatible<z.infer<typeof ProposalRecordSchema>>;
