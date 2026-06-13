import { randomUUID } from 'node:crypto';
import type { LeadRecord } from '../leadgen/types.js';
import type { FollowUpRecord, ReplyClassification } from './types.js';

export interface ScheduleFollowUpInput {
  lead: LeadRecord;
  replyClassification: ReplyClassification;
  approvedFollowUpAt: string | Date;
  approvedBy?: string;
  approvalNote?: string;
  assignedTo?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface ScheduleFollowUpResult {
  ok: true;
  status: 'scheduled';
  workflow: 'outreach';
  lead: LeadRecord;
  followUpRecord: FollowUpRecord;
  message: string;
}

function normalizeApprovedDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();

  if (Number.isNaN(time)) {
    throw new Error('approvedFollowUpAt must be a valid date/time.');
  }

  return date.toISOString();
}

function updateLeadFollowUpStatus(input: ScheduleFollowUpInput, followUpRecord: FollowUpRecord): LeadRecord {
  return {
    ...input.lead,
    status: 'follow_up_scheduled',
    enrichment: {
      ...(input.lead.enrichment || {}),
      followUpStatus: 'scheduled',
      followUpDueAt: followUpRecord.dueAt,
      followUpRecordId: followUpRecord.id,
      followUpReplyClassificationId: followUpRecord.replyClassificationId,
      followUpApprovedBy: followUpRecord.approvedBy,
      followUpApprovedAt: followUpRecord.approvedAt,
      followUpApprovalNote: followUpRecord.approvalNote,
      followUpAutoSendSuppressed: true,
      followUpRequiresFutureSendApproval: true,
    },
    updatedAt: followUpRecord.updatedAt,
  };
}

export function scheduleFollowUp(input: ScheduleFollowUpInput): ScheduleFollowUpResult {
  const now = new Date().toISOString();
  const dueAt = normalizeApprovedDateTime(input.approvedFollowUpAt);
  const approvedBy = input.approvedBy || 'human';
  const reason = input.reason || input.replyClassification.nextAction || input.replyClassification.summary || 'Approved follow-up reminder.';

  const followUpRecord: FollowUpRecord = {
    id: randomUUID(),
    leadId: input.lead.id,
    receiptId: input.replyClassification.receiptId,
    threadId: input.replyClassification.threadId,
    replyClassificationId: input.replyClassification.id,
    dueAt,
    status: 'scheduled',
    reason,
    assignedTo: input.assignedTo,
    approvedBy,
    approvedAt: now,
    approvalNote: input.approvalNote,
    createdAt: now,
    updatedAt: now,
    metadata: {
      ...input.metadata,
      replyClass: input.replyClassification.replyClass,
      replyConfidence: input.replyClassification.confidence,
      noAutomaticSend: true,
      requiresFutureSendApproval: true,
    },
  };

  const lead = updateLeadFollowUpStatus(input, followUpRecord);

  return {
    ok: true,
    status: 'scheduled',
    workflow: 'outreach',
    lead,
    followUpRecord,
    message: `Scheduled follow-up reminder for lead ${lead.id} at ${followUpRecord.dueAt}; no follow-up will be sent automatically without a future approval flow.`,
  };
}
