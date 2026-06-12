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
  status: 'discovered' | 'enriched' | 'scored' | 'approved' | 'exported' | 'contacted' | 'follow_up_due';
  score?: number;
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
