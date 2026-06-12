import type { RuntimeContext } from '../../types.js';

export interface ApprovalGateInput {
  confirmedByUser?: boolean;
  approvalNote?: string;
}

export interface LeadgenIcpInput {
  market: string;
  titles?: string[];
  geography?: string;
  buyingSignals?: string[];
  limit?: number;
}

export interface LeadgenIcp {
  market: string;
  titles: string[];
  geography: string;
  buyingSignals: string[];
  limit: number;
  summary: string;
}


export type LeadStatus =
  | 'new'
  | 'discovered'
  | 'enriched'
  | 'scored'
  | 'approved'
  | 'exported'
  | 'contacted'
  | 'follow_up_due'
  | 'follow_up_scheduled'
  | 'responded'
  | 'qualified'
  | 'disqualified'
  | 'converted'
  | 'lost'
  | 'archived'
  | (string & {});

export type FollowUpStatus =
  | 'not_scheduled'
  | 'scheduled'
  | 'due'
  | 'sent'
  | 'completed'
  | 'skipped'
  | 'cancelled'
  | 'failed'
  | (string & {});

export interface ApprovalRequest {
  id: string;
  leadId?: string;
  action: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | (string & {});
  requestedBy: string;
  requestedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  note?: string;
  metadata?: Record<string, unknown>;
}

export interface LeadScoreDimensions {
  industryFit: number;
  localServiceFit: number;
  missedCallLikelihood: number;
  followUpPainLikelihood: number;
  aiAutomationFit: number;
  abilityToPay: number;
  decisionMakerIdentified: number;
  emailPhoneConfidence: number;
  complianceRisk: number;
  estimatedValue: number;
  recommendedFirstOffer: string;
}

export interface LeadScore {
  value: number;
  dimensions?: LeadScoreDimensions;
  reasons?: string[];
  scoredAt?: string;
  scoredBy?: string;
  metadata?: Record<string, unknown>;
}

export interface LeadInboxItem {
  id: string;
  leadId: string;
  title: string;
  company?: string;
  contactName?: string;
  status: LeadStatus;
  score?: LeadScore;
  followUpStatus?: FollowUpStatus;
  approvalRequest?: ApprovalRequest;
  priority?: 'low' | 'medium' | 'high' | 'urgent' | (string & {});
  source?: string;
  tags?: string[];
  assignedTo?: string;
  dueAt?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface LeadRecord {
  id: string;
  fullName: string;
  title: string;
  company: string;
  email?: string;
  linkedinUrl?: string;
  geography?: string;
  market: string;
  signals: string[];
  source: string;
  status: LeadStatus;
  score?: number;
  scoreDetails?: LeadScore;
  scoreDimensions?: LeadScoreDimensions;
  scoreReasons?: string[];
  enrichment?: Record<string, unknown>;
  outreachDraft?: OutreachDraft;
  crm?: Record<string, unknown>;
  exportedAt?: string;
  updatedAt: string;
}

export interface OutreachDraft {
  subject: string;
  body: string;
  callToAction: string;
}

export interface LeadgenWorkflowResult {
  ok: boolean;
  status: string;
  workflow: 'leadgen';
  sessionId: string;
  leads?: LeadRecord[];
  memoryIds?: string[];
  receipts?: Array<{ id: string; summary: string; status: string }>;
  message?: string;
}

export type LeadgenStepContext = RuntimeContext;
