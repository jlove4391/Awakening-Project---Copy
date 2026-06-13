import type { RuntimeAgentName } from '@awakening/shared';
import { IntakeFormSchema, type IntakeForm } from './types.js';

export type IntakeSpecialist = Exclude<RuntimeAgentName, 'elora'>;

export type IntakeRiskFlagType =
  | 'regulated_industry'
  | 'legal_request'
  | 'tax_request'
  | 'investment_request';

export interface IntakeClassificationRiskFlag {
  type: IntakeRiskFlagType;
  field: keyof IntakeForm;
  value: string;
  reason: string;
}

export interface IntakeClassificationReason {
  specialist: IntakeSpecialist;
  field: keyof IntakeForm;
  signal: string;
  weight: number;
  reason: string;
}

export interface IntakeClassificationResult {
  primarySpecialist: IntakeSpecialist;
  secondarySpecialists: IntakeSpecialist[];
  confidence: number;
  reasons: string[];
  riskFlags: IntakeClassificationRiskFlag[];
  scores: Record<IntakeSpecialist, number>;
  matchedSignals: IntakeClassificationReason[];
}

type SpecialistSignal = {
  specialist: IntakeSpecialist;
  field: keyof IntakeForm;
  signal: string;
  weight: number;
};

type KeywordSignal = {
  specialist: IntakeSpecialist;
  keywords: readonly string[];
  weight: number;
  label: string;
};

const SPECIALIST_ORDER: IntakeSpecialist[] = ['nexora', 'kaz', 'jynx', 'kalyra'];

const FIELD_SIGNALS: SpecialistSignal[] = [
  { specialist: 'nexora', field: 'techAutomationIssue', signal: 'reported tech or automation issue', weight: 5 },
  { specialist: 'nexora', field: 'currentTools', signal: 'existing software/tooling context', weight: 1 },
  { specialist: 'nexora', field: 'currentCrm', signal: 'CRM context', weight: 2 },
  { specialist: 'nexora', field: 'missedCallFollowUpIssue', signal: 'follow-up automation opportunity', weight: 2 },
  { specialist: 'kaz', field: 'operationsSopIssue', signal: 'reported operations, SOP, or process issue', weight: 5 },
  { specialist: 'kaz', field: 'mainBottleneck', signal: 'business bottleneck context', weight: 1 },
  { specialist: 'kaz', field: 'leadCustomerFlow', signal: 'lead/customer flow process context', weight: 2 },
  { specialist: 'kaz', field: 'missedCallFollowUpIssue', signal: 'follow-up process gap', weight: 2 },
  { specialist: 'jynx', field: 'financePricingCashFlowIssue', signal: 'reported finance, pricing, cash-flow, or invoice issue', weight: 5 },
  { specialist: 'jynx', field: 'budgetComfortRange', signal: 'budget or pricing context', weight: 1 },
  { specialist: 'kalyra', field: 'desiredOutcome', signal: 'buyer desired outcome or value proposition context', weight: 3 },
  { specialist: 'kalyra', field: 'mainBottleneck', signal: 'buyer pain point context', weight: 1 },
  { specialist: 'kalyra', field: 'budgetComfortRange', signal: 'buyer priority or offer-fit context', weight: 1 },
];

const KEYWORD_SIGNALS: KeywordSignal[] = [
  {
    specialist: 'nexora',
    keywords: [
      'automation',
      'automate',
      'integration',
      'api',
      'crm',
      'software',
      'tool',
      'zapier',
      'make.com',
      'webhook',
      'workflow',
      'dashboard',
      'database',
      'website',
      'app',
      'code',
      'ai agent',
      'bot',
      'chatbot',
      'missed call',
      'sms',
      'email sequence',
    ],
    weight: 2,
    label: 'tech/automation keyword',
  },
  {
    specialist: 'kaz',
    keywords: [
      'operations',
      'operation',
      'sop',
      'process',
      'procedure',
      'handoff',
      'onboarding',
      'fulfillment',
      'delivery',
      'team',
      'training',
      'bottleneck',
      'capacity',
      'client journey',
      'customer journey',
      'lead flow',
      'follow up',
      'follow-up',
      'intake',
      'pipeline',
    ],
    weight: 2,
    label: 'operations/SOP/process keyword',
  },

  {
    specialist: 'kalyra',
    keywords: [
      'offer',
      'proposal',
      'close',
      'closing',
      'sales call',
      'buyer',
      'objection',
      'follow-up question',
      'follow up question',
      'priority',
      'pain point',
      'value proposition',
      'buying signal',
      'confidence',
      'welcome language',
      'review call',
      'decision criteria',
      'stakeholder',
      'roi',
    ],
    weight: 2,
    label: 'sales enablement/buyer-readiness keyword',
  },
  {
    specialist: 'jynx',
    keywords: [
      'finance',
      'financial',
      'pricing',
      'cash flow',
      'cash-flow',
      'invoice',
      'invoicing',
      'payment',
      'collections',
      'revenue',
      'margin',
      'profit',
      'budget',
      'bookkeeping',
      'quote',
      'estimate',
      'subscription',
      'billing',
      'accounts receivable',
    ],
    weight: 2,
    label: 'finance/pricing/cash-flow/invoice keyword',
  },
];

const KEYWORD_FIELDS: Array<keyof IntakeForm> = [
  'industry',
  'mainBottleneck',
  'leadCustomerFlow',
  'missedCallFollowUpIssue',
  'financePricingCashFlowIssue',
  'operationsSopIssue',
  'techAutomationIssue',
  'desiredOutcome',
];

const REGULATED_INDUSTRY_KEYWORDS = [
  'healthcare',
  'medical',
  'clinic',
  'dental',
  'therapy',
  'therapist',
  'mental health',
  'pharma',
  'pharmaceutical',
  'legal',
  'law firm',
  'attorney',
  'lawyer',
  'accounting',
  'cpa',
  'tax',
  'financial services',
  'bank',
  'banking',
  'lending',
  'mortgage',
  'insurance',
  'investment',
  'wealth',
  'broker',
  'real estate',
  'education',
  'childcare',
  'cannabis',
] as const;

const REQUEST_RISK_KEYWORDS: Record<Exclude<IntakeRiskFlagType, 'regulated_industry'>, readonly string[]> = {
  legal_request: ['legal advice', 'lawsuit', 'contract review', 'terms of service', 'privacy policy', 'compliance advice'],
  tax_request: ['tax advice', 'tax strategy', 'tax return', 'tax filing', 'irs', 'deduction', 'write off', 'write-off'],
  investment_request: ['investment advice', 'invest', 'portfolio', 'securities', 'stock', 'crypto', 'retirement account'],
};

function fieldText(form: IntakeForm, field: keyof IntakeForm): string {
  const value = form[field];

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }

        return [item.name, item.fileName, item.mimeType].filter(Boolean).join(' ');
      })
      .join(' ')
      .trim();
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : '';
  }

  return '';
}

function includesKeyword(value: string, keyword: string): boolean {
  return value.toLowerCase().includes(keyword.toLowerCase());
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function roundConfidence(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}

function createRiskFlags(form: IntakeForm): IntakeClassificationRiskFlag[] {
  const flags: IntakeClassificationRiskFlag[] = [];
  const industry = fieldText(form, 'industry');

  for (const keyword of REGULATED_INDUSTRY_KEYWORDS) {
    if (industry && includesKeyword(industry, keyword)) {
      flags.push({
        type: 'regulated_industry',
        field: 'industry',
        value: industry,
        reason: `Industry matches regulated-industry signal "${keyword}".`,
      });
      break;
    }
  }

  for (const field of KEYWORD_FIELDS) {
    const value = fieldText(form, field);
    if (!value) {
      continue;
    }

    for (const [type, keywords] of Object.entries(REQUEST_RISK_KEYWORDS) as Array<
      [Exclude<IntakeRiskFlagType, 'regulated_industry'>, readonly string[]]
    >) {
      const keyword = keywords.find((candidate) => includesKeyword(value, candidate));
      if (keyword) {
        flags.push({
          type,
          field,
          value,
          reason: `Request matches ${type.replace('_', ' ')} signal "${keyword}".`,
        });
      }
    }
  }

  const seen = new Set<string>();
  return flags.filter((flag) => {
    const key = `${flag.type}:${flag.field}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function sortSpecialistsByScore(scores: Record<IntakeSpecialist, number>): IntakeSpecialist[] {
  return [...SPECIALIST_ORDER].sort((left, right) => {
    const scoreDifference = scores[right] - scores[left];
    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    return SPECIALIST_ORDER.indexOf(left) - SPECIALIST_ORDER.indexOf(right);
  });
}

function createConfidence(scores: Record<IntakeSpecialist, number>, primary: IntakeSpecialist): number {
  const total = SPECIALIST_ORDER.reduce((sum, specialist) => sum + scores[specialist], 0);
  if (total === 0) {
    return 0.35;
  }

  const primaryShare = scores[primary] / total;
  const signalStrength = Math.min(scores[primary] / 8, 1);
  const runnerUp = sortSpecialistsByScore(scores).find((specialist) => specialist !== primary);
  const separation = runnerUp ? Math.max(scores[primary] - scores[runnerUp], 0) / Math.max(scores[primary], 1) : 1;

  return roundConfidence(0.45 + signalStrength * 0.25 + primaryShare * 0.2 + separation * 0.1);
}

export function classifyIntake(rawInput: unknown): IntakeClassificationResult {
  const form = IntakeFormSchema.parse(rawInput);
  const scores: Record<IntakeSpecialist, number> = { nexora: 0, kaz: 0, jynx: 0, kalyra: 0 };
  const matchedSignals: IntakeClassificationReason[] = [];

  for (const signal of FIELD_SIGNALS) {
    const value = fieldText(form, signal.field);
    if (!value) {
      continue;
    }

    scores[signal.specialist] += signal.weight;
    matchedSignals.push({
      ...signal,
      reason: `${signal.signal} in ${signal.field}: ${value}`,
    });
  }

  for (const field of KEYWORD_FIELDS) {
    const value = fieldText(form, field);
    if (!value) {
      continue;
    }

    for (const signal of KEYWORD_SIGNALS) {
      const keyword = signal.keywords.find((candidate) => includesKeyword(value, candidate));
      if (!keyword) {
        continue;
      }

      scores[signal.specialist] += signal.weight;
      matchedSignals.push({
        specialist: signal.specialist,
        field,
        signal: `${signal.label}: ${keyword}`,
        weight: signal.weight,
        reason: `${signal.label} "${keyword}" found in ${field}: ${value}`,
      });
    }
  }

  const rankedSpecialists = sortSpecialistsByScore(scores);
  const primarySpecialist = scores[rankedSpecialists[0]] > 0 ? rankedSpecialists[0] : 'kaz';
  const secondarySpecialists = rankedSpecialists.filter(
    (specialist) => specialist !== primarySpecialist && scores[specialist] > 0,
  );
  const reasons = unique(
    matchedSignals
      .filter((match) => match.specialist === primarySpecialist || secondarySpecialists.includes(match.specialist))
      .map((match) => match.reason),
  );

  if (reasons.length === 0) {
    reasons.push('No specialist-specific intake signals were present; defaulting to Kaz for operations triage.');
  }

  return {
    primarySpecialist,
    secondarySpecialists,
    confidence: createConfidence(scores, primarySpecialist),
    reasons,
    riskFlags: createRiskFlags(form),
    scores,
    matchedSignals,
  };
}
