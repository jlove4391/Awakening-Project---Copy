export type SocialPlatform =
  | 'linkedin'
  | 'x'
  | 'facebook'
  | 'instagram'
  | 'threads'
  | 'tiktok'
  | (string & {});

export type ContentIdeaStatus = 'draft' | 'ready_for_review' | 'approved' | 'published' | 'archived' | (string & {});

export interface SocialSellingContentIdea {
  id: string;
  platform: SocialPlatform;
  title: string;
  angle?: string;
  targetAudience?: string;
  bodyOutline?: string;
  callToAction?: string;
  status: ContentIdeaStatus;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export type SocialProspectStatus =
  | 'new'
  | 'researching'
  | 'ready_for_review'
  | 'approved_for_outreach'
  | 'contacted'
  | 'engaged'
  | 'opted_out'
  | 'do_not_contact'
  | 'archived'
  | (string & {});

export interface SocialProspect {
  id: string;
  platform: SocialPlatform;
  profileUrl: string;
  displayName?: string;
  handle?: string;
  company?: string;
  title?: string;
  fitNotes?: string;
  relationshipContext?: string;
  status: SocialProspectStatus;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export type DmDraftStatus = 'draft' | 'ready_for_approval' | 'approved' | 'rejected' | 'sent' | (string & {});

export interface SocialDmDraft {
  id: string;
  prospectId: string;
  platform: SocialPlatform;
  profileUrl?: string;
  message: string;
  status: DmDraftStatus;
  approvedBy?: string;
  approvedAt?: string;
  approvalNote?: string;
  receiptId?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export type SocialReplyClass =
  | 'interested'
  | 'not_interested'
  | 'asks_for_details'
  | 'asks_for_pricing'
  | 'objection'
  | 'wrong_person'
  | 'spam_or_abuse'
  | 'opt_out_do_not_contact'
  | 'needs_follow_up_later'
  | (string & {});

export interface SocialReplyClassification {
  id: string;
  prospectId?: string;
  receiptId?: string;
  platform: SocialPlatform;
  replyClass: SocialReplyClass;
  confidence?: number;
  summary?: string;
  nextAction?: string;
  classifiedAt: string;
  classifiedBy?: string;
  metadata?: Record<string, unknown>;
}

export type SocialOptOutStatus = 'opted_out' | 'do_not_contact' | 'revoked' | (string & {});

export interface SocialOptOutDoNotContactStatus {
  id: string;
  prospectId?: string;
  platform: SocialPlatform;
  profileUrl?: string;
  handle?: string;
  status: SocialOptOutStatus;
  source: 'reply' | 'manual' | 'import' | (string & {});
  reason?: string;
  requestedAt: string;
  recordedAt: string;
  metadata?: Record<string, unknown>;
}

export type SocialSentMessageStatus = 'sent' | 'failed' | 'blocked' | (string & {});

export interface SocialSentMessageReceipt {
  id: string;
  dmDraftId?: string;
  prospectId?: string;
  platform: SocialPlatform;
  profileUrl?: string;
  providerMessageId?: string;
  messagePreview?: string;
  sentAt: string;
  sentBy: string;
  status: SocialSentMessageStatus;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export const SOCIAL_SELLING_RULES = [
  'No auto-DM without approval.',
  'No pretending AI is human.',
  'No scraping or platform automation that violates terms.',
  'No follow-up after opt-out.',
  'Every sent message gets a receipt.',
] as const;

export type SocialSellingRule = (typeof SOCIAL_SELLING_RULES)[number];
