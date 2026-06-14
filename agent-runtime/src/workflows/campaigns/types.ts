import type {
  CampaignApprovalState as SharedCampaignApprovalState,
  CampaignLeadItem as SharedCampaignLeadItem,
  CampaignRecord as SharedCampaignRecord,
  CampaignSendReceipt as SharedCampaignSendReceipt,
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
const optionalTimestamp = z.preprocess(normalizeText, z.string().datetime().optional().catch(undefined));
const sharedRecordValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const sharedMetadataSchema = z.record(z.string(), sharedRecordValueSchema).default({}).catch({});
const unknownMetadataSchema = z.record(z.string(), z.unknown()).default({}).catch({});

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

export const CampaignStatusSchema = z.union([
  z.enum(['draft', 'active', 'paused', 'completed', 'cancelled']),
  z.string().min(1),
]);

export const CampaignApprovalStatusSchema = z.union([
  z.enum(['pending', 'approved', 'rejected', 'cancelled']),
  z.string().min(1),
]);

export const CampaignSendStatusSchema = z.union([z.enum(['sent', 'failed', 'bounced']), z.string().min(1)]);
export const CampaignSendProviderSchema = z.union([z.enum(['gmail', 'smtp']), z.string().min(1)]);

export const CampaignApprovalStateSchema = z.object({
  id: optionalText,
  campaignId: optionalText,
  leadId: optionalText,
  action: optionalText,
  status: CampaignApprovalStatusSchema,
  requestedBy: optionalText,
  requestedAt: optionalTimestamp,
  approvedBy: optionalText,
  approvedAt: optionalTimestamp,
  reviewedBy: optionalText,
  reviewedAt: optionalTimestamp,
  note: optionalText,
  metadata: unknownMetadataSchema,
});

export const CampaignRecordSchema = z.object({
  id: requiredText,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  status: CampaignStatusSchema,
  name: optionalText,
  description: optionalText,
  owner: optionalText,
  allowMassSend: z.boolean().default(false).catch(false),
  manuallyApprovedRegulatedOutreach: z.boolean().default(false).catch(false),
  regulatedIndustryApproval: CampaignApprovalStateSchema.optional(),
  pausedAt: optionalTimestamp,
  pausedReason: optionalText,
  tags: stringList,
  metadata: sharedMetadataSchema,
});

export const CampaignLeadItemSchema = z.object({
  id: requiredText,
  campaignId: requiredText,
  leadId: requiredText,
  status: z.string().min(1),
  priority: z.union([z.enum(['low', 'medium', 'high', 'urgent']), z.string().min(1)]).optional(),
  approvalState: CampaignApprovalStateSchema.optional(),
  sendRequestId: optionalText,
  receiptIds: stringList,
  addedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  metadata: sharedMetadataSchema,
});

export const CampaignSendReceiptSchema = z.object({
  id: requiredText,
  campaignId: requiredText,
  leadId: optionalText,
  sendRequestId: requiredText,
  provider: CampaignSendProviderSchema,
  providerMessageId: optionalText,
  threadId: optionalText,
  to: stringList,
  cc: stringList,
  bcc: stringList,
  subject: requiredText,
  sentAt: z.string().datetime(),
  status: CampaignSendStatusSchema,
  errorMessage: optionalText,
  metadata: unknownMetadataSchema,
});

type SharedCampaignRecordCompatible<T extends SharedCampaignRecord> = T;
type SharedCampaignLeadItemCompatible<T extends SharedCampaignLeadItem> = T;
type SharedCampaignApprovalStateCompatible<T extends SharedCampaignApprovalState> = T;
type SharedCampaignSendReceiptCompatible<T extends SharedCampaignSendReceipt> = T;

export type CampaignRecord = SharedCampaignRecordCompatible<z.infer<typeof CampaignRecordSchema>>;
export type CampaignLeadItem = SharedCampaignLeadItemCompatible<z.infer<typeof CampaignLeadItemSchema>>;
export type CampaignApprovalState = SharedCampaignApprovalStateCompatible<z.infer<typeof CampaignApprovalStateSchema>>;
export type CampaignSendReceipt = SharedCampaignSendReceiptCompatible<z.infer<typeof CampaignSendReceiptSchema>>;
