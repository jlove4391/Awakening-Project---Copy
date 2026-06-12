import type { QualificationRecord as SharedQualificationRecord } from '@awakening/shared';
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
const nonnegativeInteger = z.coerce.number().int().nonnegative().default(0).catch(0);
const nonnegativeNumber = z.coerce.number().nonnegative().default(0).catch(0);
const percentScore = z.coerce.number().min(0).max(100).default(0).catch(0);

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

export const QualificationSourceSchema = z.enum(['form', 'transcript', 'manual']);

export const QualificationRecordSchema = z.object({
  id: requiredText,
  leadId: requiredText,
  intakeId: requiredText,
  source: QualificationSourceSchema,
  monthlyLeadVolume: nonnegativeInteger,
  responseSpeed: optionalText,
  missedCallsMessages: nonnegativeInteger,
  crmTrackingSystem: optionalText,
  averageJobCustomerValue: nonnegativeNumber,
  closeRate: percentScore,
  crackFallthroughPoints: stringList,
  desired30DayImprovement: optionalText,
  qualificationScore: percentScore,
  status: requiredText,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type QualificationSource = z.infer<typeof QualificationSourceSchema>;
type SharedQualificationRecordCompatible<T extends SharedQualificationRecord> = T;
export type QualificationRecord = SharedQualificationRecordCompatible<z.infer<typeof QualificationRecordSchema>>;
