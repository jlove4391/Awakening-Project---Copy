import { createHash } from 'node:crypto';
import type { DeliverableRecord, IntakeRecord, SharedRecordValue } from '@awakening/shared';
import { remember } from '../../memory/index.js';
import type { MemoryReference, MemoryScope } from '../../types.js';
import {
  classifyIntake,
  type IntakeClassificationResult,
  type IntakeClassificationRiskFlag,
  type IntakeSpecialist,
} from './classifyIntake.js';
import { IntakeFormSchema, type IntakeForm, type IntakeUploadedFileMetadata } from './types.js';

export type RouteSpecialistStatus = 'draft_requested';
export type DeliverableRequestSource = 'intake_route_specialist';

export interface RouteSpecialistOptions {
  requestedAt?: string | Date;
  memoryScope?: MemoryScope | string;
}

export interface SpecialistDraftRequest {
  id: string;
  specialist: IntakeSpecialist;
  intakeId: string;
  sessionId?: string;
  leadId?: string;
  clientId?: string;
  source: DeliverableRequestSource;
  createdAt: string;
  title: string;
  objective: string;
  requestedDeliverableType: string;
  outputFormat: 'internal_draft';
  externalSend: false;
  constraints: string[];
  context: {
    intakeSummary: string;
    businessName: string;
    contactName: string;
    industry: string;
    website: string;
    desiredOutcome: string;
    timeline: string;
    budgetComfortRange: string;
    currentTools: string[];
    uploadedNotesFilesMetadata: IntakeUploadedFileMetadata[];
    keyIssues: string[];
  };
  classification: IntakeClassificationResult;
  humanReviewRequired: boolean;
  riskFlags: IntakeClassificationRiskFlag[];
}

export interface InternalDeliverableRequestPayload {
  requestId: string;
  deliverableId: string;
  intakeId: string;
  sessionId?: string;
  leadId?: string;
  clientId?: string;
  source: DeliverableRequestSource;
  createdAt: string;
  status: RouteSpecialistStatus;
  assignedSpecialist: IntakeSpecialist;
  secondarySpecialists: IntakeSpecialist[];
  title: string;
  description: string;
  instructions: string[];
  draftRequest: SpecialistDraftRequest;
  externalSend: false;
}

export interface RouteSpecialistResult {
  ok: true;
  status: RouteSpecialistStatus;
  intakeRecord: IntakeRecord;
  intakeForm: IntakeForm;
  classification: IntakeClassificationResult;
  specialist: IntakeSpecialist;
  draftRequest: SpecialistDraftRequest;
  deliverableRequest: InternalDeliverableRequestPayload;
  deliverableRecord: DeliverableRecord;
  memoryId: string;
  memory: MemoryReference;
  externalSend: false;
}

const DELIVERABLE_MEMORY_SCOPE = 'task_history' satisfies MemoryScope;
const STATUS_DRAFT_REQUESTED = 'draft_requested' satisfies RouteSpecialistStatus;

const SPECIALIST_DELIVERABLES: Record<
  IntakeSpecialist,
  {
    label: string;
    deliverableType: string;
    objective: string;
    instructions: string[];
  }
> = {
  nexora: {
    label: 'Nexora Tech Diagnostic Draft',
    deliverableType: 'tech_diagnostic_draft',
    objective: 'Create an internal tech diagnostic draft that maps the client\'s tooling, automation gaps, integration needs, and safe next-step recommendations.',
    instructions: [
      'Focus on systems, software, CRM, automation, integration, data-flow, and implementation-risk findings.',
      'Label assumptions, source gaps, approval gates, and any execution work requiring explicit human approval.',
      'Do not write code, change systems, contact third parties, or send the draft externally.',
    ],
  },
  kaz: {
    label: 'Kaz Operations Diagnostic Draft',
    deliverableType: 'operations_diagnostic_draft',
    objective: 'Create an internal operations diagnostic draft that maps process bottlenecks, SOP gaps, ownership issues, and 30/60/90 operational priorities.',
    instructions: [
      'Focus on SOPs, handoffs, client journey, fulfillment, team capacity, quality checks, and operating cadence.',
      'Label assumptions, unknowns, dependencies, and required human review before downstream use.',
      'Do not contact the client, assign work externally, or present the draft as a finalized deliverable.',
    ],
  },
  kalyra: {
    label: 'Kalyra Buyer Readiness Draft',
    deliverableType: 'buyer_readiness_draft',
    objective: 'Create an internal buyer-readiness draft that maps pain points, buyer priorities, objection prep, follow-up questions, value proposition refinements, missed buying signals, and respectful confidence-building language.',
    instructions: [
      'Focus on personalized offer draft angles, proposal review call scripts, buyer priorities, objection handling prep, follow-up question banks, closing conversation notes, and welcome language.',
      'Avoid manipulative pressure, false urgency, deceptive persuasion, or coercive tactics; keep recommendations transparent and buyer-centered.',
      'Do not send externally or make client-facing promises without Jordan approval.',
    ],
  },
  jynx: {
    label: 'Jynx Finance Operations Draft',
    deliverableType: 'finance_operations_diagnostic_draft',
    objective: 'Create an internal finance operations draft that maps pricing, cash-flow visibility, invoicing, payment follow-up, and dashboard requirements.',
    instructions: [
      'Focus on finance operations, pricing visibility, invoice workflow, payment process, cash-flow visibility, and profitability reporting.',
      'Flag legal, tax, investment, lending, or regulated-finance requests for qualified human review.',
      'Do not provide regulated financial advice, send externally, or treat recommendations as final without human approval.',
    ],
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

function stableHash(input: unknown) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 16);
}

function asString(value: SharedRecordValue | undefined): string {
  return typeof value === 'string' ? value : '';
}

function parseJsonArray(value: SharedRecordValue | undefined): unknown[] | undefined {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith('[')) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parseBoolean(value: SharedRecordValue | undefined): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }

  return undefined;
}

function createFormInput(record: IntakeRecord): Record<string, unknown> {
  const responses = record.responses ?? {};

  return {
    businessName: asString(responses.businessName),
    contactName: asString(responses.contactName),
    email: asString(responses.email),
    phone: asString(responses.phone),
    website: asString(responses.website),
    industry: asString(responses.industry),
    teamSize: asString(responses.teamSize),
    currentTools: parseJsonArray(responses.currentTools) ?? responses.currentTools,
    currentCrm: asString(responses.currentCrm),
    mainBottleneck: asString(responses.mainBottleneck),
    leadCustomerFlow: asString(responses.leadCustomerFlow),
    missedCallFollowUpIssue: asString(responses.missedCallFollowUpIssue),
    financePricingCashFlowIssue: asString(responses.financePricingCashFlowIssue),
    operationsSopIssue: asString(responses.operationsSopIssue),
    techAutomationIssue: asString(responses.techAutomationIssue),
    desiredOutcome: asString(responses.desiredOutcome),
    timeline: asString(responses.timeline),
    budgetComfortRange: asString(responses.budgetComfortRange),
    uploadedNotesFilesMetadata: parseJsonArray(responses.uploadedNotesFilesMetadata) ?? [],
    permissionToContact: parseBoolean(responses.permissionToContact) ?? responses.permissionToContact,
  };
}

function createKeyIssues(form: IntakeForm): string[] {
  return [
    form.mainBottleneck ? `Main bottleneck: ${form.mainBottleneck}` : undefined,
    form.leadCustomerFlow ? `Lead/customer flow: ${form.leadCustomerFlow}` : undefined,
    form.missedCallFollowUpIssue ? `Missed-call/follow-up issue: ${form.missedCallFollowUpIssue}` : undefined,
    form.financePricingCashFlowIssue ? `Finance/pricing/cash-flow issue: ${form.financePricingCashFlowIssue}` : undefined,
    form.operationsSopIssue ? `Operations/SOP issue: ${form.operationsSopIssue}` : undefined,
    form.techAutomationIssue ? `Tech/automation issue: ${form.techAutomationIssue}` : undefined,
  ].filter((issue): issue is string => Boolean(issue));
}

function createDraftRequestId(record: IntakeRecord, specialist: IntakeSpecialist) {
  return `draft_request_${stableHash({ intakeId: record.id, specialist, updatedAt: record.updatedAt })}`;
}

function createDeliverableId(record: IntakeRecord, specialist: IntakeSpecialist) {
  return `deliverable_${stableHash({ intakeId: record.id, specialist, updatedAt: record.updatedAt })}`;
}

function metadataValue(value: unknown): SharedRecordValue {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value;
  }

  if (value === undefined) {
    return null;
  }

  return JSON.stringify(value);
}

function createDescription(form: IntakeForm, specialist: IntakeSpecialist, classification: IntakeClassificationResult) {
  return [
    `${SPECIALIST_DELIVERABLES[specialist].label} requested from intake for ${form.businessName}.`,
    form.desiredOutcome ? `Desired outcome: ${form.desiredOutcome}.` : undefined,
    `Classification confidence: ${classification.confidence}.`,
  ]
    .filter(Boolean)
    .join(' ');
}

function createDraftRequest(
  record: IntakeRecord,
  form: IntakeForm,
  classification: IntakeClassificationResult,
  createdAt: string,
): SpecialistDraftRequest {
  const specialist = classification.primarySpecialist;
  const config = SPECIALIST_DELIVERABLES[specialist];

  return {
    id: createDraftRequestId(record, specialist),
    specialist,
    intakeId: record.id,
    sessionId: record.sessionId,
    leadId: record.leadId,
    clientId: record.clientId,
    source: 'intake_route_specialist',
    createdAt,
    title: `${config.label}: ${form.businessName}`,
    objective: config.objective,
    requestedDeliverableType: config.deliverableType,
    outputFormat: 'internal_draft',
    externalSend: false,
    constraints: [
      ...config.instructions,
      'Return an internal draft only; no external sends are allowed in this workflow version.',
      'Preserve traceability to the intake record, classification reasons, and risk flags.',
    ],
    context: {
      intakeSummary: record.summary ?? '',
      businessName: form.businessName,
      contactName: form.contactName,
      industry: form.industry,
      website: form.website,
      desiredOutcome: form.desiredOutcome,
      timeline: form.timeline,
      budgetComfortRange: form.budgetComfortRange,
      currentTools: form.currentTools,
      uploadedNotesFilesMetadata: form.uploadedNotesFilesMetadata,
      keyIssues: createKeyIssues(form),
    },
    classification,
    humanReviewRequired: classification.riskFlags.length > 0,
    riskFlags: classification.riskFlags,
  };
}

function createDeliverableRecord(
  record: IntakeRecord,
  form: IntakeForm,
  classification: IntakeClassificationResult,
  draftRequest: SpecialistDraftRequest,
  createdAt: string,
): DeliverableRecord {
  return {
    id: createDeliverableId(record, classification.primarySpecialist),
    createdAt,
    updatedAt: createdAt,
    status: STATUS_DRAFT_REQUESTED,
    clientId: record.clientId,
    intakeId: record.id,
    sessionId: record.sessionId,
    title: draftRequest.title,
    description: createDescription(form, classification.primarySpecialist, classification),
    artifactIds: [],
    metadata: {
      source: 'intake_route_specialist',
      assignedSpecialist: classification.primarySpecialist,
      secondarySpecialists: metadataValue(classification.secondarySpecialists),
      classificationConfidence: classification.confidence,
      riskFlagCount: classification.riskFlags.length,
      draftRequestId: draftRequest.id,
      externalSend: false,
    },
  };
}

function createDeliverablePayload(
  record: IntakeRecord,
  classification: IntakeClassificationResult,
  draftRequest: SpecialistDraftRequest,
  deliverableRecord: DeliverableRecord,
  createdAt: string,
): InternalDeliverableRequestPayload {
  const config = SPECIALIST_DELIVERABLES[classification.primarySpecialist];

  return {
    requestId: draftRequest.id,
    deliverableId: deliverableRecord.id,
    intakeId: record.id,
    sessionId: record.sessionId,
    leadId: record.leadId,
    clientId: record.clientId,
    source: 'intake_route_specialist',
    createdAt,
    status: STATUS_DRAFT_REQUESTED,
    assignedSpecialist: classification.primarySpecialist,
    secondarySpecialists: classification.secondarySpecialists,
    title: deliverableRecord.title ?? draftRequest.title,
    description: deliverableRecord.description ?? draftRequest.objective,
    instructions: [
      ...config.instructions,
      'Store work as an internal draft for later human review.',
      'Do not perform external sends in this workflow version.',
    ],
    draftRequest,
    externalSend: false,
  };
}

function deliverableMemoryText(deliverableRecord: DeliverableRecord, draftRequest: SpecialistDraftRequest) {
  return [
    `Deliverable placeholder ${deliverableRecord.id} is ${deliverableRecord.status}.`,
    `Assigned specialist: ${draftRequest.specialist}.`,
    `Title: ${deliverableRecord.title}.`,
    `Intake: ${deliverableRecord.intakeId}.`,
    'External send: false.',
  ].join(' ');
}

export async function routeSpecialist(
  intakeRecord: IntakeRecord,
  options: RouteSpecialistOptions = {},
): Promise<RouteSpecialistResult> {
  const createdAt = timestamp(options.requestedAt);
  const form = IntakeFormSchema.parse(createFormInput(intakeRecord));
  const classification = classifyIntake(form);
  const draftRequest = createDraftRequest(intakeRecord, form, classification, createdAt);
  const deliverableRecord = createDeliverableRecord(intakeRecord, form, classification, draftRequest, createdAt);
  const deliverableRequest = createDeliverablePayload(intakeRecord, classification, draftRequest, deliverableRecord, createdAt);
  const sessionId = intakeRecord.sessionId ?? 'global';

  const memory = await remember(sessionId, deliverableMemoryText(deliverableRecord, draftRequest), {
    id: deliverableRecord.id,
    scope: options.memoryScope ?? DELIVERABLE_MEMORY_SCOPE,
    tags: ['intake', 'deliverable', STATUS_DRAFT_REQUESTED, classification.primarySpecialist],
    metadata: { deliverableRecord, deliverableRequest, draftRequest, classification, intakeRecord, intakeForm: form },
    importance: 0.75,
    source: 'api',
    createdAt,
  });

  return {
    ok: true,
    status: STATUS_DRAFT_REQUESTED,
    intakeRecord,
    intakeForm: form,
    classification,
    specialist: classification.primarySpecialist,
    draftRequest,
    deliverableRequest,
    deliverableRecord,
    memoryId: memory.id,
    memory,
    externalSend: false,
  };
}

export const routeSpecialistWorkflow = routeSpecialist;
