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

const optionalText = z.preprocess(normalizeText, z.string().default('').catch(''));
const requiredText = z.preprocess(normalizeBlankString, z.string().min(1));

const optionalEmail = z.preprocess(
  normalizeBlankString,
  z.string().email().optional().default('').catch(''),
);

const optionalBoolean = z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized.length === 0) {
      return undefined;
    }

    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }

    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
  }

  return value;
}, z.boolean().default(false).catch(false));

const optionalStringList = z.preprocess((value) => {
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

export const IntakeUploadedFileMetadataSchema = z.object({
  id: optionalText,
  name: optionalText,
  fileName: optionalText,
  mimeType: optionalText,
  sizeBytes: z.coerce.number().int().nonnegative().optional().default(0).catch(0),
  url: optionalText,
  uploadedAt: optionalText,
});

export const IntakeFormSchema = z.object({
  businessName: requiredText,
  contactName: requiredText,
  email: optionalEmail,
  phone: optionalText,
  website: optionalText,
  industry: optionalText,
  teamSize: optionalText,
  currentTools: optionalStringList,
  currentCrm: optionalText,
  mainBottleneck: optionalText,
  leadCustomerFlow: optionalText,
  missedCallFollowUpIssue: optionalText,
  financePricingCashFlowIssue: optionalText,
  operationsSopIssue: optionalText,
  techAutomationIssue: optionalText,
  desiredOutcome: optionalText,
  timeline: optionalText,
  budgetComfortRange: optionalText,
  uploadedNotesFilesMetadata: z.array(IntakeUploadedFileMetadataSchema).optional().default([]).catch([]),
  permissionToContact: optionalBoolean,
});

export type IntakeUploadedFileMetadata = z.infer<typeof IntakeUploadedFileMetadataSchema>;
export type IntakeForm = z.infer<typeof IntakeFormSchema>;
