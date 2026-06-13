export type ReplyClass =
  | 'interested'
  | 'not interested'
  | 'asks for price'
  | 'asks for details'
  | 'wrong person'
  | 'needs follow-up later'
  | 'objection'
  | 'unsubscribe/do not contact';

export interface OutreachDraft {
  id: string;
  leadId?: string;
  contactEmail: string;
  contactName?: string;
  company?: string;
  subject: string;
  body: string;
  callToAction?: string;
  status: 'draft' | 'ready_for_approval' | 'approved' | 'rejected' | (string & {});
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface ApprovedSendRequest {
  id: string;
  draftId: string;
  approvedBy: string;
  approvedAt: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  scheduledFor?: string;
  approvalNote?: string;
  metadata?: Record<string, unknown>;
}

export interface SentEmailReceipt {
  id: string;
  sendRequestId: string;
  provider: 'gmail' | 'smtp' | (string & {});
  providerMessageId?: string;
  threadId?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  sentAt: string;
  status: 'sent' | 'failed' | 'bounced' | (string & {});
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface ReplyClassification {
  id: string;
  receiptId?: string;
  threadId?: string;
  messageId?: string;
  replyClass: ReplyClass;
  confidence?: number;
  summary?: string;
  nextAction?: string;
  classifiedAt: string;
  classifiedBy?: string;
  metadata?: Record<string, unknown>;
}

export interface FollowUpRecord {
  id: string;
  leadId?: string;
  receiptId?: string;
  threadId?: string;
  replyClassificationId?: string;
  dueAt: string;
  status: 'scheduled' | 'due' | 'sent' | 'skipped' | 'cancelled' | 'completed' | (string & {});
  reason?: string;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  approvalNote?: string;
  metadata?: Record<string, unknown>;
}

export type FollowUpSchedule = FollowUpRecord;

export interface OptOutRecord {
  id: string;
  email: string;
  leadId?: string;
  receiptId?: string;
  replyClassificationId?: string;
  source: 'reply' | 'manual' | 'import' | (string & {});
  reason?: string;
  requestedAt: string;
  recordedAt: string;
  metadata?: Record<string, unknown>;
}
