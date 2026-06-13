import type { IntakeRecord, ProposalRecord, RuntimeAgentName, SharedRecordValue } from '@awakening/shared';
import type { IntakeClassificationResult, IntakeSpecialist } from '../intake/classifyIntake.js';

export type FirstWinArtifactType =
  | 'automation_system_map'
  | 'sop_process_client_journey_map'
  | 'finance_pricing_cash_flow_snapshot'
  | 'buyer_confidence_next_step_communication'
  | 'comms_scheduling_receipts_project_coordination';

export type FirstWinOwner = RuntimeAgentName;

export interface DomainClassificationInput {
  primarySpecialist?: RuntimeAgentName | IntakeSpecialist | string;
  assignedSpecialist?: RuntimeAgentName | IntakeSpecialist | string;
  recommendedSpecialist?: RuntimeAgentName | IntakeSpecialist | string;
  secondarySpecialists?: Array<RuntimeAgentName | IntakeSpecialist | string>;
  relevantSpecialists?: Array<RuntimeAgentName | IntakeSpecialist | string> | string;
  reasons?: string[];
  confidence?: number;
  scores?: Partial<Record<RuntimeAgentName, number>> | Record<string, number>;
  matchedSignals?: unknown[];
}

export interface CreateFirstWinPlanInput {
  intakeRecord?: IntakeRecord | Partial<IntakeRecord> | null;
  proposalRecord?: ProposalRecord | Partial<ProposalRecord> | null;
  classification?: IntakeClassificationResult | DomainClassificationInput | null;
  domainClassification?: IntakeClassificationResult | DomainClassificationInput | null;
  approvedAt?: string | Date;
  planId?: string;
}

export interface FirstWinPlanStep {
  id: string;
  title: string;
  owner: FirstWinOwner;
  description: string;
  sourceSignals: string[];
  approvalGate: 'internal_only' | 'jordan_review_required_before_external_use';
}

export interface FirstWinPlan {
  id: string;
  createdAt: string;
  status: 'approved_first_internal_plan';
  internalOnly: true;
  externalSend: false;
  approvedForExternalSend: false;
  owner: FirstWinOwner;
  artifactType: FirstWinArtifactType;
  artifactTitle: string;
  objective: string;
  sourceSnapshot: {
    intakeId?: string;
    proposalId?: string;
    leadId?: string;
    clientId?: string;
    sessionId?: string;
    selectedDomain: FirstWinOwner;
    classificationConfidence?: number;
  };
  sourceSignals: string[];
  steps: FirstWinPlanStep[];
  approvalChecklist: string[];
  internalCaveats: string[];
  metadata: Record<string, SharedRecordValue>;
}

const DOMAIN_ORDER: FirstWinOwner[] = ['nexora', 'kaz', 'jynx', 'kalyra', 'elora'];

const ARTIFACT_CONFIG: Record<FirstWinOwner, { artifactType: FirstWinArtifactType; artifactTitle: string; objective: string; defaultSignals: string[] }> = {
  nexora: {
    artifactType: 'automation_system_map',
    artifactTitle: 'Approved-first automation / system map',
    objective: 'Create an internal map of the first automation or system improvement that can be reviewed before any client-facing implementation promise.',
    defaultSignals: ['tech automation issue', 'current tools', 'CRM or integration context'],
  },
  kaz: {
    artifactType: 'sop_process_client_journey_map',
    artifactTitle: 'Approved-first SOP / process / client journey map',
    objective: 'Create an internal process map that clarifies the client journey, handoffs, and first SOP win for review before client use.',
    defaultSignals: ['operations issue', 'SOP/process gap', 'lead or customer flow context'],
  },
  jynx: {
    artifactType: 'finance_pricing_cash_flow_snapshot',
    artifactTitle: 'Approved-first finance / pricing / cash-flow snapshot',
    objective: 'Create an internal finance operations snapshot that frames pricing, cash-flow, invoice, or revenue-cycle observations without giving financial advice.',
    defaultSignals: ['finance issue', 'pricing context', 'cash-flow or invoice concern'],
  },
  kalyra: {
    artifactType: 'buyer_confidence_next_step_communication',
    artifactTitle: 'Approved-first buyer confidence and next-step communication',
    objective: 'Create internal buyer-confidence language and next-step communication that Jordan can approve before anything is sent externally.',
    defaultSignals: ['buyer confidence', 'desired outcome', 'proposal or next-step context'],
  },
  elora: {
    artifactType: 'comms_scheduling_receipts_project_coordination',
    artifactTitle: 'Approved-first comms, scheduling, receipts, and project coordination plan',
    objective: 'Create an internal coordination plan for kickoff communications, scheduling, receipts, and project handoff tracking.',
    defaultSignals: ['closed-won coordination', 'scheduling', 'receipts', 'project handoff'],
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

function response(record: Partial<IntakeRecord> | undefined | null, key: string): string {
  return text(record?.responses?.[key]);
}

function normalizeDomain(value: unknown): FirstWinOwner | undefined {
  const normalized = text(value).toLowerCase();
  return DOMAIN_ORDER.find((domain) => normalized === domain || normalized.includes(domain));
}

function parseRelevantSpecialists(value: unknown): FirstWinOwner[] {
  if (Array.isArray(value)) {
    return value.map(normalizeDomain).filter((domain): domain is FirstWinOwner => Boolean(domain));
  }

  return text(value)
    .split(/[,\n]+/u)
    .map(normalizeDomain)
    .filter((domain): domain is FirstWinOwner => Boolean(domain));
}

function classificationInput(input: CreateFirstWinPlanInput): DomainClassificationInput | IntakeClassificationResult | undefined {
  return input.classification ?? input.domainClassification ?? undefined;
}

function classificationField(classification: DomainClassificationInput | IntakeClassificationResult | undefined, field: keyof DomainClassificationInput): unknown {
  return classification ? (classification as DomainClassificationInput)[field] : undefined;
}

function selectDomain(input: CreateFirstWinPlanInput): FirstWinOwner {
  const classification = classificationInput(input);
  const metadataDomain = normalizeDomain(input.proposalRecord?.metadata?.relevantSpecialists);
  const explicit = normalizeDomain(classification?.primarySpecialist)
    ?? normalizeDomain(classificationField(classification, 'assignedSpecialist'))
    ?? normalizeDomain(classificationField(classification, 'recommendedSpecialist'))
    ?? normalizeDomain(input.proposalRecord?.metadata?.assignedSpecialist)
    ?? normalizeDomain(input.proposalRecord?.metadata?.relevantSpecialists)
    ?? normalizeDomain(input.intakeRecord?.metadata?.assignedSpecialist)
    ?? normalizeDomain(input.intakeRecord?.metadata?.primarySpecialist)
    ?? metadataDomain;

  if (explicit) {
    return explicit;
  }

  const relevant = parseRelevantSpecialists(classificationField(classification, 'relevantSpecialists') ?? input.proposalRecord?.metadata?.relevantSpecialists);
  if (relevant[0]) {
    return relevant[0];
  }

  return 'elora';
}

function compact(values: Array<string | undefined>): string[] {
  return values.map((value) => value?.trim() ?? '').filter(Boolean);
}

function sourceSignals(input: CreateFirstWinPlanInput, owner: FirstWinOwner): string[] {
  const intake = input.intakeRecord;
  const proposal = input.proposalRecord;
  const classification = classificationInput(input);
  return [
    ...ARTIFACT_CONFIG[owner].defaultSignals,
    ...compact([
      intake?.summary,
      response(intake, 'mainBottleneck'),
      response(intake, 'techAutomationIssue'),
      response(intake, 'operationsSopIssue'),
      response(intake, 'financePricingCashFlowIssue'),
      response(intake, 'desiredOutcome'),
      proposal?.summary,
      proposal?.painSummaryInProspectLanguage,
      proposal?.recommendedSolution,
      proposal?.quickWinPromise,
      ...(classification?.reasons ?? []),
    ]),
  ].filter((value, index, values) => values.indexOf(value) === index);
}

function buildSteps(owner: FirstWinOwner, signals: string[]): FirstWinPlanStep[] {
  return [
    {
      id: 'collect-context',
      title: 'Collect approved source context',
      owner: 'elora',
      description: 'Use intake, proposal, and domain-classification notes only; do not contact or message the client from this workflow.',
      sourceSignals: signals.slice(0, 4),
      approvalGate: 'internal_only',
    },
    {
      id: 'draft-artifact',
      title: `Draft ${ARTIFACT_CONFIG[owner].artifactTitle}`,
      owner,
      description: ARTIFACT_CONFIG[owner].objective,
      sourceSignals: signals.slice(0, 6),
      approvalGate: 'internal_only',
    },
    {
      id: 'prepare-review',
      title: 'Prepare Jordan review gate',
      owner: 'elora',
      description: 'Package the artifact, caveats, assumptions, and next-step recommendation for approval before any external use.',
      sourceSignals: signals.slice(0, 5),
      approvalGate: 'jordan_review_required_before_external_use',
    },
  ];
}

export function createFirstWinPlan(input: CreateFirstWinPlanInput): FirstWinPlan {
  const createdAt = timestamp(input.approvedAt);
  const owner = selectDomain(input);
  const config = ARTIFACT_CONFIG[owner];
  const signals = sourceSignals(input, owner);
  const classification = classificationInput(input);
  const proposalId = input.proposalRecord?.id;
  const intakeId = input.intakeRecord?.id;
  const id = input.planId ?? `first_win_plan_${proposalId ?? intakeId ?? owner}`;

  return {
    id,
    createdAt,
    status: 'approved_first_internal_plan',
    internalOnly: true,
    externalSend: false,
    approvedForExternalSend: false,
    owner,
    artifactType: config.artifactType,
    artifactTitle: config.artifactTitle,
    objective: config.objective,
    sourceSnapshot: {
      intakeId,
      proposalId,
      leadId: input.proposalRecord?.leadId || input.intakeRecord?.leadId,
      clientId: input.proposalRecord?.clientId || input.intakeRecord?.clientId,
      sessionId: input.proposalRecord?.sessionId || input.intakeRecord?.sessionId,
      selectedDomain: owner,
      classificationConfidence: classification?.confidence,
    },
    sourceSignals: signals,
    steps: buildSteps(owner, signals),
    approvalChecklist: [
      'Confirm the selected first-win artifact matches the approved intake, proposal, and domain classification.',
      'Validate assumptions, source gaps, and any access or scheduling dependencies.',
      'Confirm client-facing language is created in a separate approved workflow before external send.',
    ],
    internalCaveats: [
      'Internal FirstWinPlan only; no external message, file, email, schedule invite, receipt, or client artifact is sent by this workflow.',
      'Jordan approval is required before any plan content is converted into client-facing communication or deliverables.',
    ],
    metadata: {
      internalOnly: true,
      externalSend: false,
      approvedForExternalSend: false,
      createdBy: 'createFirstWinPlan',
      selectedDomain: owner,
      artifactType: config.artifactType,
    },
  };
}
