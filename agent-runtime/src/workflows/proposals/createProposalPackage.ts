import type { CallTranscriptRecord, IntakeRecord, LeadRecord, SharedRecordValue } from '@awakening/shared';
import type { OfferTemplateRecord, ProposalRecord } from './types.js';

export type ProposalSpecialist = 'nexora' | 'kaz' | 'jynx';

export type ProposalNote = string | { id?: string; author?: string; createdAt?: string; body?: string; text?: string; summary?: string };

export type DomainSpecialistDraft =
  | string
  | {
      specialist?: string;
      summary?: string;
      recommendedSolution?: string;
      implementationScope?: string[];
      included?: string[];
      notIncluded?: string[];
      timeline?: string;
      priceOptions?: string[];
      risks?: string[];
      unresolvedQuestions?: string[];
      sections?: Partial<Record<ProposalSpecialist, string[]>>;
      metadata?: Record<string, SharedRecordValue>;
    };

export interface CreateProposalPackageInput {
  crmLeadData?: LeadRecord | Record<string, unknown>;
  transcriptRecords?: CallTranscriptRecord[];
  notes?: ProposalNote[];
  offerTemplate: OfferTemplateRecord;
  intakeRecord: IntakeRecord;
  domainSpecialistDraft?: DomainSpecialistDraft;
  createdAt?: string | Date;
  packageId?: string;
}

export interface KalyraSalesFrame {
  buyerContext: string;
  painSummaryInProspectLanguage: string;
  currentState: string;
  costOfInaction: string;
  desiredOutcome: string;
  recommendedCloseFrame: string;
  reviewCallAgenda: string[];
  unresolvedQuestions: string[];
}

export interface SpecialistScopeSection {
  specialist: ProposalSpecialist;
  title: string;
  relevanceSignals: string[];
  scopeItems: string[];
  guardrails: string[];
}

export interface EloraFinalProposalPackage {
  packageId: string;
  createdAt: string;
  reviewRequiredBy: 'Jordan';
  approvedForExternalSend: false;
  externalSend: false;
  proposalRecord: ProposalRecord;
  kalyraSalesFrame: KalyraSalesFrame;
  specialistScopeSections: SpecialistScopeSection[];
  sourceSnapshot: {
    leadId?: string;
    intakeId: string;
    transcriptIds: string[];
    offerTemplateId: string;
    noteCount: number;
  };
  jordanReviewChecklist: string[];
  internalCaveats: string[];
}

const SPECIALIST_CONFIG: Record<ProposalSpecialist, { title: string; keywords: string[]; defaultGuardrails: string[] }> = {
  nexora: {
    title: 'Nexora Tech / Automation Scope',
    keywords: ['automation', 'integration', 'crm', 'api', 'software', 'tech', 'system', 'workflow', 'zapier'],
    defaultGuardrails: ['Confirm all tool access and API limits before implementation.', 'Do not promise custom code deployment before technical discovery.'],
  },
  kaz: {
    title: 'Kaz Operations / SOP Scope',
    keywords: ['sop', 'process', 'operations', 'handoff', 'fulfillment', 'team', 'training', 'documentation'],
    defaultGuardrails: ['Validate owner capacity for process adoption.', 'Keep SOP deliverables practical and reviewable by the client team.'],
  },
  jynx: {
    title: 'Jynx Finance Operations Scope',
    keywords: ['pricing', 'cash', 'cashflow', 'invoice', 'billing', 'finance', 'margin', 'budget', 'revenue'],
    defaultGuardrails: ['Treat pricing and cash-flow recommendations as operational planning, not financial advice.', 'Jordan must review all monetary claims and ROI language.'],
  },
};

function timestamp(value: string | Date | undefined) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return new Date(value).toISOString();
  }

  return new Date().toISOString();
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function intakeResponse(intakeRecord: IntakeRecord, key: string) {
  return text(intakeRecord.responses?.[key]);
}

function noteText(note: ProposalNote) {
  if (typeof note === 'string') {
    return note.trim();
  }

  return text(note.body) || text(note.text) || text(note.summary);
}

function draftText(draft: DomainSpecialistDraft | undefined) {
  if (!draft) {
    return '';
  }

  if (typeof draft === 'string') {
    return draft;
  }

  return [draft.specialist, draft.summary, draft.recommendedSolution, ...(draft.implementationScope ?? []), ...(draft.risks ?? [])]
    .map(text)
    .filter(Boolean)
    .join('\n');
}

function firstNonEmpty(...values: unknown[]) {
  return values.map(text).find((value) => value.length > 0) ?? '';
}

function inferRelevantSpecialists(input: CreateProposalPackageInput): ProposalSpecialist[] {
  const haystack = [
    intakeResponse(input.intakeRecord, 'mainBottleneck'),
    intakeResponse(input.intakeRecord, 'techAutomationIssue'),
    intakeResponse(input.intakeRecord, 'operationsSopIssue'),
    intakeResponse(input.intakeRecord, 'financePricingCashFlowIssue'),
    input.intakeRecord.summary,
    input.offerTemplate.description,
    input.offerTemplate.recommendedSolution,
    ...input.transcriptRecords?.flatMap((record) => [record.summary, record.transcript]) ?? [],
    ...input.notes?.map(noteText) ?? [],
    draftText(input.domainSpecialistDraft),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();

  const explicitSpecialist = typeof input.domainSpecialistDraft === 'object' ? input.domainSpecialistDraft.specialist?.toLowerCase() : '';

  return (Object.keys(SPECIALIST_CONFIG) as ProposalSpecialist[]).filter((specialist) => {
    if (explicitSpecialist?.includes(specialist)) {
      return true;
    }

    return SPECIALIST_CONFIG[specialist].keywords.some((keyword) => haystack.includes(keyword));
  });
}

function buildScopeSection(specialist: ProposalSpecialist, input: CreateProposalPackageInput): SpecialistScopeSection {
  const draft = typeof input.domainSpecialistDraft === 'object' ? input.domainSpecialistDraft : undefined;
  const configured = SPECIALIST_CONFIG[specialist];
  const explicitItems = draft?.sections?.[specialist] ?? [];
  const fallbackItems = draft?.implementationScope?.length ? draft.implementationScope : input.offerTemplate.implementationScope;

  return {
    specialist,
    title: configured.title,
    relevanceSignals: configured.keywords.filter((keyword) =>
      [input.intakeRecord.summary, draftText(input.domainSpecialistDraft), input.offerTemplate.description].join('\n').toLowerCase().includes(keyword),
    ),
    scopeItems: explicitItems.length > 0 ? explicitItems : fallbackItems,
    guardrails: configured.defaultGuardrails,
  };
}

function buildKalyraFrame(input: CreateProposalPackageInput): KalyraSalesFrame {
  const lead = input.crmLeadData as Partial<LeadRecord> | undefined;
  const draft = typeof input.domainSpecialistDraft === 'object' ? input.domainSpecialistDraft : undefined;
  const transcriptSummary = input.transcriptRecords?.map((record) => record.summary).filter(Boolean).join('\n') ?? '';
  const desiredOutcome = firstNonEmpty(intakeResponse(input.intakeRecord, 'desiredOutcome'), draft?.recommendedSolution, input.offerTemplate.recommendedSolution);
  const pain = firstNonEmpty(intakeResponse(input.intakeRecord, 'mainBottleneck'), input.intakeRecord.summary, transcriptSummary);

  return {
    buyerContext: firstNonEmpty(lead?.company, intakeResponse(input.intakeRecord, 'businessName'), lead?.name, 'Prospect context pending Jordan review.'),
    painSummaryInProspectLanguage: pain,
    currentState: firstNonEmpty(intakeResponse(input.intakeRecord, 'leadCustomerFlow'), intakeResponse(input.intakeRecord, 'currentCrm'), lead?.notes),
    costOfInaction: pain ? `If unresolved, this likely keeps creating drag around: ${pain}` : 'Cost of inaction requires Jordan review before client-facing language.',
    desiredOutcome,
    recommendedCloseFrame: 'Position the proposal as a reviewed first-step operating package, anchored to the prospect\'s stated pain and a clear 30-day win.',
    reviewCallAgenda: [
      'Confirm the prospect pain and desired outcome in their own words.',
      'Review recommended scope, timeline, and quick-win promise.',
      'Resolve open pricing, authority, timeline, and implementation-access questions.',
      'Confirm Jordan approval before any external proposal send.',
    ],
    unresolvedQuestions: draft?.unresolvedQuestions ?? [],
  };
}

export function createProposalPackage(input: CreateProposalPackageInput): EloraFinalProposalPackage {
  const createdAt = timestamp(input.createdAt);
  const lead = input.crmLeadData as Partial<LeadRecord> | undefined;
  const draft = typeof input.domainSpecialistDraft === 'object' ? input.domainSpecialistDraft : undefined;
  const kalyraSalesFrame = buildKalyraFrame(input);
  const relevantSpecialists = inferRelevantSpecialists(input);
  const specialistScopeSections = relevantSpecialists.map((specialist) => buildScopeSection(specialist, input));
  const proposalId = `proposal_${input.intakeRecord.id}_${input.offerTemplate.id}`;
  const packageId = input.packageId ?? `elora_proposal_package_${proposalId}`;

  const proposalRecord: ProposalRecord = {
    id: proposalId,
    createdAt,
    updatedAt: createdAt,
    status: 'pending_jordan_review',
    leadId: input.intakeRecord.leadId || lead?.id || '',
    clientId: input.intakeRecord.clientId || lead?.clientId || '',
    intakeId: input.intakeRecord.id,
    sessionId: input.intakeRecord.sessionId || lead?.sessionId || '',
    offerTemplateId: input.offerTemplate.id,
    title: `${input.offerTemplate.name} Proposal`,
    summary: firstNonEmpty(draft?.summary, input.offerTemplate.description, input.intakeRecord.summary),
    painSummaryInProspectLanguage: kalyraSalesFrame.painSummaryInProspectLanguage,
    currentState: kalyraSalesFrame.currentState,
    costOfInaction: kalyraSalesFrame.costOfInaction,
    desiredOutcome: kalyraSalesFrame.desiredOutcome,
    recommendedSolution: firstNonEmpty(draft?.recommendedSolution, input.offerTemplate.recommendedSolution),
    first30DayPlan: 'Jordan review package: confirm scope, validate access requirements, and convert approved scope into a client-safe first 30-day plan.',
    quickWinPromise: input.offerTemplate.quickWinPromise,
    implementationScope: draft?.implementationScope?.length ? draft.implementationScope : input.offerTemplate.implementationScope,
    included: draft?.included?.length ? draft.included : input.offerTemplate.included,
    notIncluded: draft?.notIncluded?.length ? draft.notIncluded : input.offerTemplate.notIncluded,
    timeline: firstNonEmpty(draft?.timeline, input.offerTemplate.timeline, intakeResponse(input.intakeRecord, 'timeline')),
    priceOptions: draft?.priceOptions?.length ? draft.priceOptions : input.offerTemplate.priceOptions,
    reviewCallAgenda: kalyraSalesFrame.reviewCallAgenda,
    unresolvedQuestions: kalyraSalesFrame.unresolvedQuestions,
    currency: 'USD',
    validUntil: '',
    acceptedAt: '',
    metadata: {
      internalOnly: true,
      externalSend: false,
      approvedForExternalSend: false,
      reviewRequiredBy: 'Jordan',
      packageId,
      relevantSpecialists: relevantSpecialists.join(','),
    },
  };

  return {
    packageId,
    createdAt,
    reviewRequiredBy: 'Jordan',
    approvedForExternalSend: false,
    externalSend: false,
    proposalRecord,
    kalyraSalesFrame,
    specialistScopeSections,
    sourceSnapshot: {
      leadId: proposalRecord.leadId,
      intakeId: input.intakeRecord.id,
      transcriptIds: input.transcriptRecords?.map((record) => record.id) ?? [],
      offerTemplateId: input.offerTemplate.id,
      noteCount: input.notes?.length ?? 0,
    },
    jordanReviewChecklist: [
      'Confirm the ProposalRecord is accurate and complete.',
      'Approve, revise, or remove Kalyra sales framing before client use.',
      'Review Nexora/Kaz/Jynx scope sections and remove irrelevant sections.',
      'Validate price, timeline, access requirements, and unresolved questions.',
      'Only after Jordan approval should a separate client-facing proposal be generated or sent.',
    ],
    internalCaveats: [
      'Internal ELORA final package for Jordan review only.',
      'Do not send the full proposal externally from this workflow.',
      'No external-send side effects are performed by createProposalPackage.',
    ],
  };
}
