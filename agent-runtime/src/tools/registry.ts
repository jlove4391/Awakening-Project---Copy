import { createHash, randomUUID } from 'node:crypto';
import { tool } from '@openai/agents';
import { z } from 'zod';
import { durableMemoryScopes, listMemories, remember, retrieveMemories, summarizeMemories } from '../memory/index.js';
import { writeToolAuditLog, sanitizeAuditInput } from '../audit/auditLogger.js';
import {
  completeExecutionRecord,
  createExecutionRecord,
  getExecutionRecord,
  summarizeProviderResponse,
  writeExecutionRecord,
} from '../executions.js';
import { createCalendarEvent, listCalendarEvents } from '../providers/google/calendar.js';
import {
  createDigitalOceanApp,
  createDigitalOceanDatabase,
  digitalOceanProviderStatus,
  listDigitalOceanApps,
  listDigitalOceanDatabases,
  requireDigitalOceanInfrastructureApproval,
} from '../providers/digitalocean/index.js';
import { appendActivity, lookupCrmContact, updateLeadStatus, upsertCrmContact } from '../providers/crm/index.js';
import { enrichPersonWithClay } from '../providers/clay/index.js';
import { exportSequence, findLeadsWorkflow, runLeadgenProofWorkflow } from '../workflows/leadgen/index.js';
import { evaluateCampaignGuardrails } from '../workflows/campaigns/guardrails.js';
import { classifyReply } from '../workflows/outreach/classifyReply.js';
import { recordOptOut } from '../workflows/outreach/optOut.js';
import { scheduleFollowUp } from '../workflows/outreach/scheduleFollowUp.js';
import type { SocialPlatform, SocialProspect, SocialReplyClassification } from '../workflows/socialSelling/types.js';
import { sendApprovedEmail } from '../workflows/outreach/sendApprovedEmail.js';
import { createBetterQuestionsPrompt } from '../workflows/objections/betterQuestions.js';
import { createCallInsightReport } from '../workflows/objections/createCallInsightReport.js';
import { extractObjections } from '../workflows/objections/extractObjections.js';
import { classifyIntake } from '../workflows/intake/classifyIntake.js';
import { createIntakeRecord } from '../workflows/intake/createIntakeRecord.js';
import { packageForReview } from '../workflows/intake/packageForReview.js';
import { routeSpecialist } from '../workflows/intake/routeSpecialist.js';
import { importTranscript } from '../workflows/qualification/importTranscript.js';
import { checkQualificationGate } from '../workflows/qualification/qualificationGate.js';
import { scoreQualification } from '../workflows/qualification/scoreQualification.js';
import { QualificationRecordSchema, type QualificationRecord } from '../workflows/qualification/types.js';
import { createProposalPackage } from '../workflows/proposals/createProposalPackage.js';
import { createProposalReviewCallGate } from '../workflows/proposals/reviewCallGate.js';
import { ProposalRecordSchema } from '../workflows/proposals/types.js';
import { captureClose } from '../workflows/closing/captureClose.js';
import { createDeliveryTasks } from '../workflows/closing/createDeliveryTasks.js';
import { createFirstWinPlan } from '../workflows/closing/createFirstWinPlan.js';
import { ClientRecordSchema, ProjectRecordSchema } from '../workflows/closing/types.js';
import { createWelcomeSequence } from '../workflows/closing/welcomeSequence.js';
import { scaffoldApp } from '../workflows/nexora/scaffoldApp.js';
import { createDriveTextFile, searchDriveFiles } from '../providers/google/drive.js';
import { createGmailDraft, searchGmailMessages, sendGmailEmail } from '../providers/google/gmail.js';
import { readSheetRange, updateSheetRange } from '../providers/google/sheets.js';
import type { RuntimeContext } from '../types.js';
import type { ApprovalScope } from '../tasks/types.js';
import {
  codeCommit,
  codeCopyPath,
  codeCreateFile,
  codeDeleteFile,
  codeDeletePath,
  codeDependencySummary,
  codeDiff,
  codeEdit,
  codeFindConfigs,
  codeFindEntrypoints,
  codeGitCreateBranch,
  codeGitDiff,
  codeGitLog,
  codeGitRestoreFile,
  codeGitStatus,
  codeMkdir,
  codeMovePath,
  codePackageScripts,
  codePatchFile,
  codeProjectSummary,
  codeRead,
  codeReadJson,
  codeRunCommand,
  codeSearch,
  codeTest,
  codeTree,
  codeWriteJson,
  vscodeOpen,
  vscodeStatus,
  workspaceRoot,
} from './codeTools.js';
import {
  approveDelegationTask,
  approveDelegationStep,
  cancelDelegationTask,
  createAutonomousProposal,
  createDelegationTask,
  getDelegationTask,
  listDelegationTasks,
  recordDelegationTaskResult,
  resumeDelegationTask,
  updateDelegationTask,
} from './delegation.js';
import { executeDelegatedCode } from '../workers/nexora/bridge.js';
import { getDelegatedTask as getStoredDelegatedTask } from '../tasks/store.js';
import { redactForLogs, redactProviderReceiptPayload } from '../workflows/nexora/secretsPolicy.js';
import { webCrawlSite, webFetchUrl } from './webTools.js';
import { activeAutonomyLevel, autonomyLevelAllows, normalizeExecutionMode, proactiveObservationAllows, requiresApprovalForExecutionMode } from '../governance/autonomyProfiles.js';
import { createObservationRecommendation } from '../governance/recommendations.js';
import { decideToolPolicy } from '../governance/policyDecision.js';
import { recordTrustEventFromPolicyDecision } from '../governance/trustService.js';


export type ToolCategory =
  | 'calendar'
  | 'gmail'
  | 'drive'
  | 'sheets'
  | 'crm'
  | 'clay'
  | 'digitalocean'
  | 'databank'
  | 'leadgen'
  | 'campaign'
  | 'outreach'
  | 'social'
  | 'objection'
  | 'intake'
  | 'qualification'
  | 'proposal'
  | 'closing'
  | 'voice'
  | 'memory'
  | 'delegation'
  | 'nexora'
  | 'code'
  | 'vscode'
  | 'web'
  | 'observation';

export type ToolRiskLevel = 'read' | 'write' | 'external_send' | 'purchase_or_commit' | 'code_execution';

type JsonSchema = {
  type: 'object';
  additionalProperties?: boolean;
  properties: Record<string, unknown>;
  required?: string[];
};

type ToolExecutor = (input: any, context: RuntimeContext) => Promise<unknown>;

export interface ToolAuditMetadata {
  category: ToolCategory;
  action: string;
  resourceType: string;
  resourceIdField?: string;
  actorField?: string;
  sensitiveFields?: string[];
  logEvents: string[];
}

export interface RegisteredToolDefinition {
  name: `${ToolCategory}.${string}`;
  description: string;
  inputSchema: JsonSchema;
  parameters: any;
  scopes: string[];
  requiredApprovalScope?: ApprovalScope;
  riskLevel: ToolRiskLevel;
  humanApprovalRequired: boolean;
  audit: ToolAuditMetadata;
  executor: ToolExecutor;
}

function unavailableProvider(category: ToolCategory, provider: string): ToolExecutor {
  return async (input, context) => ({
    ok: false,
    status: 'provider_not_configured',
    category,
    provider,
    sessionId: context.sessionId,
    requestedInput: input,
    message:
      `The ${category} provider adapter is registered, but ${provider} credentials/client wiring has not been configured in the new runtime yet.`,
  });
}

function objectSchema(properties: Record<string, unknown>, required: string[] = []): JsonSchema {
  return { type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}) };
}

const stringSchema = (description: string) => ({ type: 'string', description });
const numberSchema = (description: string, options: Record<string, unknown> = {}) => ({
  type: 'number',
  description,
  ...options,
});
const stringArraySchema = (description: string) => ({
  type: 'array',
  description,
  items: { type: 'string' },
});
const approvalBooleanSchema = {
  type: 'boolean',
  description: 'Must be true only after explicit user approval for this write/send action.',
};
const approvalNoteSchema = stringSchema('Optional note describing the user approval that authorized this action.');
const relativePathSchema = stringSchema('Workspace-relative path under the configured Nexora workspace root. Absolute paths and parent traversal are rejected.');
const intakeFormSchemaProperties = {
  businessName: stringSchema('Business name from the intake form.'),
  contactName: stringSchema('Primary contact name from the intake form.'),
  email: stringSchema('Primary contact email address.'),
  phone: stringSchema('Primary contact phone number.'),
  website: stringSchema('Business website.'),
  industry: stringSchema('Business industry or niche.'),
  teamSize: stringSchema('Team size or operating scale.'),
  currentTools: stringArraySchema('Current tools, systems, and software used by the business.'),
  currentCrm: stringSchema('Current CRM or customer database.'),
  mainBottleneck: stringSchema('Main bottleneck described by the client.'),
  leadCustomerFlow: stringSchema('Lead, customer, or client journey flow notes.'),
  missedCallFollowUpIssue: stringSchema('Missed-call or follow-up gaps.'),
  financePricingCashFlowIssue: stringSchema('Finance, pricing, cash-flow, invoice, or payment issues.'),
  operationsSopIssue: stringSchema('Operations, SOP, handoff, or fulfillment issues.'),
  techAutomationIssue: stringSchema('Tech, tooling, integration, or automation issues.'),
  desiredOutcome: stringSchema('Desired outcome from the engagement.'),
  timeline: stringSchema('Desired timeline.'),
  budgetComfortRange: stringSchema('Budget comfort range.'),
  uploadedNotesFilesMetadata: {
    type: 'array',
    description: 'Metadata for uploaded intake notes/files; file contents are not sent externally by these tools.',
    items: { type: 'object', additionalProperties: true },
  },
  permissionToContact: { type: 'boolean', description: 'Whether the intake form says the contact permits follow-up; these tools still do not send externally.' },
};
const intakeRecordSchema = { type: 'object', additionalProperties: true, description: 'IntakeRecord produced by intake.create_record.' };
const intakeClassificationSchema = { type: 'object', additionalProperties: true, description: 'Classification result produced by intake.classify.' };
const qualificationRecordJsonSchema = { type: 'object', additionalProperties: true, description: 'Internal QualificationRecord.' };
const callTranscriptRecordJsonSchema = { type: 'object', additionalProperties: true, description: 'Internal CallTranscriptRecord.' };
const proposalRecordJsonSchema = { type: 'object', additionalProperties: true, description: 'Internal ProposalRecord.' };
const proposalReviewCallJsonSchema = { type: 'object', additionalProperties: true, description: 'Internal ProposalReviewCall.' };
const qualificationFormSchemaProperties = {
  leadId: stringSchema('Lead ID to attach this qualification record to.'),
  intakeId: stringSchema('Intake ID or form submission ID that produced these answers.'),
  source: stringSchema('Qualification source; defaults to form for create_from_form.'),
  monthlyLeadVolume: numberSchema('Approximate monthly lead volume.', { minimum: 0 }),
  responseSpeed: stringSchema('Typical response speed to new leads.'),
  missedCallsMessages: numberSchema('Estimated missed calls, messages, or unresponded leads per month.', { minimum: 0 }),
  crmTrackingSystem: stringSchema('CRM, spreadsheet, or tracking system currently used.'),
  averageJobCustomerValue: numberSchema('Average job, customer, or case value in dollars.', { minimum: 0 }),
  closeRate: numberSchema('Approximate close rate as a percentage from 0 to 100.', { minimum: 0, maximum: 100 }),
  crackFallthroughPoints: stringArraySchema('Known places where leads fall through the cracks.'),
  desired30DayImprovement: stringSchema('Improvement the lead wants in the next 30 days.'),
  qualificationScore: numberSchema('Optional existing qualification score from 0 to 100; score tool can recompute it.', { minimum: 0, maximum: 100 }),
  status: stringSchema('Internal qualification status; defaults to needs_review.'),
  createdAt: stringSchema('Optional creation timestamp.'),
  updatedAt: stringSchema('Optional update timestamp.'),
  memoryScope: stringSchema('Optional memory scope for the internal qualification memory.'),
};
const qualificationRecordStore = new Map<string, QualificationRecord>();
const genericObjectJsonSchema = { type: 'object', additionalProperties: true };
const leadRecordJsonSchema = { type: 'object', additionalProperties: true, description: 'LeadRecord to update during outreach workflows.' };
const campaignRecordJsonSchema = { type: 'object', additionalProperties: true, description: 'CampaignRecord for campaign guardrail checks.' };
const campaignCandidateArrayJsonSchema = { type: 'array', description: 'Campaign send candidates to evaluate.', items: genericObjectJsonSchema };
const campaignComplaintSignalArrayJsonSchema = { type: 'array', description: 'Complaint, unsubscribe, or error-adjacent signals that may pause a campaign.', items: genericObjectJsonSchema };
const outreachDraftJsonSchema = { type: 'object', additionalProperties: true, description: 'Outreach draft produced by outreach.draft_email.' };
const approvedSendRequestJsonSchema = { type: 'object', additionalProperties: true, description: 'ApprovedSendRequest produced by outreach.approve_send.' };
const replyClassificationJsonSchema = { type: 'object', additionalProperties: true, description: 'ReplyClassification produced by outreach.classify_reply.' };
const socialProspectJsonSchema = { type: 'object', additionalProperties: true, description: 'SocialProspect for draft-only social selling workflows.' };
const socialReplyClassificationJsonSchema = { type: 'object', additionalProperties: true, description: 'SocialReplyClassification produced by social.classify_reply.' };
const optOutRecordArrayJsonSchema = { type: 'array', description: 'Known opt-out records to suppress sends.', items: genericObjectJsonSchema };
const objectionRecordArrayJsonSchema = { type: 'array', description: 'Internal objection records or notes.', items: genericObjectJsonSchema };
const callInsightReportJsonSchema = { type: 'object', additionalProperties: true, description: 'Internal call insight report produced by objection.create_call_insight_report.' };
const scaffoldFileArrayJsonSchema = { type: 'array', description: 'Files to create under appDir; each item can include content or json.', items: genericObjectJsonSchema };
const scaffoldCommandArrayJsonSchema = { type: 'array', description: 'Optional approved install/build/test commands to run after scaffolding.', items: genericObjectJsonSchema };

const digitalOceanListSchema = objectSchema({
  page: numberSchema('DigitalOcean API page number.', { minimum: 1 }),
  perPage: numberSchema('DigitalOcean API items per page.', { minimum: 1, maximum: 200 }),
});
const digitalOceanListParameters = z.object({
  page: z.number().int().min(1).default(1),
  perPage: z.number().int().min(1).max(200).default(20),
});


const digitalOceanPlanAppSchema = objectSchema({
  spec: { type: 'object', additionalProperties: true, description: 'Desired DigitalOcean App Platform spec to validate and plan. Common required fields are name, region, and at least one component such as services/static_sites/workers/jobs.' },
}, ['spec']);
const digitalOceanPlanAppParameters = z.object({
  spec: z.record(z.string(), z.any()),
});

const digitalOceanPlanDatabaseSchema = objectSchema({
  spec: { type: 'object', additionalProperties: true, description: 'Desired DigitalOcean managed database cluster spec to validate and plan. Required fields are name, engine, region, size, and num_nodes.' },
}, ['spec']);
const digitalOceanPlanDatabaseParameters = z.object({
  spec: z.record(z.string(), z.any()),
});


const digitalOceanCreatePlanSchema = objectSchema({
  planId: stringSchema('Execution receipt ID from digitalocean.plan_app or digitalocean.plan_database. Required unless planPayload and planPayloadHash are provided.'),
  planPayload: { type: 'object', additionalProperties: true, description: 'Exact plan payload reviewed for approval. Required when using planPayloadHash without a planId.' },
  planPayloadHash: stringSchema('sha256 hash of the exact approved plan payload. Required when planPayload is supplied directly; optional with planId and verified if present.'),
  confirmedByUser: approvalBooleanSchema,
  approvalNote: stringSchema('Explicit approval note describing who approved this create operation and which plan/hash was approved.'),
}, ['confirmedByUser', 'approvalNote']);
const digitalOceanCreatePlanParameters = z.object({
  planId: z.string().min(1).optional(),
  planPayload: z.record(z.string(), z.any()).optional(),
  planPayloadHash: z.string().min(1).optional(),
  confirmedByUser: z.boolean(),
  approvalNote: z.string().min(1),
}).refine((value) => Boolean(value.planId || (value.planPayload && value.planPayloadHash)), {
  message: 'Either planId or both planPayload and planPayloadHash are required.',
});

const digitalOceanInfrastructureApprovalSchema = objectSchema({
  resourceName: stringSchema('DigitalOcean resource name targeted by the infrastructure change.'),
  region: stringSchema('DigitalOcean region slug for the targeted resource.'),
  size: stringSchema('DigitalOcean size/plan slug for the targeted resource.'),
  estimatedCost: stringSchema('Estimated monthly/usage cost, or "unavailable" when DigitalOcean pricing cannot be estimated before apply.'),
  dryRunPlan: { type: 'object', additionalProperties: true, description: 'Dry-run/plan output reviewed before applying the infrastructure change.' },
  confirmedByUser: approvalBooleanSchema,
  approvalNote: stringSchema('Explicit approval note describing who approved this infrastructure action and what was approved.'),
  typedConfirmation: stringSchema('Required for delete/destroy: exact typed confirmation such as "delete <resourceName>".'),
  allowDestructiveDelete: { type: 'boolean', description: 'Delete/destroy remains blocked by default; set true only after explicit destructive-action policy approval.' },
}, ['resourceName', 'region', 'size', 'estimatedCost', 'dryRunPlan', 'confirmedByUser', 'approvalNote']);
const digitalOceanInfrastructureApprovalParameters = z.object({
  resourceName: z.string().min(1),
  region: z.string().min(1),
  size: z.string().min(1),
  estimatedCost: z.union([z.string().min(1), z.number()]),
  dryRunPlan: z.any(),
  confirmedByUser: z.boolean(),
  approvalNote: z.string().min(1),
  typedConfirmation: z.string().optional(),
  allowDestructiveDelete: z.boolean().optional(),
});

function databankProviderStatus() {
  const tokenPresent = Boolean((process.env.DATABANK_API_TOKEN || process.env.DATABANK_TOKEN || '').trim());

  return {
    ok: true,
    provider: 'databank',
    status: tokenPresent ? 'configured' : 'provider_not_configured',
    configured: tokenPresent,
    tokenPresent,
    authSource: tokenPresent ? 'env' : 'missing',
    envVariables: ['DATABANK_API_TOKEN', 'DATABANK_TOKEN'],
  };
}

async function digitalOceanStatus() {
  const status = digitalOceanProviderStatus();

  return {
    ok: true,
    ...status,
    status: status.tokenPresent ? 'configured' : 'provider_not_configured',
    authSource: status.tokenPresent ? 'env' : 'missing',
    envVariables: ['DIGITALOCEAN_API_TOKEN', 'DO_API_TOKEN'],
  };
}

async function listDigitalOceanAppsTool(input: Record<string, unknown>) {
  const status = digitalOceanProviderStatus();
  if (!status.configured) {
    return {
      ok: false,
      provider: 'digitalocean',
      configured: false,
      apps: [],
      message: 'DigitalOcean API token is not configured. Set DIGITALOCEAN_API_TOKEN or DO_API_TOKEN to enable app reads.',
    };
  }

  return listDigitalOceanApps({ page: input.page as number | undefined, perPage: input.perPage as number | undefined });
}

async function listDigitalOceanDatabasesTool(input: Record<string, unknown>) {
  const status = digitalOceanProviderStatus();
  if (!status.configured) {
    return {
      ok: false,
      provider: 'digitalocean',
      configured: false,
      databases: [],
      message: 'DigitalOcean API token is not configured. Set DIGITALOCEAN_API_TOKEN or DO_API_TOKEN to enable database reads.',
    };
  }

  return listDigitalOceanDatabases({ page: input.page as number | undefined, perPage: input.perPage as number | undefined });
}


function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function estimateDigitalOceanAppCost(spec: Record<string, unknown>) {
  const components = [
    ...arrayField(spec.services),
    ...arrayField(spec.static_sites),
    ...arrayField(spec.workers),
    ...arrayField(spec.jobs),
  ].map(asRecord);
  const componentEstimates = components.map((component) => {
    const instanceSizeSlug = compactString(component.instance_size_slug) || (arrayField(spec.static_sites).includes(component) ? 'static-site' : 'basic-xxs');
    const instanceCount = typeof component.instance_count === 'number' ? component.instance_count : 1;
    const monthlyBySlug: Record<string, number> = {
      'static-site': 0,
      'basic-xxs': 5,
      'basic-xs': 10,
      'basic-s': 20,
      'basic-m': 40,
      'professional-xs': 12,
      'professional-s': 25,
      'professional-m': 50,
      'professional-1l': 100,
    };
    const unitMonthlyUsd = monthlyBySlug[instanceSizeSlug];
    return {
      name: compactString(component.name) || 'unnamed-component',
      type: arrayField(spec.static_sites).includes(component) ? 'static_site' : 'component',
      resourceClass: instanceSizeSlug,
      instanceCount,
      estimatedMonthlyUsd: typeof unitMonthlyUsd === 'number' ? unitMonthlyUsd * instanceCount : null,
      estimateAvailable: typeof unitMonthlyUsd === 'number',
    };
  });
  const knownTotal = componentEstimates.reduce((sum, item) => sum + (typeof item.estimatedMonthlyUsd === 'number' ? item.estimatedMonthlyUsd : 0), 0);
  const hasUnavailable = componentEstimates.some((item) => !item.estimateAvailable);
  return { currency: 'USD', estimatedMonthlyUsd: hasUnavailable ? null : knownTotal, components: componentEstimates, notes: ['Estimates are best-effort static resource-class estimates and exclude bandwidth, build minutes, add-ons, taxes, credits, and future DigitalOcean price changes.'] };
}

function estimateDigitalOceanDatabaseCost(spec: Record<string, unknown>) {
  const size = compactString(spec.size);
  const numNodes = typeof spec.num_nodes === 'number' ? spec.num_nodes : typeof spec.numNodes === 'number' ? spec.numNodes : 1;
  const monthlyBySize: Record<string, number> = {
    'db-s-1vcpu-1gb': 15,
    'db-s-1vcpu-2gb': 30,
    'db-s-2vcpu-4gb': 60,
    'db-s-4vcpu-8gb': 120,
    'db-s-6vcpu-16gb': 240,
    'db-s-8vcpu-32gb': 480,
  };
  const unitMonthlyUsd = monthlyBySize[size];
  return { currency: 'USD', resourceClass: size || null, numNodes, estimatedMonthlyUsd: typeof unitMonthlyUsd === 'number' ? unitMonthlyUsd * numNodes : null, estimateAvailable: typeof unitMonthlyUsd === 'number', notes: ['Estimates are best-effort static size estimates and exclude backups beyond included allocation, bandwidth, taxes, credits, and future DigitalOcean price changes.'] };
}

async function planDigitalOceanApp(input: Record<string, unknown>) {
  const spec = asRecord(input.spec);
  const components = [...arrayField(spec.services), ...arrayField(spec.static_sites), ...arrayField(spec.workers), ...arrayField(spec.jobs)];
  const missing = [];
  if (!compactString(spec.name)) missing.push('spec.name');
  if (!compactString(spec.region)) missing.push('spec.region');
  if (components.length === 0) missing.push('spec.services/static_sites/workers/jobs');
  const valid = missing.length === 0;
  return {
    ok: valid,
    provider: 'digitalocean',
    action: 'plan_app',
    mutates: false,
    status: valid ? 'planned' : 'validation_failed',
    validation: { valid, missingRequiredFields: missing },
    plan: {
      resourceType: 'app',
      operation: 'plan_only',
      desiredSpec: spec,
      resourceName: compactString(spec.name) || null,
      region: compactString(spec.region) || null,
      costEstimate: estimateDigitalOceanAppCost(spec),
      changes: ['Validate desired App Platform spec.', 'Estimate known component resource classes where a static estimate is available.', 'No DigitalOcean API create/update/delete request will be made.'],
    },
    risks: ['Creating or updating this app later may incur monthly/usage charges.', 'App deployments can expose services publicly, trigger builds, and consume runtime resources.', 'Environment variables, domains, databases, and component sizing should be reviewed before apply.'],
    requiredApprovals: ['Explicit human approval is required before any create/update/apply operation.', 'Approval should include reviewed spec, target region, resource classes, and estimated cost or unavailable-cost acknowledgement.'],
  };
}

async function planDigitalOceanDatabase(input: Record<string, unknown>) {
  const spec = asRecord(input.spec);
  const numNodes = typeof spec.num_nodes === 'number' ? spec.num_nodes : typeof spec.numNodes === 'number' ? spec.numNodes : undefined;
  const missing = [];
  if (!compactString(spec.name)) missing.push('spec.name');
  if (!compactString(spec.engine)) missing.push('spec.engine');
  if (!compactString(spec.region)) missing.push('spec.region');
  if (!compactString(spec.size)) missing.push('spec.size');
  if (typeof numNodes !== 'number') missing.push('spec.num_nodes');
  const valid = missing.length === 0;
  return {
    ok: valid,
    provider: 'digitalocean',
    action: 'plan_database',
    mutates: false,
    status: valid ? 'planned' : 'validation_failed',
    validation: { valid, missingRequiredFields: missing },
    plan: {
      resourceType: 'database',
      operation: 'plan_only',
      desiredSpec: spec,
      resourceName: compactString(spec.name) || null,
      engine: compactString(spec.engine) || null,
      region: compactString(spec.region) || null,
      size: compactString(spec.size) || null,
      numNodes: numNodes ?? null,
      costEstimate: estimateDigitalOceanDatabaseCost(spec),
      changes: ['Validate desired managed database spec.', 'Estimate known database size class cost where a static estimate is available.', 'No DigitalOcean API create/update/delete request will be made.'],
    },
    risks: ['Creating or resizing this database later may incur monthly charges.', 'Database engine/version, region, node count, VPC access, backups, and maintenance windows should be reviewed before apply.', 'Incorrect sizing can affect performance, availability, and cost.'],
    requiredApprovals: ['Explicit human approval is required before any create/update/apply operation.', 'Approval should include reviewed spec, target region, engine/version, node count, size, and estimated cost or unavailable-cost acknowledgement.'],
  };
}


function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

function sha256Payload(value: unknown) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

async function resolveDigitalOceanApprovedPlan(input: Record<string, unknown>, expectedType: 'app' | 'database') {
  let planPayload = input.planPayload as Record<string, unknown> | undefined;
  const planId = compactString(input.planId);
  const suppliedHash = compactString(input.planPayloadHash);

  if (planId) {
    const planRecord = await getExecutionRecord(planId);
    if (!planRecord) {
      return { ok: false, status: 'plan_not_found', message: `DigitalOcean plan execution record was not found: ${planId}` };
    }
    const result = asRecord(planRecord.executionResult);
    if (result.provider !== 'digitalocean' || result.status !== 'planned') {
      return { ok: false, status: 'invalid_plan_record', message: 'Plan ID must reference a successful DigitalOcean dry-run plan execution receipt.' };
    }
    planPayload = asRecord(result.plan);
  }

  if (!planPayload || Object.keys(planPayload).length === 0) {
    return { ok: false, status: 'plan_payload_required', message: 'A planId or exact planPayload is required before DigitalOcean create can run.' };
  }

  const actualHash = sha256Payload(planPayload);
  if (suppliedHash && suppliedHash !== actualHash) {
    return { ok: false, status: 'plan_payload_changed', message: 'The DigitalOcean plan payload hash does not match the approved hash; refusing to create resources.', suppliedHash, actualHash };
  }
  if (!planId && !suppliedHash) {
    return { ok: false, status: 'plan_payload_hash_required', message: 'An exact planPayloadHash is required when no planId is supplied.' };
  }

  if (planPayload.resourceType !== expectedType) {
    return { ok: false, status: 'wrong_plan_type', message: `Expected a DigitalOcean ${expectedType} plan, but received ${String(planPayload.resourceType || 'unknown')}.`, actualHash };
  }

  const desiredSpec = asRecord(planPayload.desiredSpec);
  if (Object.keys(desiredSpec).length === 0) {
    return { ok: false, status: 'missing_desired_spec', message: 'The approved plan payload does not include desiredSpec.', actualHash };
  }

  return { ok: true, planId: planId || null, planPayload, planPayloadHash: actualHash, desiredSpec };
}

function digitalOceanRollbackNotes(resourceType: 'app' | 'database', resourceId: string | null) {
  return [
    `No delete or destroy operation was performed by this tool.`,
    resourceId
      ? `If rollback is required, review the created ${resourceType} (${resourceId}) in DigitalOcean and use a separate approved rollback workflow; this task intentionally does not delete resources.`
      : `If creation partially succeeded, inspect DigitalOcean before taking any rollback action; deletion/destruction is outside this tool's scope.`,
  ];
}

async function createDigitalOceanAppTool(input: Record<string, unknown>) {
  const status = digitalOceanProviderStatus();
  if (!status.configured) {
    return { ok: false, provider: 'digitalocean', status: 'not_configured', message: 'DigitalOcean API token is not configured. Set DIGITALOCEAN_API_TOKEN or DO_API_TOKEN to create apps.' };
  }
  const resolved = await resolveDigitalOceanApprovedPlan(input, 'app');
  if (!resolved.ok) return { provider: 'digitalocean', ...resolved };
  const desiredSpec = resolved.desiredSpec as Record<string, unknown>;
  const providerResult = await createDigitalOceanApp(desiredSpec);
  return {
    ok: true,
    provider: 'digitalocean',
    action: 'create_app',
    status: 'created',
    planId: resolved.planId,
    planPayloadHash: resolved.planPayloadHash,
    resourceId: providerResult.resourceId,
    providerResponseSummary: providerResult.responseSummary,
    rollbackNotes: digitalOceanRollbackNotes('app', providerResult.resourceId),
  };
}

async function createDigitalOceanDatabaseTool(input: Record<string, unknown>) {
  const status = digitalOceanProviderStatus();
  if (!status.configured) {
    return { ok: false, provider: 'digitalocean', status: 'not_configured', message: 'DigitalOcean API token is not configured. Set DIGITALOCEAN_API_TOKEN or DO_API_TOKEN to create databases.' };
  }
  const resolved = await resolveDigitalOceanApprovedPlan(input, 'database');
  if (!resolved.ok) return { provider: 'digitalocean', ...resolved };
  const desiredSpec = resolved.desiredSpec as Record<string, unknown>;
  const providerResult = await createDigitalOceanDatabase(desiredSpec);
  return {
    ok: true,
    provider: 'digitalocean',
    action: 'create_database',
    status: 'created',
    planId: resolved.planId,
    planPayloadHash: resolved.planPayloadHash,
    resourceId: providerResult.resourceId,
    providerResponseSummary: providerResult.responseSummary,
    rollbackNotes: digitalOceanRollbackNotes('database', providerResult.resourceId),
  };
}

async function digitalOceanInfrastructureWriteTool(input: Record<string, unknown>, operation: 'create' | 'update' | 'delete') {
  const approvalBlock = requireDigitalOceanInfrastructureApproval({
    operation,
    resourceName: input.resourceName as string | undefined,
    region: input.region as string | undefined,
    size: input.size as string | undefined,
    estimatedCost: input.estimatedCost as string | number | null | undefined,
    dryRunPlan: input.dryRunPlan as string | Record<string, unknown> | Array<unknown> | undefined,
    confirmedByUser: input.confirmedByUser as boolean | undefined,
    approvalNote: input.approvalNote as string | undefined,
    typedConfirmation: input.typedConfirmation as string | undefined,
    allowDestructiveDelete: input.allowDestructiveDelete as boolean | undefined,
  });
  if (approvalBlock) return approvalBlock;

  return {
    ok: false,
    provider: 'digitalocean',
    status: 'provider_write_not_implemented',
    operation,
    message: 'DigitalOcean infrastructure writes are registered as high-risk purchase/commit actions, but the apply adapter is not implemented yet.',
  };
}

async function draftOutreachEmail(input: Record<string, unknown>) {
  const lead = (input.lead && typeof input.lead === 'object' ? input.lead : {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  const contactName = compactString(input.contactName) || compactString(lead.fullName);
  const company = compactString(input.company) || compactString(lead.company);
  const contactEmail = compactString(input.contactEmail) || compactString(lead.email);
  const subject = compactString(input.subject) || (company ? `Quick question for ${company}` : 'Quick question');
  const body = compactString(input.body) || [
    contactName ? `Hi ${contactName},` : 'Hi,',
    '',
    compactString(input.valueProposition) || 'I noticed a few opportunities to tighten lead follow-up and reduce missed conversations.',
    compactString(input.callToAction) || 'Would it be worth a brief conversation to compare notes?',
  ].join('\n');

  return {
    ok: true,
    status: 'draft',
    workflow: 'outreach',
    draft: {
      id: randomUUID(),
      leadId: compactString(input.leadId) || compactString(lead.id) || undefined,
      contactEmail,
      contactName,
      company,
      subject,
      body,
      callToAction: compactString(input.callToAction),
      status: 'ready_for_approval',
      createdAt: now,
      updatedAt: now,
      metadata: { source: 'outreach.draft_email', ...(input.metadata as Record<string, unknown> | undefined) },
    },
  };
}


function socialPlatform(value: unknown): SocialPlatform {
  return (compactString(value) || 'linkedin') as SocialPlatform;
}

async function draftSocialContentIdea(input: Record<string, unknown>) {
  const now = new Date().toISOString();
  const platform = socialPlatform(input.platform);
  const topic = compactString(input.topic) || compactString(input.title) || 'Social selling insight';
  const targetAudience = compactString(input.targetAudience) || 'qualified prospects';
  const angle = compactString(input.angle) || `Share a practical, buyer-centered perspective for ${targetAudience}.`;
  const callToAction = compactString(input.callToAction) || 'Invite readers to compare notes without pressure.';

  return {
    ok: true,
    status: 'draft',
    workflow: 'social',
    internalOnly: true,
    externalSend: false,
    contentIdea: {
      id: compactString(input.ideaId) || `social_content_idea_${randomUUID()}`,
      platform,
      title: compactString(input.title) || topic,
      angle,
      targetAudience,
      bodyOutline: compactString(input.bodyOutline) || [
        `Hook: name the ${topic} problem in plain language.`,
        'Context: explain the operational cost or missed opportunity.',
        'Value: share one useful diagnostic or next-step idea.',
        `CTA: ${callToAction}`,
      ].join('\n'),
      callToAction,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      metadata: { source: 'social.draft_content_idea', internalOnly: true, externalSend: false, ...(input.metadata as Record<string, unknown> | undefined) },
    },
    guardrails: SOCIAL_DRAFT_GUARDRAILS,
  };
}

const SOCIAL_DRAFT_GUARDRAILS = [
  'Draft only; do not post, send, or automate platform actions.',
  'Human review is required before any social content or DM is used externally.',
  'Respect opt-outs and platform terms; do not scrape or impersonate a human.',
];

async function draftSocialDm(input: Record<string, unknown>) {
  const now = new Date().toISOString();
  const prospect = (input.prospect && typeof input.prospect === 'object' ? input.prospect : {}) as Partial<SocialProspect> & Record<string, unknown>;
  const platform = socialPlatform(input.platform ?? prospect.platform);
  const displayName = compactString(input.displayName) || compactString(prospect.displayName);
  const relationshipContext = compactString(input.relationshipContext) || compactString(prospect.relationshipContext);
  const message = compactString(input.message) || [
    displayName ? `Hi ${displayName},` : 'Hi,',
    relationshipContext ? `I noticed ${relationshipContext}.` : 'I noticed your work and wanted to connect around improving lead follow-up without adding manual busywork.',
    compactString(input.callToAction) || 'Open to comparing notes? No pressure either way.',
  ].join(' ');

  return {
    ok: true,
    status: 'draft',
    workflow: 'social',
    internalOnly: true,
    externalSend: false,
    dmDraft: {
      id: compactString(input.draftId) || `social_dm_${randomUUID()}`,
      prospectId: compactString(input.prospectId) || compactString(prospect.id) || `prospect_${randomUUID()}`,
      platform,
      profileUrl: compactString(input.profileUrl) || compactString(prospect.profileUrl),
      message,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      metadata: { source: 'social.draft_dm', internalOnly: true, externalSend: false, ...(input.metadata as Record<string, unknown> | undefined) },
    },
    guardrails: SOCIAL_DRAFT_GUARDRAILS,
  };
}

function socialReplyClass(replyText: string) {
  const lower = replyText.toLowerCase();
  if (/\b(stop|unsubscribe|do not contact|don't contact|remove me)\b/i.test(lower)) return 'opt_out_do_not_contact';
  if (/\b(price|pricing|cost|rate|budget)\b/i.test(lower)) return 'asks_for_pricing';
  if (/\b(details|info|information|tell me more|learn more)\b/i.test(lower)) return 'asks_for_details';
  if (/\b(not interested|no thanks|not a fit)\b/i.test(lower)) return 'not_interested';
  if (/\b(later|next week|next month|follow up|check back)\b/i.test(lower)) return 'needs_follow_up_later';
  if (/\b(wrong person|not my role)\b/i.test(lower)) return 'wrong_person';
  if (/\b(interested|sounds good|let's talk|book|call)\b/i.test(lower)) return 'interested';
  return 'objection';
}

async function classifySocialReply(input: Record<string, unknown>) {
  const replyText = compactString(input.replyText);
  const replyClass = socialReplyClass(replyText);
  const platform = socialPlatform(input.platform);
  const classification: SocialReplyClassification = {
    id: compactString(input.classificationId) || `social_reply_${randomUUID()}`,
    prospectId: compactString(input.prospectId),
    receiptId: compactString(input.receiptId),
    platform,
    replyClass,
    confidence: 0.72,
    summary: compactString(input.summary) || `Inbound ${platform} reply classified as ${replyClass}.`,
    nextAction: nextSocialAction(replyClass),
    classifiedAt: compactString(input.receivedAt) || new Date().toISOString(),
    classifiedBy: compactString(input.classifiedBy) || 'social.classify_reply',
    metadata: { source: 'social.classify_reply', internalOnly: true, externalSend: false, ...(input.metadata as Record<string, unknown> | undefined) },
  };
  return { ok: true, status: 'classified', workflow: 'social', internalOnly: true, externalSend: false, classification };
}

function nextSocialAction(replyClass: string) {
  const actions: Record<string, string> = {
    interested: 'Prepare a human-reviewed response or booking next step; do not send automatically.',
    asks_for_details: 'Draft a concise detail response for human review.',
    asks_for_pricing: 'Route to Jordan for pricing context before drafting any reply.',
    not_interested: 'Mark not interested and avoid further sales follow-up unless reopened by a human.',
    opt_out_do_not_contact: 'Record do-not-contact status and suppress future follow-up.',
    needs_follow_up_later: 'Recommend an internal reminder for the requested timeframe; future sends require approval.',
    wrong_person: 'Ask a human to verify whether a better contact was offered before any reply.',
    spam_or_abuse: 'Do not respond; escalate for review if needed.',
    objection: 'Draft an empathetic, non-pressuring response for human review.',
  };
  return actions[replyClass] || actions.objection;
}

async function recommendSocialFollowUp(input: Record<string, unknown>) {
  const classification = (input.replyClassification && typeof input.replyClassification === 'object' ? input.replyClassification : {}) as Partial<SocialReplyClassification> & Record<string, unknown>;
  const replyClass = compactString(input.replyClass) || compactString(classification.replyClass) || 'objection';
  const now = new Date().toISOString();
  return {
    ok: true,
    status: 'draft',
    workflow: 'social',
    internalOnly: true,
    externalSend: false,
    recommendation: {
      id: compactString(input.recommendationId) || `social_follow_up_${randomUUID()}`,
      prospectId: compactString(input.prospectId) || compactString(classification.prospectId),
      platform: socialPlatform(input.platform ?? classification.platform),
      replyClassificationId: compactString(input.replyClassificationId) || compactString(classification.id),
      recommendedAction: compactString(input.recommendedAction) || nextSocialAction(replyClass),
      suggestedTiming: compactString(input.suggestedTiming) || (replyClass === 'needs_follow_up_later' ? 'Use the timeframe requested by the prospect.' : 'Human review before any response.'),
      draftReply: compactString(input.draftReply),
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      metadata: { source: 'social.recommend_follow_up', internalOnly: true, externalSend: false, ...(input.metadata as Record<string, unknown> | undefined) },
    },
    guardrails: SOCIAL_DRAFT_GUARDRAILS,
  };
}

async function createOfferImprovementNotes(input: Record<string, unknown>) {
  const report = input.callInsightReport && typeof input.callInsightReport === 'object'
    ? (input.callInsightReport as Record<string, unknown>)
    : input.callTranscript
      ? (createCallInsightReport({
          callTranscript: input.callTranscript as any,
          prospectContext: input.prospectContext as any,
          offerProposalContext: (input.offerProposalContext ?? input.offer) as any,
          createdAt: input.createdAt as any,
        }) as unknown as Record<string, unknown>)
      : {};
  const now = new Date().toISOString();
  const proposalImprovementNotes = Array.isArray(report.proposalImprovementNotes) ? report.proposalImprovementNotes : [];
  const offerClarityGaps = Array.isArray(report.offerClarityGaps) ? report.offerClarityGaps : [];
  const reframeSuggestions = Array.isArray(report.reframeSuggestions) ? report.reframeSuggestions : [];

  return {
    ok: true,
    status: 'draft',
    workflow: 'objection',
    internalOnly: true,
    externalSend: false,
    notes: {
      id: compactString(input.notesId) || `offer_improvement_notes_${randomUUID()}`,
      createdAt: now,
      callInsightReportId: compactString(report.id),
      leadId: compactString(report.leadId),
      clientId: compactString(report.clientId),
      proposalId: compactString(report.proposalId),
      proposalImprovementNotes,
      offerClarityGaps,
      reframeSuggestions,
      guardrails: [
        'Internal draft only; do not send externally.',
        'Jordan must review and approve any client-facing proposal, offer, or follow-up language.',
        'Preserve buyer autonomy and avoid pressure, false urgency, or assumptive-close language.',
      ],
      metadata: { source: 'objection.create_offer_improvement_notes', internalOnly: true, ...(input.metadata as Record<string, unknown> | undefined) },
    },
  };
}

async function approveOutreachSend(input: Record<string, unknown>) {
  const draft = (input.draft && typeof input.draft === 'object' ? input.draft : {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  const contactEmail = compactString(draft.contactEmail);
  const to = Array.isArray(input.to) && input.to.length ? input.to : contactEmail ? [contactEmail] : [];

  return {
    ok: true,
    status: 'approved',
    workflow: 'outreach',
    sendRequest: {
      id: randomUUID(),
      draftId: compactString(draft.id) || compactString(input.draftId) || randomUUID(),
      approvedBy: compactString(input.approvedBy) || 'human',
      approvedAt: now,
      to,
      cc: Array.isArray(input.cc) ? input.cc : [],
      bcc: Array.isArray(input.bcc) ? input.bcc : [],
      subject: compactString(input.subject) || compactString(draft.subject),
      body: compactString(input.body) || compactString(draft.body),
      scheduledFor: compactString(input.scheduledFor) || undefined,
      approvalNote: compactString(input.approvalNote) || undefined,
      metadata: { source: 'outreach.approve_send', ...(input.metadata as Record<string, unknown> | undefined) },
    },
  };
}

function compactString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function qualificationTimestamp(value: unknown) {
  const text = compactString(value);
  return text ? new Date(text).toISOString() : new Date().toISOString();
}

function stableQualificationId(input: Record<string, unknown>) {
  const serialized = JSON.stringify(input);
  let hash = 0;
  for (let index = 0; index < serialized.length; index += 1) {
    hash = (hash * 31 + serialized.charCodeAt(index)) >>> 0;
  }
  return `qualification_${hash.toString(16).padStart(8, '0')}`;
}

function createQualificationMemoryText(record: QualificationRecord) {
  return [
    `Qualification record ${record.id} created for lead ${record.leadId}.`,
    `Source: ${record.source}.`,
    `Monthly lead volume: ${record.monthlyLeadVolume}.`,
    `Missed calls/messages: ${record.missedCallsMessages}.`,
    `Average customer value: $${record.averageJobCustomerValue}.`,
    `Close rate: ${record.closeRate}%.`,
    record.desired30DayImprovement ? `Desired 30-day improvement: ${record.desired30DayImprovement}.` : undefined,
  ]
    .filter(Boolean)
    .join(' ');
}

function createProposalReviewScript(input: Record<string, unknown>) {
  const proposal = ProposalRecordSchema.parse(input.proposal);
  const reviewCall = input.reviewCall && typeof input.reviewCall === 'object' ? (input.reviewCall as Record<string, unknown>) : {};
  const opener =
    compactString(input.opener) ||
    'I prepared the proposal and would like to walk you through it so we can confirm fit, scope, and next steps together.';
  const agenda = Array.isArray(reviewCall.agenda) && reviewCall.agenda.length
    ? reviewCall.agenda.map((item) => compactString(item)).filter(Boolean)
    : proposal.reviewCallAgenda.length
      ? proposal.reviewCallAgenda
      : [
          'Confirm the current pain and desired outcome in the prospect’s words.',
          'Walk through the recommended solution and first 30-day plan.',
          'Review scope, timeline, pricing, and open questions.',
          'Agree on the safest next step after Jordan review.',
        ];
  const unresolvedQuestions = proposal.unresolvedQuestions.length
    ? proposal.unresolvedQuestions
    : Array.isArray(reviewCall.unresolvedQuestions)
      ? reviewCall.unresolvedQuestions.map((item) => compactString(item)).filter(Boolean)
      : [];

  return {
    ok: true,
    status: 'created',
    workflow: 'proposal',
    reviewRequiredBy: 'Jordan',
    externalSend: false,
    script: {
      id: compactString(input.scriptId) || `proposal_review_script_${proposal.id}`,
      proposalId: proposal.id,
      title: `Review call script: ${proposal.title || proposal.id}`,
      opener,
      agenda,
      discoveryPrompts: [
        proposal.painSummaryInProspectLanguage ? `When you think about "${proposal.painSummaryInProspectLanguage}", what feels most urgent to fix first?` : 'What feels most urgent to fix first?',
        proposal.desiredOutcome ? `If we delivered ${proposal.desiredOutcome}, what would change operationally?` : 'What would make this engagement a clear win?',
        'Who else needs to be involved before we finalize scope and timing?',
      ],
      scopeWalkthrough: [
        proposal.recommendedSolution,
        proposal.first30DayPlan,
        ...proposal.implementationScope,
      ].filter(Boolean),
      objectionPrep: [
        'If timing is the concern, isolate the smallest approved first step.',
        'If price is the concern, reconnect scope to the cost of inaction and confirm budget comfort.',
        'If access or implementation capacity is the concern, park the item for Jordan review before promising delivery.',
      ],
      close: 'The best next step is to confirm what you want adjusted, then Jordan can approve the final client-facing version before anything is sent externally.',
      unresolvedQuestions,
      guardrails: [
        'Do not send the full proposal externally from this script.',
        'Use the approved walkthrough message rather than a full-proposal email as the main close.',
        'Jordan must approve final client-facing proposal language and any Google Calendar scheduling.',
      ],
      metadata: { source: 'proposal.create_review_script', internalOnly: true, ...(input.metadata as Record<string, unknown> | undefined) },
    },
  };
}

function createClientProject(input: Record<string, unknown>) {
  const now = new Date().toISOString();
  const clientId = compactString(input.clientId) || `client_${randomUUID()}`;
  const projectId = compactString(input.projectId) || `project_${randomUUID()}`;
  const sharedFields = {
    createdAt: compactString(input.createdAt) || now,
    updatedAt: compactString(input.updatedAt) || compactString(input.createdAt) || now,
    status: compactString(input.status) || 'active',
    sourceLeadId: compactString(input.leadId) || compactString(input.sourceLeadId),
    sourceProposalId: compactString(input.proposalId) || compactString(input.sourceProposalId),
    closeDate: compactString(input.closeDate) || undefined,
    emotionalState: compactString(input.emotionalState),
    confidence: typeof input.confidence === 'number' ? input.confidence : undefined,
    concerns: Array.isArray(input.concerns) ? input.concerns : [],
    kickoffStatus: compactString(input.kickoffStatus) || 'ready_for_kickoff',
    assignedSpecialist: compactString(input.assignedSpecialist),
    firstWinTarget: compactString(input.firstWinTarget),
    notes: compactString(input.notes),
    metadata: { internalOnly: true, externalSend: false, ...(input.metadata as Record<string, unknown> | undefined) },
  };

  const clientRecord = ClientRecordSchema.parse({
    id: clientId,
    ...sharedFields,
    leadId: compactString(input.leadId),
    sessionId: compactString(input.sessionId),
    name: compactString(input.clientName),
    email: compactString(input.clientEmail),
    company: compactString(input.company),
    tags: Array.isArray(input.tags) ? input.tags : ['client-project'],
  });
  const projectRecord = ProjectRecordSchema.parse({
    id: projectId,
    ...sharedFields,
    clientId,
    name: compactString(input.projectName) || compactString(input.company) || `Project ${projectId}`,
  });

  return { ok: true, status: 'created', workflow: 'closing', internalOnly: true, externalSend: false, clientRecord, projectRecord };
}

export const toolRegistry: RegisteredToolDefinition[] = [
  {
    name: 'web.fetch_url',
    description: 'Fetch a single HTTP(S) URL as a general CORE web tool. Enforces configured byte and timeout limits, follows redirects, and returns text plus receipt-friendly metadata.',
    inputSchema: objectSchema({ url: stringSchema('HTTP(S) URL to fetch.'), timeoutMs: numberSchema('Optional timeout in milliseconds; capped by WEB_FETCH_TIMEOUT_MS.', { minimum: 250 }), maxBytes: numberSchema('Optional response byte cap; capped by WEB_FETCH_MAX_BYTES.', { minimum: 1 }) }, ['url']),
    parameters: z.object({ url: z.string().url(), timeoutMs: z.number().int().min(250).optional(), maxBytes: z.number().int().min(1).optional() }),
    scopes: ['web.fetch.read'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'web',
      action: 'fetch_url',
      resourceType: 'web_url',
      resourceIdField: 'url',
      sensitiveFields: ['url'],
      logEvents: ['tool.web.fetch_url.requested', 'tool.web.fetch_url.completed'],
    },
    executor: async (input) => webFetchUrl(input as any),
  },
  {
    name: 'web.crawl_site',
    description: 'Crawl same-origin HTTP(S) pages starting from a URL as a general CORE web tool. Enforces configured page, depth, byte, and timeout limits.',
    inputSchema: objectSchema({ url: stringSchema('HTTP(S) URL to start from.'), maxPages: numberSchema('Optional page cap; capped by WEB_CRAWL_MAX_PAGES.', { minimum: 1 }), maxDepth: numberSchema('Optional depth cap; capped by WEB_CRAWL_MAX_DEPTH.', { minimum: 0 }), timeoutMs: numberSchema('Optional per-request timeout in milliseconds; capped by WEB_FETCH_TIMEOUT_MS.', { minimum: 250 }), maxBytes: numberSchema('Optional per-page response byte cap; capped by WEB_FETCH_MAX_BYTES.', { minimum: 1 }) }, ['url']),
    parameters: z.object({ url: z.string().url(), maxPages: z.number().int().min(1).optional(), maxDepth: z.number().int().min(0).optional(), timeoutMs: z.number().int().min(250).optional(), maxBytes: z.number().int().min(1).optional() }),
    scopes: ['web.crawl.read'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'web',
      action: 'crawl_site',
      resourceType: 'web_site',
      resourceIdField: 'url',
      sensitiveFields: ['url'],
      logEvents: ['tool.web.crawl_site.requested', 'tool.web.crawl_site.completed'],
    },
    executor: async (input) => webCrawlSite(input as any),
  },
  {
    name: 'digitalocean.status',
    description: 'Report whether the DigitalOcean provider is configured from environment variables without returning provider tokens.',
    inputSchema: objectSchema({}),
    parameters: z.object({}),
    scopes: ['digitalocean.status.read'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'digitalocean',
      action: 'status',
      resourceType: 'digitalocean_provider_status',
      logEvents: ['tool.digitalocean.status.requested', 'tool.digitalocean.status.completed'],
    },
    executor: digitalOceanStatus,
  },
  {
    name: 'digitalocean.list_apps',
    description: 'List DigitalOcean App Platform apps using a provider token sourced only from environment variables. Tokens are never returned.',
    inputSchema: digitalOceanListSchema,
    parameters: digitalOceanListParameters,
    scopes: ['digitalocean.apps.read'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'digitalocean',
      action: 'list_apps',
      resourceType: 'digitalocean_app',
      sensitiveFields: ['page', 'perPage'],
      logEvents: ['tool.digitalocean.list_apps.requested', 'tool.digitalocean.list_apps.completed'],
    },
    executor: listDigitalOceanAppsTool,
  },
  {
    name: 'digitalocean.list_databases',
    description: 'List DigitalOcean managed databases using a provider token sourced only from environment variables. Tokens are never returned.',
    inputSchema: digitalOceanListSchema,
    parameters: digitalOceanListParameters,
    scopes: ['digitalocean.databases.read'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'digitalocean',
      action: 'list_databases',
      resourceType: 'digitalocean_database',
      sensitiveFields: ['page', 'perPage'],
      logEvents: ['tool.digitalocean.list_databases.requested', 'tool.digitalocean.list_databases.completed'],
    },
    executor: listDigitalOceanDatabasesTool,
  },
  {
    name: 'digitalocean.plan_app',
    description: 'Validate and return a plan-only DigitalOcean App Platform app proposal from a desired spec. This never creates, updates, deletes, deploys, or calls an external create API.',
    inputSchema: digitalOceanPlanAppSchema,
    parameters: digitalOceanPlanAppParameters,
    scopes: ['digitalocean.apps.plan'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'digitalocean',
      action: 'plan_app',
      resourceType: 'digitalocean_app_plan',
      sensitiveFields: ['spec'],
      logEvents: ['tool.digitalocean.plan_app.requested', 'tool.digitalocean.plan_app.completed'],
    },
    executor: planDigitalOceanApp,
  },
  {
    name: 'digitalocean.plan_database',
    description: 'Validate and return a plan-only DigitalOcean managed database proposal from a desired spec. This never creates, updates, deletes, resizes, or calls an external create API.',
    inputSchema: digitalOceanPlanDatabaseSchema,
    parameters: digitalOceanPlanDatabaseParameters,
    scopes: ['digitalocean.databases.plan'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'digitalocean',
      action: 'plan_database',
      resourceType: 'digitalocean_database_plan',
      sensitiveFields: ['spec'],
      logEvents: ['tool.digitalocean.plan_database.requested', 'tool.digitalocean.plan_database.completed'],
    },
    executor: planDigitalOceanDatabase,
  },
  {
    name: 'digitalocean.create_app',
    description: 'Create a DigitalOcean App Platform app only after explicit approval of an unchanged dry-run plan payload or plan execution receipt. Writes an execution receipt with resource ID, provider response summary, and non-destructive rollback notes.',
    inputSchema: digitalOceanCreatePlanSchema,
    parameters: digitalOceanCreatePlanParameters,
    scopes: ['digitalocean.apps.write'],
    riskLevel: 'purchase_or_commit',
    humanApprovalRequired: true,
    audit: {
      category: 'digitalocean',
      action: 'create_app',
      resourceType: 'digitalocean_app',
      resourceIdField: 'resourceId',
      sensitiveFields: ['approvalNote', 'planPayload'],
      logEvents: ['tool.digitalocean.create_app.approval_requested', 'tool.digitalocean.create_app.completed'],
    },
    executor: createDigitalOceanAppTool,
  },
  {
    name: 'digitalocean.create_database',
    description: 'Create a DigitalOcean managed database only after explicit approval of an unchanged dry-run plan payload or plan execution receipt. Writes an execution receipt with resource ID, provider response summary, and non-destructive rollback notes.',
    inputSchema: digitalOceanCreatePlanSchema,
    parameters: digitalOceanCreatePlanParameters,
    scopes: ['digitalocean.databases.write'],
    riskLevel: 'purchase_or_commit',
    humanApprovalRequired: true,
    audit: {
      category: 'digitalocean',
      action: 'create_database',
      resourceType: 'digitalocean_database',
      resourceIdField: 'resourceId',
      sensitiveFields: ['approvalNote', 'planPayload'],
      logEvents: ['tool.digitalocean.create_database.approval_requested', 'tool.digitalocean.create_database.completed'],
    },
    executor: createDigitalOceanDatabaseTool,
  },
  {
    name: 'digitalocean.create_infrastructure',
    description: 'High-risk DigitalOcean infrastructure create placeholder. Requires explicit approval, resource metadata, cost estimate, and dry-run/plan output before any future apply adapter can run.',
    inputSchema: digitalOceanInfrastructureApprovalSchema,
    parameters: digitalOceanInfrastructureApprovalParameters,
    scopes: ['digitalocean.infrastructure.write'],
    riskLevel: 'purchase_or_commit',
    humanApprovalRequired: true,
    audit: {
      category: 'digitalocean',
      action: 'create_infrastructure',
      resourceType: 'digitalocean_infrastructure',
      resourceIdField: 'resourceName',
      sensitiveFields: ['approvalNote', 'dryRunPlan'],
      logEvents: ['tool.digitalocean.create_infrastructure.approval_requested', 'tool.digitalocean.create_infrastructure.completed'],
    },
    executor: (input) => digitalOceanInfrastructureWriteTool(input, 'create'),
  },
  {
    name: 'digitalocean.update_infrastructure',
    description: 'High-risk DigitalOcean infrastructure update placeholder. Requires explicit approval, resource metadata, cost estimate, and dry-run/plan output before any future apply adapter can run.',
    inputSchema: digitalOceanInfrastructureApprovalSchema,
    parameters: digitalOceanInfrastructureApprovalParameters,
    scopes: ['digitalocean.infrastructure.write'],
    riskLevel: 'purchase_or_commit',
    humanApprovalRequired: true,
    audit: {
      category: 'digitalocean',
      action: 'update_infrastructure',
      resourceType: 'digitalocean_infrastructure',
      resourceIdField: 'resourceName',
      sensitiveFields: ['approvalNote', 'dryRunPlan'],
      logEvents: ['tool.digitalocean.update_infrastructure.approval_requested', 'tool.digitalocean.update_infrastructure.completed'],
    },
    executor: (input) => digitalOceanInfrastructureWriteTool(input, 'update'),
  },
  {
    name: 'digitalocean.delete_infrastructure',
    description: 'High-risk DigitalOcean infrastructure delete placeholder. Destructive delete/destroy is blocked by default and requires typed confirmation plus explicit approval metadata before any future apply adapter can run.',
    inputSchema: digitalOceanInfrastructureApprovalSchema,
    parameters: digitalOceanInfrastructureApprovalParameters,
    scopes: ['digitalocean.infrastructure.delete'],
    riskLevel: 'purchase_or_commit',
    humanApprovalRequired: true,
    audit: {
      category: 'digitalocean',
      action: 'delete_infrastructure',
      resourceType: 'digitalocean_infrastructure',
      resourceIdField: 'resourceName',
      sensitiveFields: ['approvalNote', 'dryRunPlan', 'typedConfirmation'],
      logEvents: ['tool.digitalocean.delete_infrastructure.approval_requested', 'tool.digitalocean.delete_infrastructure.completed'],
    },
    executor: (input) => digitalOceanInfrastructureWriteTool(input, 'delete'),
  },
  {
    name: 'databank.status',
    description: 'Report whether the Databank provider is configured from environment variables without returning provider tokens.',
    inputSchema: objectSchema({}),
    parameters: z.object({}),
    scopes: ['databank.status.read'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'databank',
      action: 'status',
      resourceType: 'databank_provider_status',
      logEvents: ['tool.databank.status.requested', 'tool.databank.status.completed'],
    },
    executor: async () => databankProviderStatus(),
  },
  {
    name: 'calendar.list_events',
    description: 'List calendar events for a time range using the configured calendar provider adapter.',
    inputSchema: objectSchema(
      {
        calendarId: stringSchema('Calendar identifier; defaults to primary when omitted.'),
        timeMin: stringSchema('Inclusive ISO-8601 start time.'),
        timeMax: stringSchema('Exclusive ISO-8601 end time.'),
        maxResults: numberSchema('Maximum number of events to return.', { minimum: 1, maximum: 100 }),
      },
      ['timeMin', 'timeMax'],
    ),
    parameters: z.object({
      calendarId: z.string().default('primary'),
      timeMin: z.string().min(1),
      timeMax: z.string().min(1),
      maxResults: z.number().int().min(1).max(100).default(10),
    }),
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'calendar',
      action: 'list_events',
      resourceType: 'calendar_event',
      resourceIdField: 'calendarId',
      sensitiveFields: ['timeMin', 'timeMax'],
      logEvents: ['tool.calendar.list_events.requested', 'tool.calendar.list_events.completed'],
    },
    executor: listCalendarEvents,
  },
  {
    name: 'calendar.create_event',
    description: 'Create an internal calendar reminder/event through the configured provider. Events with attendees, private data exposure, or external commitments require explicit approval.',
    inputSchema: objectSchema(
      {
        calendarId: stringSchema('Calendar identifier; defaults to primary when omitted.'),
        summary: stringSchema('Event title.'),
        description: stringSchema('Event notes or agenda.'),
        start: stringSchema('ISO-8601 start time.'),
        end: stringSchema('ISO-8601 end time.'),
        attendees: stringArraySchema('Attendee email addresses.'),
        confirmedByUser: approvalBooleanSchema,
        approvalNote: approvalNoteSchema,
      },
      ['summary', 'start', 'end'],
    ),
    parameters: z.object({
      calendarId: z.string().default('primary'),
      summary: z.string().min(1),
      description: z.string().default(''),
      start: z.string().min(1),
      end: z.string().min(1),
      attendees: z.array(z.string().email()).default([]),
      confirmedByUser: z.boolean().default(false),
      approvalNote: z.string().default(''),
    }),
    scopes: ['https://www.googleapis.com/auth/calendar.events'],
    riskLevel: 'write',
    humanApprovalRequired: false,
    audit: {
      category: 'calendar',
      action: 'create_event',
      resourceType: 'calendar_event',
      resourceIdField: 'calendarId',
      sensitiveFields: ['summary', 'description', 'attendees'],
      logEvents: ['tool.calendar.create_event.approval_requested', 'tool.calendar.create_event.completed'],
    },
    executor: createCalendarEvent,
  },
  {
    name: 'gmail.search_messages',
    description: 'Search Gmail messages and return lightweight message metadata.',
    inputSchema: objectSchema({ query: stringSchema('Gmail search query.'), maxResults: numberSchema('Maximum messages.', { minimum: 1, maximum: 50 }) }),
    parameters: z.object({ query: z.string().default(''), maxResults: z.number().int().min(1).max(50).default(10) }),
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'gmail',
      action: 'search_messages',
      resourceType: 'gmail_message',
      sensitiveFields: ['query'],
      logEvents: ['tool.gmail.search_messages.requested', 'tool.gmail.search_messages.completed'],
    },
    executor: searchGmailMessages,
  },
  {
    name: 'gmail.create_draft',
    description: 'Create a Gmail draft through the configured provider. Draft creation is internal/non-sending by default; private-data exposure boundaries still require explicit approval.',
    inputSchema: objectSchema(
      {
        to: stringArraySchema('Optional draft recipient email addresses.'),
        cc: stringArraySchema('Optional draft CC recipient email addresses.'),
        bcc: stringArraySchema('Optional draft BCC recipient email addresses.'),
        subject: stringSchema('Draft email subject.'),
        body: stringSchema('Plain-text draft email body.'),
        confirmedByUser: approvalBooleanSchema,
        approvalNote: approvalNoteSchema,
      },
      ['subject', 'body'],
    ),
    parameters: z.object({
      to: z.array(z.string().email()).default([]),
      cc: z.array(z.string().email()).default([]),
      bcc: z.array(z.string().email()).default([]),
      subject: z.string().min(1),
      body: z.string().min(1),
      confirmedByUser: z.boolean().default(false),
      approvalNote: z.string().default(''),
    }),
    scopes: ['https://www.googleapis.com/auth/gmail.compose'],
    riskLevel: 'write',
    humanApprovalRequired: false,
    audit: {
      category: 'gmail',
      action: 'create_draft',
      resourceType: 'gmail_draft',
      actorField: 'to',
      sensitiveFields: ['to', 'cc', 'bcc', 'subject', 'body'],
      logEvents: ['tool.gmail.create_draft.requested', 'tool.gmail.create_draft.completed'],
    },
    executor: createGmailDraft,
  },
  {
    name: 'gmail.send_email',
    description: 'Send an email from the connected Gmail account.',
    inputSchema: objectSchema(
      {
        to: stringArraySchema('Recipient email addresses.'),
        cc: stringArraySchema('CC recipient email addresses.'),
        bcc: stringArraySchema('BCC recipient email addresses.'),
        subject: stringSchema('Email subject.'),
        body: stringSchema('Plain-text email body.'),
        confirmedByUser: approvalBooleanSchema,
        approvalNote: approvalNoteSchema,
      },
      ['to', 'subject', 'body'],
    ),
    parameters: z.object({
      to: z.array(z.string().email()).min(1),
      cc: z.array(z.string().email()).default([]),
      bcc: z.array(z.string().email()).default([]),
      subject: z.string().min(1),
      body: z.string().min(1),
      confirmedByUser: z.boolean().default(false),
      approvalNote: z.string().default(''),
    }),
    scopes: ['https://www.googleapis.com/auth/gmail.send'],
    riskLevel: 'external_send',
    humanApprovalRequired: true,
    audit: {
      category: 'gmail',
      action: 'send_email',
      resourceType: 'email',
      actorField: 'to',
      sensitiveFields: ['to', 'cc', 'bcc', 'subject', 'body'],
      logEvents: ['tool.gmail.send_email.approval_requested', 'tool.gmail.send_email.sent'],
    },
    executor: sendGmailEmail,
  },
  {
    name: 'drive.search_files',
    description: 'Search files in the connected drive provider.',
    inputSchema: objectSchema({ query: stringSchema('Drive query or free-text search.'), maxResults: numberSchema('Maximum files.', { minimum: 1, maximum: 100 }) }),
    parameters: z.object({ query: z.string().default(''), maxResults: z.number().int().min(1).max(100).default(20) }),
    scopes: ['https://www.googleapis.com/auth/drive.metadata.readonly'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'drive',
      action: 'search_files',
      resourceType: 'drive_file',
      sensitiveFields: ['query'],
      logEvents: ['tool.drive.search_files.requested', 'tool.drive.search_files.completed'],
    },
    executor: searchDriveFiles,
  },
  {
    name: 'drive.create_text_file',
    description: 'Create an internal text file in the connected Drive provider. Sharing/exposure or private-data-sensitive content requires explicit approval.',
    inputSchema: objectSchema(
      { name: stringSchema('File name.'), parentId: stringSchema('Parent folder ID.'), content: stringSchema('Text content to write.'), mimeType: stringSchema('MIME type.'), confirmedByUser: approvalBooleanSchema, approvalNote: approvalNoteSchema },
      ['name', 'content'],
    ),
    parameters: z.object({
      name: z.string().min(1),
      parentId: z.string().default(''),
      content: z.string().min(1),
      mimeType: z.string().default('text/plain'),
      confirmedByUser: z.boolean().default(false),
      approvalNote: z.string().default(''),
    }),
    scopes: ['https://www.googleapis.com/auth/drive.file'],
    riskLevel: 'write',
    humanApprovalRequired: false,
    audit: {
      category: 'drive',
      action: 'create_text_file',
      resourceType: 'drive_file',
      resourceIdField: 'parentId',
      sensitiveFields: ['name', 'content'],
      logEvents: ['tool.drive.create_text_file.approval_requested', 'tool.drive.create_text_file.completed'],
    },
    executor: createDriveTextFile,
  },
  {
    name: 'sheets.read_range',
    description: 'Read values from a spreadsheet range.',
    inputSchema: objectSchema({ spreadsheetId: stringSchema('Spreadsheet ID.'), range: stringSchema('A1 notation range.') }, ['spreadsheetId', 'range']),
    parameters: z.object({ spreadsheetId: z.string().min(1), range: z.string().min(1) }),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'sheets',
      action: 'read_range',
      resourceType: 'spreadsheet_range',
      resourceIdField: 'spreadsheetId',
      sensitiveFields: ['range'],
      logEvents: ['tool.sheets.read_range.requested', 'tool.sheets.read_range.completed'],
    },
    executor: readSheetRange,
  },
  {
    name: 'sheets.update_range',
    description: 'Update values in a spreadsheet range.',
    inputSchema: objectSchema(
      { spreadsheetId: stringSchema('Spreadsheet ID.'), range: stringSchema('A1 notation range.'), values: { type: 'array', description: 'Two-dimensional row values.', items: { type: 'array', items: {} } } },
      ['spreadsheetId', 'range', 'values'],
    ),
    parameters: z.object({ spreadsheetId: z.string().min(1), range: z.string().min(1), values: z.array(z.array(z.unknown())) }),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    riskLevel: 'write',
    humanApprovalRequired: true,
    audit: {
      category: 'sheets',
      action: 'update_range',
      resourceType: 'spreadsheet_range',
      resourceIdField: 'spreadsheetId',
      sensitiveFields: ['range', 'values'],
      logEvents: ['tool.sheets.update_range.approval_requested', 'tool.sheets.update_range.completed'],
    },
    executor: updateSheetRange,
  },
  {
    name: 'crm.lookup_contact',
    description: 'Look up CRM contacts by email, name, company, or provider-specific ID.',
    inputSchema: objectSchema({ query: stringSchema('Contact lookup query.'), provider: stringSchema('CRM provider key, such as hubspot or salesforce.') }, ['query']),
    parameters: z.object({ query: z.string().min(1), provider: z.string().default('default') }),
    scopes: ['crm.contacts.read'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'crm',
      action: 'lookup_contact',
      resourceType: 'crm_contact',
      sensitiveFields: ['query'],
      logEvents: ['tool.crm.lookup_contact.requested', 'tool.crm.lookup_contact.completed'],
    },
    executor: lookupCrmContact,
  },
  {
    name: 'crm.upsert_contact',
    description: 'Create or update a CRM contact.',
    inputSchema: objectSchema(
      { email: stringSchema('Contact email.'), firstName: stringSchema('First name.'), lastName: stringSchema('Last name.'), company: stringSchema('Company.'), notes: stringSchema('Internal notes.'), confirmedByUser: approvalBooleanSchema, approvalNote: approvalNoteSchema },
      ['email'],
    ),
    parameters: z.object({ email: z.string().email(), firstName: z.string().default(''), lastName: z.string().default(''), company: z.string().default(''), notes: z.string().default(''), confirmedByUser: z.boolean().default(false), approvalNote: z.string().default('') }),
    scopes: ['crm.contacts.write'],
    riskLevel: 'write',
    humanApprovalRequired: true,
    audit: {
      category: 'crm',
      action: 'upsert_contact',
      resourceType: 'crm_contact',
      resourceIdField: 'email',
      sensitiveFields: ['email', 'firstName', 'lastName', 'company', 'notes'],
      logEvents: ['tool.crm.upsert_contact.approval_requested', 'tool.crm.upsert_contact.completed'],
    },
    executor: upsertCrmContact,
  },
  {
    name: 'crm.update_lead_status',
    description: 'Update CRM lead status through the configured CRM provider.',
    inputSchema: objectSchema(
      { contactId: stringSchema('CRM contact ID.'), email: stringSchema('Contact email.'), leadId: stringSchema('Workflow lead ID.'), status: stringSchema('New lead status.'), statusNote: stringSchema('Status note.'), confirmedByUser: approvalBooleanSchema, approvalNote: approvalNoteSchema },
      ['status'],
    ),
    parameters: z.object({ contactId: z.string().default(''), email: z.string().default(''), leadId: z.string().default(''), status: z.string().min(1), statusNote: z.string().default(''), confirmedByUser: z.boolean().default(false), approvalNote: z.string().default('') }),
    scopes: ['crm.contacts.write'],
    riskLevel: 'write',
    humanApprovalRequired: true,
    audit: {
      category: 'crm',
      action: 'update_lead_status',
      resourceType: 'crm_contact',
      resourceIdField: 'contactId',
      sensitiveFields: ['contactId', 'email', 'leadId', 'status', 'statusNote'],
      logEvents: ['tool.crm.update_lead_status.approval_requested', 'tool.crm.update_lead_status.completed'],
    },
    executor: updateLeadStatus,
  },
  {
    name: 'crm.append_activity',
    description: 'Append a CRM activity to a contact or lead through the configured CRM provider.',
    inputSchema: objectSchema(
      { contactId: stringSchema('CRM contact ID.'), email: stringSchema('Contact email.'), leadId: stringSchema('Workflow lead ID.'), activityType: stringSchema('Activity type.'), title: stringSchema('Activity title.'), body: stringSchema('Activity details.'), occurredAt: stringSchema('Activity timestamp.'), metadata: { type: 'object', description: 'Provider-specific activity metadata.', additionalProperties: true }, confirmedByUser: approvalBooleanSchema, approvalNote: approvalNoteSchema },
      ['activityType', 'title'],
    ),
    parameters: z.object({ contactId: z.string().default(''), email: z.string().default(''), leadId: z.string().default(''), activityType: z.string().min(1), title: z.string().min(1), body: z.string().default(''), occurredAt: z.string().default(''), metadata: z.record(z.string(), z.unknown()).default({}), confirmedByUser: z.boolean().default(false), approvalNote: z.string().default('') }),
    scopes: ['crm.contacts.write'],
    riskLevel: 'write',
    humanApprovalRequired: true,
    audit: {
      category: 'crm',
      action: 'append_activity',
      resourceType: 'crm_activity',
      resourceIdField: 'contactId',
      sensitiveFields: ['contactId', 'email', 'leadId', 'activityType', 'title', 'body', 'metadata'],
      logEvents: ['tool.crm.append_activity.approval_requested', 'tool.crm.append_activity.completed'],
    },
    executor: appendActivity,
  },
  {
    name: 'clay.enrich_person',
    description: 'Request a person enrichment from Clay or a compatible enrichment adapter.',
    inputSchema: objectSchema({ email: stringSchema('Person email.'), linkedinUrl: stringSchema('LinkedIn profile URL.'), fullName: stringSchema('Full name.'), company: stringSchema('Company name.'), confirmedByUser: approvalBooleanSchema, approvalNote: approvalNoteSchema }),
    parameters: z.object({ email: z.string().default(''), linkedinUrl: z.string().default(''), fullName: z.string().default(''), company: z.string().default(''), confirmedByUser: z.boolean().default(false), approvalNote: z.string().default('') }),
    scopes: ['clay.enrichments.write'],
    riskLevel: 'purchase_or_commit',
    humanApprovalRequired: true,
    audit: {
      category: 'clay',
      action: 'enrich_person',
      resourceType: 'person_enrichment',
      resourceIdField: 'email',
      sensitiveFields: ['email', 'linkedinUrl', 'fullName', 'company'],
      logEvents: ['tool.clay.enrich_person.approval_requested', 'tool.clay.enrich_person.completed'],
    },
    executor: enrichPersonWithClay,
  },
  {
    name: 'leadgen.find_leads',
    description: 'Find candidate leads by market, title, geography, and optional buying signals.',
    inputSchema: objectSchema(
      { market: stringSchema('Target market or ICP.'), titles: stringArraySchema('Target titles.'), geography: stringSchema('Target geography.'), buyingSignals: stringArraySchema('Optional buying signals to prioritize.'), limit: numberSchema('Maximum lead count.', { minimum: 1, maximum: 100 }) },
      ['market'],
    ),
    parameters: z.object({ market: z.string().min(1), titles: z.array(z.string()).default([]), geography: z.string().default(''), buyingSignals: z.array(z.string()).default([]), limit: z.number().int().min(1).max(100).default(25) }),
    scopes: ['leadgen.search.read'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'leadgen',
      action: 'find_leads',
      resourceType: 'lead',
      sensitiveFields: ['market', 'titles', 'geography'],
      logEvents: ['tool.leadgen.find_leads.requested', 'tool.leadgen.find_leads.completed'],
    },
    executor: findLeadsWorkflow,
  },

  {
    name: 'leadgen.live_proof_workflow',
    description: 'Import one lead from the configured source, score it, place it in the lead inbox, draft one email, require Jordan to say I approve, send exactly one Gmail email, store a receipt, and update follow-up status.',
    inputSchema: objectSchema({ market: stringSchema('Target market or ICP.'), titles: stringArraySchema('Target titles.'), geography: stringSchema('Target geography.'), buyingSignals: stringArraySchema('Optional buying signals to prioritize.'), sourceMode: stringSchema('Optional source mode: sheets, clay_sheets, clay_direct, manual, web_research, or synthetic.'), approvalMessage: stringSchema('Jordan approval phrase. Must be exactly I approve to send.'), approvalNote: approvalNoteSchema, followUpDays: numberSchema('Days until follow-up is due.', { minimum: 1, maximum: 60 }), assignedTo: stringSchema('Lead inbox assignee.') }, ['market']),
    parameters: z.object({ market: z.string().min(1), titles: z.array(z.string()).default([]), geography: z.string().default(''), buyingSignals: z.array(z.string()).default([]), sourceMode: z.enum(['synthetic', 'sheets', 'clay_direct', 'clay_sheets', 'manual', 'web_research']).optional(), approvalMessage: z.string().default(''), approvalNote: z.string().default(''), followUpDays: z.number().int().min(1).max(60).default(3), assignedTo: z.string().default('Jordan') }),
    scopes: ['leadgen.search.read', 'outreach.email.send', 'https://www.googleapis.com/auth/gmail.send'],
    riskLevel: 'external_send',
    humanApprovalRequired: true,
    audit: {
      category: 'leadgen',
      action: 'live_proof_workflow',
      resourceType: 'lead_proof_workflow',
      sensitiveFields: ['market', 'titles', 'geography', 'buyingSignals', 'approvalMessage'],
      logEvents: ['tool.leadgen.live_proof_workflow.approval_requested', 'tool.leadgen.live_proof_workflow.completed'],
    },
    executor: runLeadgenProofWorkflow,
  },
  {
    name: 'leadgen.export_sequence',
    description: 'Export approved leads into an outreach sequence or CRM campaign.',
    inputSchema: objectSchema({ leadIds: stringArraySchema('Approved lead IDs.'), destination: stringSchema('Destination sequence or campaign identifier.'), writeToCrm: { type: 'boolean', description: 'Whether to create/update CRM contacts for exported leads.' }, sendExternally: { type: 'boolean', description: 'Whether this export should initiate an external send via the destination adapter.' }, followUpDays: numberSchema('Days until follow-up is due.', { minimum: 1, maximum: 60 }), confirmedByUser: approvalBooleanSchema, approvalNote: approvalNoteSchema }, ['leadIds', 'destination']),
    parameters: z.object({ leadIds: z.array(z.string()).min(1), destination: z.string().min(1), writeToCrm: z.boolean().default(false), sendExternally: z.boolean().default(false), followUpDays: z.number().int().min(1).max(60).default(3), confirmedByUser: z.boolean().default(false), approvalNote: z.string().default('') }),
    scopes: ['leadgen.sequence.write', 'crm.contacts.write'],
    riskLevel: 'external_send',
    humanApprovalRequired: true,
    audit: {
      category: 'leadgen',
      action: 'export_sequence',
      resourceType: 'lead_sequence',
      resourceIdField: 'destination',
      sensitiveFields: ['leadIds', 'destination'],
      logEvents: ['tool.leadgen.export_sequence.approval_requested', 'tool.leadgen.export_sequence.completed'],
    },
    executor: exportSequence,
  },
  {
    name: 'campaign.evaluate_guardrails',
    description: 'Evaluate campaign-level outreach guardrails before any campaign send. This returns an internal allow/block/pause decision and never sends externally or persists changes by itself.',
    inputSchema: objectSchema(
      {
        campaign: campaignRecordJsonSchema,
        candidates: campaignCandidateArrayJsonSchema,
        optOutRecords: optOutRecordArrayJsonSchema,
        complaintSignals: campaignComplaintSignalArrayJsonSchema,
        errorMessage: stringSchema('Optional prior send/provider error signal that should pause the campaign.'),
        now: stringSchema('Optional ISO timestamp for the guardrail receipt.'),
      },
      ['campaign', 'candidates'],
    ),
    parameters: z.object({
      campaign: z.object({}).passthrough(),
      candidates: z.array(z.object({}).passthrough()).default([]),
      optOutRecords: z.array(z.object({}).passthrough()).default([]),
      complaintSignals: z.array(z.object({}).passthrough()).default([]),
      errorMessage: z.string().default(''),
      now: z.string().default(''),
    }),
    scopes: ['campaign.guardrails.read'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'campaign',
      action: 'evaluate_guardrails',
      resourceType: 'campaign_guardrail_receipt',
      resourceIdField: 'campaign.id',
      sensitiveFields: ['campaign', 'candidates', 'optOutRecords', 'complaintSignals', 'errorMessage'],
      logEvents: ['tool.campaign.evaluate_guardrails.requested', 'tool.campaign.evaluate_guardrails.completed'],
    },
    executor: async (input) => evaluateCampaignGuardrails({
      campaign: input.campaign as any,
      candidates: input.candidates as any,
      optOutRecords: input.optOutRecords as any,
      complaintSignals: input.complaintSignals as any,
      error: compactString(input.errorMessage) || undefined,
      now: compactString(input.now) || undefined,
    }),
  },
  {
    name: 'social.draft_content_idea',
    description: 'Create a draft-only social selling content idea for human review. This never posts or sends externally.',
    inputSchema: objectSchema({ ideaId: stringSchema('Optional content idea ID.'), platform: stringSchema('Social platform.'), topic: stringSchema('Content topic.'), title: stringSchema('Draft title.'), angle: stringSchema('Draft content angle.'), targetAudience: stringSchema('Intended audience.'), bodyOutline: stringSchema('Draft outline.'), callToAction: stringSchema('Draft call to action.'), metadata: genericObjectJsonSchema }, []),
    parameters: z.object({ ideaId: z.string().default(''), platform: z.string().default('linkedin'), topic: z.string().default(''), title: z.string().default(''), angle: z.string().default(''), targetAudience: z.string().default(''), bodyOutline: z.string().default(''), callToAction: z.string().default(''), metadata: z.record(z.string(), z.unknown()).default({}) }),
    scopes: ['social.content.draft'],
    riskLevel: 'write',
    humanApprovalRequired: false,
    audit: {
      category: 'social',
      action: 'draft_content_idea',
      resourceType: 'social_content_idea',
      resourceIdField: 'ideaId',
      sensitiveFields: ['topic', 'title', 'angle', 'targetAudience', 'bodyOutline', 'callToAction'],
      logEvents: ['tool.social.draft_content_idea.requested', 'tool.social.draft_content_idea.completed'],
    },
    executor: draftSocialContentIdea,
  },
  {
    name: 'social.draft_dm',
    description: 'Create a draft-only social DM for human review. This never sends externally.',
    inputSchema: objectSchema({ prospect: socialProspectJsonSchema, draftId: stringSchema('Optional DM draft ID.'), prospectId: stringSchema('Social prospect ID.'), platform: stringSchema('Social platform.'), profileUrl: stringSchema('Prospect profile URL.'), displayName: stringSchema('Prospect display name.'), relationshipContext: stringSchema('Relevant relationship or profile context.'), message: stringSchema('Draft DM message.'), callToAction: stringSchema('Draft call to action.'), metadata: genericObjectJsonSchema }, []),
    parameters: z.object({ prospect: z.object({}).passthrough().optional(), draftId: z.string().default(''), prospectId: z.string().default(''), platform: z.string().default('linkedin'), profileUrl: z.string().default(''), displayName: z.string().default(''), relationshipContext: z.string().default(''), message: z.string().default(''), callToAction: z.string().default(''), metadata: z.record(z.string(), z.unknown()).default({}) }),
    scopes: ['social.dm.draft'],
    riskLevel: 'write',
    humanApprovalRequired: false,
    audit: {
      category: 'social',
      action: 'draft_dm',
      resourceType: 'social_dm_draft',
      resourceIdField: 'prospectId',
      sensitiveFields: ['prospect', 'profileUrl', 'displayName', 'relationshipContext', 'message'],
      logEvents: ['tool.social.draft_dm.requested', 'tool.social.draft_dm.completed'],
    },
    executor: draftSocialDm,
  },
  {
    name: 'social.classify_reply',
    description: 'Classify an inbound social reply and recommend a safe internal next action. This never sends externally.',
    inputSchema: objectSchema({ replyText: stringSchema('Inbound social reply text.'), platform: stringSchema('Social platform.'), prospectId: stringSchema('Social prospect ID.'), receiptId: stringSchema('Related sent-message receipt ID.'), receivedAt: stringSchema('Received timestamp.'), classifiedBy: stringSchema('Classifier label.'), summary: stringSchema('Optional human/model-provided summary.'), metadata: genericObjectJsonSchema }, ['replyText']),
    parameters: z.object({ replyText: z.string().min(1), platform: z.string().default('linkedin'), prospectId: z.string().default(''), receiptId: z.string().default(''), receivedAt: z.string().default(''), classifiedBy: z.string().default(''), summary: z.string().default(''), metadata: z.record(z.string(), z.unknown()).default({}) }),
    scopes: ['social.reply.classify'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'social',
      action: 'classify_reply',
      resourceType: 'social_reply',
      resourceIdField: 'receiptId',
      sensitiveFields: ['replyText', 'summary'],
      logEvents: ['tool.social.classify_reply.requested', 'tool.social.classify_reply.completed'],
    },
    executor: classifySocialReply,
  },
  {
    name: 'social.recommend_follow_up',
    description: 'Create a draft-only follow-up recommendation from a social reply classification. This never sends externally.',
    inputSchema: objectSchema({ replyClassification: socialReplyClassificationJsonSchema, recommendationId: stringSchema('Optional recommendation ID.'), prospectId: stringSchema('Social prospect ID.'), platform: stringSchema('Social platform.'), replyClassificationId: stringSchema('Reply classification ID.'), replyClass: stringSchema('Reply class.'), recommendedAction: stringSchema('Draft recommended action.'), suggestedTiming: stringSchema('Draft follow-up timing.'), draftReply: stringSchema('Optional draft reply for human review.'), metadata: genericObjectJsonSchema }, []),
    parameters: z.object({ replyClassification: z.object({}).passthrough().optional(), recommendationId: z.string().default(''), prospectId: z.string().default(''), platform: z.string().default('linkedin'), replyClassificationId: z.string().default(''), replyClass: z.string().default(''), recommendedAction: z.string().default(''), suggestedTiming: z.string().default(''), draftReply: z.string().default(''), metadata: z.record(z.string(), z.unknown()).default({}) }),
    scopes: ['social.follow_up.draft'],
    riskLevel: 'write',
    humanApprovalRequired: false,
    audit: {
      category: 'social',
      action: 'recommend_follow_up',
      resourceType: 'social_follow_up_recommendation',
      resourceIdField: 'prospectId',
      sensitiveFields: ['replyClassification', 'recommendedAction', 'suggestedTiming', 'draftReply'],
      logEvents: ['tool.social.recommend_follow_up.requested', 'tool.social.recommend_follow_up.completed'],
    },
    executor: recommendSocialFollowUp,
  },
  {
    name: 'outreach.draft_email',
    description: 'Draft a single-recipient outreach email for human review. This creates draft content only and never sends externally.',
    inputSchema: objectSchema({ lead: leadRecordJsonSchema, leadId: stringSchema('Lead ID.'), contactName: stringSchema('Recipient name.'), contactEmail: stringSchema('Recipient email.'), company: stringSchema('Recipient company.'), subject: stringSchema('Draft subject.'), body: stringSchema('Draft body.'), valueProposition: stringSchema('Optional value proposition to include when generating a body.'), callToAction: stringSchema('Optional call to action.'), metadata: genericObjectJsonSchema }, []),
    parameters: z.object({ lead: z.object({}).passthrough().optional(), leadId: z.string().default(''), contactName: z.string().default(''), contactEmail: z.string().default(''), company: z.string().default(''), subject: z.string().default(''), body: z.string().default(''), valueProposition: z.string().default(''), callToAction: z.string().default(''), metadata: z.record(z.string(), z.unknown()).default({}) }),
    scopes: ['outreach.email.draft'],
    riskLevel: 'write',
    humanApprovalRequired: false,
    audit: {
      category: 'outreach',
      action: 'draft_email',
      resourceType: 'outreach_draft',
      resourceIdField: 'leadId',
      sensitiveFields: ['lead', 'contactName', 'contactEmail', 'company', 'subject', 'body', 'valueProposition'],
      logEvents: ['tool.outreach.draft_email.requested', 'tool.outreach.draft_email.completed'],
    },
    executor: draftOutreachEmail,
  },
  {
    name: 'outreach.approve_send',
    description: 'Create an approved send request from a reviewed outreach draft. This does not send externally.',
    inputSchema: objectSchema({ draft: outreachDraftJsonSchema, draftId: stringSchema('Draft ID.'), to: stringArraySchema('Approved recipient email addresses.'), cc: stringArraySchema('CC recipient email addresses.'), bcc: stringArraySchema('BCC recipient email addresses.'), subject: stringSchema('Approved subject.'), body: stringSchema('Approved body.'), scheduledFor: stringSchema('Optional scheduled send time.'), approvedBy: stringSchema('Approver name or ID.'), confirmedByUser: approvalBooleanSchema, approvalNote: approvalNoteSchema, metadata: genericObjectJsonSchema }, ['draft']),
    parameters: z.object({ draft: z.object({}).passthrough(), draftId: z.string().default(''), to: z.array(z.string().email()).default([]), cc: z.array(z.string().email()).default([]), bcc: z.array(z.string().email()).default([]), subject: z.string().default(''), body: z.string().default(''), scheduledFor: z.string().default(''), approvedBy: z.string().default('human'), confirmedByUser: z.boolean().default(false), approvalNote: z.string().default(''), metadata: z.record(z.string(), z.unknown()).default({}) }),
    scopes: ['outreach.email.approve'],
    riskLevel: 'write',
    humanApprovalRequired: true,
    audit: {
      category: 'outreach',
      action: 'approve_send',
      resourceType: 'approved_send_request',
      resourceIdField: 'draftId',
      actorField: 'approvedBy',
      sensitiveFields: ['draft', 'to', 'cc', 'bcc', 'subject', 'body'],
      logEvents: ['tool.outreach.approve_send.approval_requested', 'tool.outreach.approve_send.completed'],
    },
    executor: approveOutreachSend,
  },
  {
    name: 'outreach.send_email',
    description: 'Send one approved outreach email after approval checks and opt-out suppression.',
    inputSchema: objectSchema({ lead: leadRecordJsonSchema, sendRequest: approvedSendRequestJsonSchema, optOutRecords: optOutRecordArrayJsonSchema, followUpDueAt: stringSchema('Optional follow-up due date.'), followUpDays: numberSchema('Optional days until follow-up.', { minimum: 1, maximum: 60 }), confirmedByUser: approvalBooleanSchema, approvalNote: approvalNoteSchema }, ['lead', 'sendRequest']),
    parameters: z.object({ lead: z.object({}).passthrough(), sendRequest: z.object({}).passthrough(), optOutRecords: z.array(z.object({}).passthrough()).default([]), followUpDueAt: z.string().default(''), followUpDays: z.number().int().min(1).max(60).optional(), confirmedByUser: z.boolean().default(false), approvalNote: z.string().default('') }),
    scopes: ['outreach.email.send', 'https://www.googleapis.com/auth/gmail.send'],
    riskLevel: 'external_send',
    humanApprovalRequired: true,
    audit: {
      category: 'outreach',
      action: 'send_email',
      resourceType: 'outreach_email',
      resourceIdField: 'sendRequest.id',
      actorField: 'sendRequest.to',
      sensitiveFields: ['lead', 'sendRequest', 'optOutRecords'],
      logEvents: ['tool.outreach.send_email.approval_requested', 'tool.outreach.send_email.sent'],
    },
    executor: sendApprovedEmail,
  },
  {
    name: 'outreach.classify_reply',
    description: 'Classify an inbound outreach reply and recommend the next safe action.',
    inputSchema: objectSchema({ replyText: stringSchema('Inbound reply text.'), subject: stringSchema('Reply subject.'), receiptId: stringSchema('Related sent-email receipt ID.'), threadId: stringSchema('Provider thread ID.'), messageId: stringSchema('Provider message ID.'), receivedAt: stringSchema('Received timestamp.'), classifiedBy: stringSchema('Classifier label.'), modelSuggestion: genericObjectJsonSchema, metadata: genericObjectJsonSchema }, ['replyText']),
    parameters: z.object({ replyText: z.string().min(1), subject: z.string().default(''), receiptId: z.string().default(''), threadId: z.string().default(''), messageId: z.string().default(''), receivedAt: z.string().default(''), classifiedBy: z.string().default(''), modelSuggestion: z.object({}).passthrough().optional(), metadata: z.record(z.string(), z.unknown()).default({}) }),
    scopes: ['outreach.reply.classify'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'outreach',
      action: 'classify_reply',
      resourceType: 'outreach_reply',
      resourceIdField: 'messageId',
      sensitiveFields: ['replyText', 'subject'],
      logEvents: ['tool.outreach.classify_reply.requested', 'tool.outreach.classify_reply.completed'],
    },
    executor: async (input) => classifyReply(input),
  },
  {
    name: 'outreach.schedule_follow_up',
    description: 'Schedule an internal follow-up reminder from a classified reply. This does not send externally.',
    inputSchema: objectSchema({ lead: leadRecordJsonSchema, replyClassification: replyClassificationJsonSchema, approvedFollowUpAt: stringSchema('Approved follow-up date/time.'), approvedBy: stringSchema('Approver name or ID.'), approvalNote: approvalNoteSchema, assignedTo: stringSchema('Owner for follow-up.'), reason: stringSchema('Follow-up reason.'), metadata: genericObjectJsonSchema }, ['lead', 'replyClassification', 'approvedFollowUpAt']),
    parameters: z.object({ lead: z.object({}).passthrough(), replyClassification: z.object({}).passthrough(), approvedFollowUpAt: z.string().min(1), approvedBy: z.string().default('human'), approvalNote: z.string().default(''), assignedTo: z.string().default(''), reason: z.string().default(''), metadata: z.record(z.string(), z.unknown()).default({}) }),
    scopes: ['outreach.follow_up.write'],
    riskLevel: 'write',
    humanApprovalRequired: false,
    audit: {
      category: 'outreach',
      action: 'schedule_follow_up',
      resourceType: 'follow_up',
      resourceIdField: 'lead.id',
      sensitiveFields: ['lead', 'replyClassification', 'reason'],
      logEvents: ['tool.outreach.schedule_follow_up.requested', 'tool.outreach.schedule_follow_up.completed'],
    },
    executor: async (input) => scheduleFollowUp(input as any),
  },
  {
    name: 'objection.extract',
    description: 'Extract internal objection records from a call transcript for draft-only review. Internal only; never sends messages externally.',
    inputSchema: objectSchema({ callTranscript: callTranscriptRecordJsonSchema, prospectContext: genericObjectJsonSchema, offerProposalContext: genericObjectJsonSchema, createdAt: stringSchema('Optional extraction timestamp.'), status: stringSchema('Optional objection status.') }, ['callTranscript']),
    parameters: z.object({ callTranscript: z.object({}).passthrough(), prospectContext: z.object({}).passthrough().optional(), offerProposalContext: z.object({}).passthrough().optional(), createdAt: z.string().default(''), status: z.string().default('') }),
    scopes: ['objection.analysis.draft'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'objection',
      action: 'extract',
      resourceType: 'objection_record',
      resourceIdField: 'callTranscript.id',
      sensitiveFields: ['callTranscript', 'prospectContext', 'offerProposalContext'],
      logEvents: ['tool.objection.extract.requested', 'tool.objection.extract.completed'],
    },
    executor: async (input) => ({ ok: true, status: 'draft', workflow: 'objection', internalOnly: true, externalSend: false, objections: extractObjections({ ...input, createdAt: input.createdAt || undefined, status: input.status || undefined } as any) }),
  },
  {
    name: 'objection.create_call_insight_report',
    description: 'Create an internal draft-only post-call insight report with objections, missed signals, offer gaps, and proposal improvement notes. Never sends externally.',
    inputSchema: objectSchema({ callTranscript: callTranscriptRecordJsonSchema, prospectContext: genericObjectJsonSchema, offerProposalContext: genericObjectJsonSchema, createdAt: stringSchema('Optional report timestamp.'), reportId: stringSchema('Optional report ID.') }, ['callTranscript']),
    parameters: z.object({ callTranscript: z.object({}).passthrough(), prospectContext: z.object({}).passthrough().optional(), offerProposalContext: z.object({}).passthrough().optional(), createdAt: z.string().default(''), reportId: z.string().default('') }),
    scopes: ['objection.analysis.draft'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'objection',
      action: 'create_call_insight_report',
      resourceType: 'call_insight_report',
      resourceIdField: 'callTranscript.id',
      sensitiveFields: ['callTranscript', 'prospectContext', 'offerProposalContext'],
      logEvents: ['tool.objection.create_call_insight_report.requested', 'tool.objection.create_call_insight_report.completed'],
    },
    executor: async (input) => ({ ok: true, status: 'draft', workflow: 'objection', internalOnly: true, externalSend: false, report: createCallInsightReport({ ...input, createdAt: input.createdAt || undefined, reportId: input.reportId || undefined } as any) }),
  },
  {
    name: 'objection.generate_better_questions',
    description: 'Generate an internal draft-only ethical follow-up question prompt from prospect, transcript, offer, and objection context. Never sends externally.',
    inputSchema: objectSchema({ prospectContext: genericObjectJsonSchema, transcript: { oneOf: [callTranscriptRecordJsonSchema, { type: 'string' }] }, offer: { oneOf: [genericObjectJsonSchema, { type: 'string' }] }, objections: objectionRecordArrayJsonSchema }, []),
    parameters: z.object({ prospectContext: z.object({}).passthrough().optional(), transcript: z.union([z.object({}).passthrough(), z.string()]).optional(), offer: z.union([z.object({}).passthrough(), z.string()]).optional(), objections: z.array(z.union([z.object({}).passthrough(), z.string()])).default([]) }),
    scopes: ['objection.analysis.draft'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'objection',
      action: 'generate_better_questions',
      resourceType: 'better_questions_prompt',
      sensitiveFields: ['prospectContext', 'transcript', 'offer', 'objections'],
      logEvents: ['tool.objection.generate_better_questions.requested', 'tool.objection.generate_better_questions.completed'],
    },
    executor: async (input) => ({ ok: true, status: 'draft', workflow: 'objection', internalOnly: true, externalSend: false, prompt: createBetterQuestionsPrompt(input as any) }),
  },
  {
    name: 'objection.create_offer_improvement_notes',
    description: 'Create internal draft-only offer improvement notes from a call insight report or source call context. Never sends messages externally.',
    inputSchema: objectSchema({ callInsightReport: callInsightReportJsonSchema, callTranscript: callTranscriptRecordJsonSchema, prospectContext: genericObjectJsonSchema, offerProposalContext: genericObjectJsonSchema, offer: genericObjectJsonSchema, notesId: stringSchema('Optional notes ID.'), createdAt: stringSchema('Optional timestamp used when a report must be generated.'), metadata: genericObjectJsonSchema }, []),
    parameters: z.object({ callInsightReport: z.object({}).passthrough().optional(), callTranscript: z.object({}).passthrough().optional(), prospectContext: z.object({}).passthrough().optional(), offerProposalContext: z.object({}).passthrough().optional(), offer: z.object({}).passthrough().optional(), notesId: z.string().default(''), createdAt: z.string().default(''), metadata: z.record(z.string(), z.unknown()).default({}) }),
    scopes: ['objection.analysis.draft'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'objection',
      action: 'create_offer_improvement_notes',
      resourceType: 'offer_improvement_notes',
      resourceIdField: 'callInsightReport.id',
      sensitiveFields: ['callInsightReport', 'callTranscript', 'prospectContext', 'offerProposalContext', 'offer'],
      logEvents: ['tool.objection.create_offer_improvement_notes.requested', 'tool.objection.create_offer_improvement_notes.completed'],
    },
    executor: createOfferImprovementNotes,
  },
  {
    name: 'outreach.record_opt_out',
    description: 'Record an opt-out/do-not-contact request and suppress future outreach while preserving the lead record.',
    inputSchema: objectSchema({ lead: leadRecordJsonSchema, messageText: stringSchema('Opt-out message text.'), subject: stringSchema('Message subject.'), source: stringSchema('Opt-out source.'), requestedAt: stringSchema('Request timestamp.'), recordedAt: stringSchema('Recorded timestamp.'), receiptId: stringSchema('Related sent-email receipt ID.'), replyClassification: replyClassificationJsonSchema, reason: stringSchema('Opt-out reason.'), metadata: genericObjectJsonSchema }, ['lead']),
    parameters: z.object({ lead: z.object({}).passthrough(), messageText: z.string().default(''), subject: z.string().default(''), source: z.string().default('manual'), requestedAt: z.string().default(''), recordedAt: z.string().default(''), receiptId: z.string().default(''), replyClassification: z.object({}).passthrough().optional(), reason: z.string().default(''), metadata: z.record(z.string(), z.unknown()).default({}) }),
    scopes: ['outreach.opt_out.write'],
    riskLevel: 'write',
    humanApprovalRequired: false,
    audit: {
      category: 'outreach',
      action: 'record_opt_out',
      resourceType: 'opt_out',
      resourceIdField: 'lead.id',
      sensitiveFields: ['lead', 'messageText', 'subject', 'reason'],
      logEvents: ['tool.outreach.record_opt_out.requested', 'tool.outreach.record_opt_out.completed'],
    },
    executor: recordOptOut,
  },
  {
    name: 'intake.create_record',
    description: 'Create an internal intake record and memory reference from submitted intake details. Draft-safe: records context only and never sends externally.',
    inputSchema: objectSchema(
      {
        ...intakeFormSchemaProperties,
        sessionId: stringSchema('Optional source session ID; runtime context is used when omitted.'),
        leadId: stringSchema('Optional linked lead ID.'),
        clientId: stringSchema('Optional linked client ID.'),
        submittedAt: stringSchema('Optional intake submission timestamp.'),
        memoryScope: stringSchema('Optional memory scope override for the internal intake memory.'),
      },
      ['businessName', 'contactName'],
    ),
    parameters: z.object({
      businessName: z.string().min(1),
      contactName: z.string().min(1),
      email: z.string().default(''),
      phone: z.string().default(''),
      website: z.string().default(''),
      industry: z.string().default(''),
      teamSize: z.string().default(''),
      currentTools: z.array(z.string()).default([]),
      currentCrm: z.string().default(''),
      mainBottleneck: z.string().default(''),
      leadCustomerFlow: z.string().default(''),
      missedCallFollowUpIssue: z.string().default(''),
      financePricingCashFlowIssue: z.string().default(''),
      operationsSopIssue: z.string().default(''),
      techAutomationIssue: z.string().default(''),
      desiredOutcome: z.string().default(''),
      timeline: z.string().default(''),
      budgetComfortRange: z.string().default(''),
      uploadedNotesFilesMetadata: z.array(z.unknown()).default([]),
      permissionToContact: z.boolean().default(false),
      sessionId: z.string().default(''),
      leadId: z.string().default(''),
      clientId: z.string().default(''),
      submittedAt: z.string().default(''),
      memoryScope: z.string().default(''),
    }),
    scopes: ['runtime.intake.write', 'runtime.memory.write'],
    riskLevel: 'write',
    humanApprovalRequired: false,
    audit: {
      category: 'intake',
      action: 'create_record',
      resourceType: 'intake_record',
      resourceIdField: 'businessName',
      sensitiveFields: ['businessName', 'contactName', 'email', 'phone', 'website', 'mainBottleneck', 'desiredOutcome'],
      logEvents: ['tool.intake.create_record.requested', 'tool.intake.create_record.completed'],
    },
    executor: async (input, context) =>
      createIntakeRecord(input, {
        sessionId: context.sessionId,
        leadId: typeof input.leadId === 'string' && input.leadId ? input.leadId : undefined,
        clientId: typeof input.clientId === 'string' && input.clientId ? input.clientId : undefined,
        submittedAt: typeof input.submittedAt === 'string' && input.submittedAt ? input.submittedAt : undefined,
        memoryScope: typeof input.memoryScope === 'string' && input.memoryScope ? input.memoryScope : undefined,
      }),
  },
  {
    name: 'intake.classify',
    description: 'Classify an intake into the best internal specialist route with reasons and risk flags. Draft-safe and internal only.',
    inputSchema: objectSchema(intakeFormSchemaProperties, ['businessName', 'contactName']),
    parameters: z.object({
      businessName: z.string().min(1),
      contactName: z.string().min(1),
      email: z.string().default(''),
      phone: z.string().default(''),
      website: z.string().default(''),
      industry: z.string().default(''),
      teamSize: z.string().default(''),
      currentTools: z.array(z.string()).default([]),
      currentCrm: z.string().default(''),
      mainBottleneck: z.string().default(''),
      leadCustomerFlow: z.string().default(''),
      missedCallFollowUpIssue: z.string().default(''),
      financePricingCashFlowIssue: z.string().default(''),
      operationsSopIssue: z.string().default(''),
      techAutomationIssue: z.string().default(''),
      desiredOutcome: z.string().default(''),
      timeline: z.string().default(''),
      budgetComfortRange: z.string().default(''),
      uploadedNotesFilesMetadata: z.array(z.unknown()).default([]),
      permissionToContact: z.boolean().default(false),
    }),
    scopes: ['runtime.intake.read'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'intake',
      action: 'classify',
      resourceType: 'intake_classification',
      sensitiveFields: ['businessName', 'contactName', 'email', 'phone', 'website', 'mainBottleneck', 'desiredOutcome'],
      logEvents: ['tool.intake.classify.requested', 'tool.intake.classify.completed'],
    },
    executor: async (input) => classifyIntake(input),
  },
  {
    name: 'intake.route_specialist',
    description: 'Create an internal draft request for the selected specialist from an intake record. Draft-safe: creates only internal deliverable/memory placeholders and never sends externally.',
    inputSchema: objectSchema(
      { intakeRecord: intakeRecordSchema, requestedAt: stringSchema('Optional routing request timestamp.'), memoryScope: stringSchema('Optional memory scope override for the internal deliverable memory.') },
      ['intakeRecord'],
    ),
    parameters: z.object({
      intakeRecord: z.any(),
      requestedAt: z.string().default(''),
      memoryScope: z.string().default(''),
    }),
    scopes: ['runtime.intake.write', 'runtime.memory.write'],
    riskLevel: 'write',
    humanApprovalRequired: false,
    audit: {
      category: 'intake',
      action: 'route_specialist',
      resourceType: 'specialist_draft_request',
      resourceIdField: 'intakeRecord',
      sensitiveFields: ['intakeRecord'],
      logEvents: ['tool.intake.route_specialist.requested', 'tool.intake.route_specialist.completed'],
    },
    executor: async (input, context) => {
      const intakeRecord = { ...input.intakeRecord, sessionId: input.intakeRecord?.sessionId ?? context.sessionId };
      return routeSpecialist(intakeRecord, {
        requestedAt: typeof input.requestedAt === 'string' && input.requestedAt ? input.requestedAt : undefined,
        memoryScope: typeof input.memoryScope === 'string' && input.memoryScope ? input.memoryScope : undefined,
      });
    },
  },
  {
    name: 'intake.package_for_review',
    description: 'Package an internal specialist draft for Jordan review. Draft-safe: marks output as not approved for external send.',
    inputSchema: objectSchema(
      {
        intakeRecord: intakeRecordSchema,
        classification: intakeClassificationSchema,
        specialistDraftContent: {
          description: 'Internal specialist draft content to package for human review.',
          oneOf: [{ type: 'string' }, { type: 'object', additionalProperties: true }],
        },
        riskFlags: { type: 'array', description: 'Optional risk flags to include; defaults to classification risk flags.', items: { type: 'object', additionalProperties: true } },
        recommendedNextStep: stringSchema('Suggested next action for Jordan to review.'),
        packagedAt: stringSchema('Optional package creation timestamp.'),
      },
      ['intakeRecord', 'classification', 'specialistDraftContent', 'recommendedNextStep'],
    ),
    parameters: z.object({
      intakeRecord: z.any(),
      classification: z.any(),
      specialistDraftContent: z.union([z.string(), z.record(z.string(), z.unknown())]),
      riskFlags: z.array(z.any()).optional(),
      recommendedNextStep: z.string().min(1),
      packagedAt: z.string().default(''),
    }),
    scopes: ['runtime.intake.write'],
    riskLevel: 'write',
    humanApprovalRequired: false,
    audit: {
      category: 'intake',
      action: 'package_for_review',
      resourceType: 'intake_review_package',
      resourceIdField: 'intakeRecord',
      sensitiveFields: ['intakeRecord', 'specialistDraftContent'],
      logEvents: ['tool.intake.package_for_review.requested', 'tool.intake.package_for_review.completed'],
    },
    executor: async (input) =>
      packageForReview({
        intakeRecord: input.intakeRecord,
        classification: input.classification,
        specialistDraftContent: input.specialistDraftContent,
        riskFlags: input.riskFlags,
        recommendedNextStep: input.recommendedNextStep,
        packagedAt: input.packagedAt || undefined,
      }),
  },
  {
    name: 'qualification.create_from_form',
    description: 'Create an internal qualification record from submitted qualification form details. Internal-only: does not schedule calls, send messages, or contact anyone.',
    inputSchema: objectSchema(qualificationFormSchemaProperties, ['leadId', 'intakeId']),
    parameters: z.object({
      leadId: z.string().min(1),
      intakeId: z.string().min(1),
      source: z.enum(['form', 'transcript', 'manual']).default('form'),
      monthlyLeadVolume: z.number().int().nonnegative().default(0),
      responseSpeed: z.string().default(''),
      missedCallsMessages: z.number().int().nonnegative().default(0),
      crmTrackingSystem: z.string().default(''),
      averageJobCustomerValue: z.number().nonnegative().default(0),
      closeRate: z.number().min(0).max(100).default(0),
      crackFallthroughPoints: z.array(z.string()).default([]),
      desired30DayImprovement: z.string().default(''),
      qualificationScore: z.number().min(0).max(100).default(0),
      status: z.string().default('needs_review'),
      createdAt: z.string().default(''),
      updatedAt: z.string().default(''),
      memoryScope: z.string().default(''),
    }),
    scopes: ['runtime.qualification.write', 'runtime.memory.write'],
    riskLevel: 'write',
    humanApprovalRequired: false,
    audit: {
      category: 'qualification',
      action: 'create_from_form',
      resourceType: 'qualification_record',
      resourceIdField: 'leadId',
      sensitiveFields: ['leadId', 'intakeId', 'responseSpeed', 'crmTrackingSystem', 'crackFallthroughPoints', 'desired30DayImprovement'],
      logEvents: ['tool.qualification.create_from_form.requested', 'tool.qualification.create_from_form.completed'],
    },
    executor: async (input, context) => {
      const createdAt = qualificationTimestamp(input.createdAt);
      const updatedAt = compactString(input.updatedAt) ? qualificationTimestamp(input.updatedAt) : createdAt;
      const record = QualificationRecordSchema.parse({
        id: stableQualificationId({ leadId: input.leadId, intakeId: input.intakeId, source: input.source, createdAt }),
        leadId: input.leadId,
        intakeId: input.intakeId,
        source: input.source,
        monthlyLeadVolume: input.monthlyLeadVolume,
        responseSpeed: input.responseSpeed,
        missedCallsMessages: input.missedCallsMessages,
        crmTrackingSystem: input.crmTrackingSystem,
        averageJobCustomerValue: input.averageJobCustomerValue,
        closeRate: input.closeRate,
        crackFallthroughPoints: input.crackFallthroughPoints,
        desired30DayImprovement: input.desired30DayImprovement,
        qualificationScore: input.qualificationScore,
        status: input.status,
        createdAt,
        updatedAt,
      });
      const memory = await remember(context.sessionId, createQualificationMemoryText(record), {
        id: record.id,
        scope: input.memoryScope || 'business_context',
        tags: ['qualification', 'record', record.leadId, record.source],
        metadata: { qualificationRecord: record, internalOnly: true, externalCommunication: false, scheduling: false },
        importance: 0.85,
        source: 'api',
        createdAt,
      });
      qualificationRecordStore.set(record.id, record);
      return { record, memoryId: memory.id, memory, internalOnly: true, scheduling: false, externalCommunication: false };
    },
  },
  {
    name: 'qualification.import_transcript',
    description: 'Import a qualification call transcript into internal records and memory for summarization/routing. Internal-only: does not schedule follow-ups or send communications.',
    inputSchema: objectSchema(
      {
        transcript: stringSchema('Full call transcript text.'),
        leadId: stringSchema('Lead ID connected to the transcript.'),
        callDate: stringSchema('Call date or start timestamp.'),
        participants: stringArraySchema('Call participant names or IDs.'),
        source: stringSchema('Transcript source, such as uploaded_file, voice_call, zoom, or manual.'),
        recordingLink: stringSchema('Optional recording link stored internally; this tool does not share it externally.'),
        sessionId: stringSchema('Optional source session ID; runtime context is used when omitted.'),
        clientId: stringSchema('Optional linked client ID.'),
        proposalId: stringSchema('Optional linked proposal ID.'),
        endedAt: stringSchema('Optional call end timestamp.'),
        status: stringSchema('Optional internal transcript status; defaults to imported.'),
        memoryScope: stringSchema('Optional memory scope for the internal transcript memory.'),
      },
      ['transcript', 'leadId', 'callDate', 'source'],
    ),
    parameters: z.object({
      transcript: z.string().min(1),
      leadId: z.string().min(1),
      callDate: z.string().min(1),
      participants: z.array(z.string()).default([]),
      source: z.string().min(1),
      recordingLink: z.string().default(''),
      sessionId: z.string().default(''),
      clientId: z.string().default(''),
      proposalId: z.string().default(''),
      endedAt: z.string().default(''),
      status: z.string().default('imported'),
      memoryScope: z.string().default(''),
    }),
    scopes: ['runtime.qualification.write', 'runtime.memory.write'],
    riskLevel: 'write',
    humanApprovalRequired: false,
    audit: {
      category: 'qualification',
      action: 'import_transcript',
      resourceType: 'call_transcript',
      resourceIdField: 'leadId',
      sensitiveFields: ['transcript', 'participants', 'recordingLink'],
      logEvents: ['tool.qualification.import_transcript.requested', 'tool.qualification.import_transcript.completed'],
    },
    executor: async (input, context) =>
      importTranscript({
        ...input,
        sessionId: compactString(input.sessionId) || context.sessionId,
        recordingLink: compactString(input.recordingLink) || undefined,
        clientId: compactString(input.clientId) || undefined,
        proposalId: compactString(input.proposalId) || undefined,
        endedAt: compactString(input.endedAt) || undefined,
        memoryScope: compactString(input.memoryScope) || undefined,
      }),
  },
  {
    name: 'qualification.score',
    description: 'Score an internal qualification record and recommend the next internal action. Does not book meetings, send outreach, or update external systems.',
    inputSchema: objectSchema({ record: qualificationRecordJsonSchema }, ['record']),
    parameters: z.object({ record: QualificationRecordSchema }),
    scopes: ['runtime.qualification.read'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'qualification',
      action: 'score',
      resourceType: 'qualification_score',
      resourceIdField: 'record',
      sensitiveFields: ['record'],
      logEvents: ['tool.qualification.score.requested', 'tool.qualification.score.completed'],
    },
    executor: async (input) => scoreQualification(input.record),
  },
  {
    name: 'qualification.check_gate',
    description: 'Check whether internal qualification evidence exists before proposal review call creation. This only returns a gate decision; scheduling remains a separate approval-gated action.',
    inputSchema: objectSchema(
      {
        leadId: stringSchema('Optional lead ID to check.'),
        lead: { type: 'object', additionalProperties: true, description: 'Optional lead record summary.' },
        intakeRecords: { type: 'array', description: 'Optional internal intake records to inspect.', items: { type: 'object', additionalProperties: true } },
        callTranscripts: { type: 'array', description: 'Optional internal call transcript records to inspect.', items: callTranscriptRecordJsonSchema },
        qualificationRecords: { type: 'array', description: 'Optional internal qualification records to inspect.', items: qualificationRecordJsonSchema },
        hasSubmittedIntakeForm: { type: 'boolean', description: 'Whether trusted internal state says a submitted intake form exists.' },
        hasImportedCallTranscript: { type: 'boolean', description: 'Whether trusted internal state says an imported call transcript exists.' },
        hasQualificationRecord: { type: 'boolean', description: 'Whether trusted internal state says a qualification record exists.' },
      },
    ),
    parameters: z.object({
      leadId: z.string().default(''),
      lead: z.record(z.string(), z.unknown()).nullable().optional(),
      intakeRecords: z.array(z.record(z.string(), z.unknown()).nullable().optional()).default([]),
      callTranscripts: z.array(z.record(z.string(), z.unknown()).nullable().optional()).default([]),
      qualificationRecords: z.array(z.record(z.string(), z.unknown()).nullable().optional()).default([]),
      hasSubmittedIntakeForm: z.boolean().default(false),
      hasImportedCallTranscript: z.boolean().default(false),
      hasQualificationRecord: z.boolean().default(false),
    }),
    scopes: ['runtime.qualification.read'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'qualification',
      action: 'check_gate',
      resourceType: 'qualification_gate',
      resourceIdField: 'leadId',
      sensitiveFields: ['lead', 'intakeRecords', 'callTranscripts', 'qualificationRecords'],
      logEvents: ['tool.qualification.check_gate.requested', 'tool.qualification.check_gate.completed'],
    },
    executor: async (input) => {
      const storedQualificationRecords = input.leadId
        ? [...qualificationRecordStore.values()].filter((record) => record.leadId === input.leadId)
        : [...qualificationRecordStore.values()];
      return checkQualificationGate({
        ...input,
        leadId: compactString(input.leadId) || undefined,
        qualificationRecords: [...input.qualificationRecords, ...storedQualificationRecords],
      });
    },
  },
  {
    name: 'proposal.create_package',
    description: 'Create an internal ELORA final proposal package for Jordan review. Internal-only: does not send the proposal externally.',
    inputSchema: objectSchema(
      {
        crmLeadData: { type: 'object', additionalProperties: true, description: 'Optional CRM lead data snapshot.' },
        transcriptRecords: { type: 'array', description: 'Optional call transcript records.', items: callTranscriptRecordJsonSchema },
        notes: { type: 'array', description: 'Optional proposal notes.', items: { oneOf: [{ type: 'string' }, { type: 'object', additionalProperties: true }] } },
        offerTemplate: { type: 'object', additionalProperties: true, description: 'OfferTemplateRecord for the proposed offer.' },
        intakeRecord: intakeRecordSchema,
        domainSpecialistDraft: {
          description: 'Optional domain specialist draft content.',
          oneOf: [{ type: 'string' }, { type: 'object', additionalProperties: true }],
        },
        createdAt: stringSchema('Optional package creation timestamp.'),
        packageId: stringSchema('Optional package ID.'),
      },
      ['offerTemplate', 'intakeRecord'],
    ),
    parameters: z.object({
      crmLeadData: z.record(z.string(), z.unknown()).optional(),
      transcriptRecords: z.array(z.object({}).passthrough()).default([]),
      notes: z.array(z.union([z.string(), z.object({}).passthrough()])).default([]),
      offerTemplate: z.object({}).passthrough(),
      intakeRecord: z.object({}).passthrough(),
      domainSpecialistDraft: z.union([z.string(), z.object({}).passthrough()]).optional(),
      createdAt: z.string().default(''),
      packageId: z.string().default(''),
    }),
    scopes: ['runtime.proposal.write'],
    riskLevel: 'write',
    humanApprovalRequired: false,
    audit: {
      category: 'proposal',
      action: 'create_package',
      resourceType: 'proposal_package',
      resourceIdField: 'packageId',
      sensitiveFields: ['crmLeadData', 'transcriptRecords', 'notes', 'intakeRecord', 'domainSpecialistDraft'],
      logEvents: ['tool.proposal.create_package.requested', 'tool.proposal.create_package.completed'],
    },
    executor: async (input) =>
      createProposalPackage({
        crmLeadData: input.crmLeadData,
        transcriptRecords: input.transcriptRecords as any,
        notes: input.notes as any,
        offerTemplate: input.offerTemplate as any,
        intakeRecord: input.intakeRecord as any,
        domainSpecialistDraft: input.domainSpecialistDraft as any,
        createdAt: compactString(input.createdAt) || undefined,
        packageId: compactString(input.packageId) || undefined,
      }),
  },
  {
    name: 'proposal.create_review_script',
    description: 'Create an internal proposal review call script for Jordan. Internal-only and not approved for external send.',
    inputSchema: objectSchema(
      { proposal: proposalRecordJsonSchema, reviewCall: proposalReviewCallJsonSchema, opener: stringSchema('Optional approved opener.'), scriptId: stringSchema('Optional script ID.'), metadata: genericObjectJsonSchema },
      ['proposal'],
    ),
    parameters: z.object({
      proposal: ProposalRecordSchema,
      reviewCall: z.object({}).passthrough().optional(),
      opener: z.string().default(''),
      scriptId: z.string().default(''),
      metadata: z.record(z.string(), z.unknown()).default({}),
    }),
    scopes: ['runtime.proposal.write'],
    riskLevel: 'write',
    humanApprovalRequired: false,
    audit: {
      category: 'proposal',
      action: 'create_review_script',
      resourceType: 'proposal_review_script',
      resourceIdField: 'proposal.id',
      sensitiveFields: ['proposal', 'reviewCall', 'opener'],
      logEvents: ['tool.proposal.create_review_script.requested', 'tool.proposal.create_review_script.completed'],
    },
    executor: async (input) => createProposalReviewScript(input),
  },
  {
    name: 'proposal.check_review_call_gate',
    description: 'Check proposal review call guardrails and create the internal review-call record. Scheduling remains a separate approval-gated action.',
    inputSchema: objectSchema(
      {
        proposal: proposalRecordJsonSchema,
        createdAt: stringSchema('Optional gate check timestamp.'),
        callId: stringSchema('Optional review call ID.'),
        clientMessage: stringSchema('Candidate client-facing message.'),
        mainClose: stringSchema('Candidate main close.'),
        externalFullProposalEmail: { type: 'boolean', description: 'Whether the requested action is to email the full proposal externally.' },
        scheduleRequest: { type: 'object', additionalProperties: true, description: 'Optional requested scheduling details; does not schedule by itself.' },
        notes: stringSchema('Optional internal notes.'),
      },
      ['proposal'],
    ),
    parameters: z.object({
      proposal: ProposalRecordSchema,
      createdAt: z.string().default(''),
      callId: z.string().default(''),
      clientMessage: z.string().default(''),
      mainClose: z.string().default(''),
      externalFullProposalEmail: z.boolean().default(false),
      scheduleRequest: z.object({}).passthrough().optional(),
      notes: z.string().default(''),
    }),
    scopes: ['runtime.proposal.read'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'proposal',
      action: 'check_review_call_gate',
      resourceType: 'proposal_review_call_gate',
      resourceIdField: 'proposal.id',
      sensitiveFields: ['proposal', 'clientMessage', 'mainClose', 'scheduleRequest', 'notes'],
      logEvents: ['tool.proposal.check_review_call_gate.requested', 'tool.proposal.check_review_call_gate.completed'],
    },
    executor: async (input) =>
      createProposalReviewCallGate({
        proposal: input.proposal,
        createdAt: compactString(input.createdAt) || undefined,
        callId: compactString(input.callId) || undefined,
        clientMessage: input.clientMessage,
        mainClose: input.mainClose,
        externalFullProposalEmail: input.externalFullProposalEmail,
        scheduleRequest: input.scheduleRequest as any,
        notes: input.notes,
      }),
  },
  {
    name: 'proposal.schedule_review_call',
    description: 'Schedule an approved proposal review call through the configured calendar provider adapter.',
    inputSchema: objectSchema(
      {
        calendarId: stringSchema('Calendar identifier; defaults to primary when omitted.'),
        summary: stringSchema('Event title.'),
        description: stringSchema('Event notes or agenda.'),
        start: stringSchema('ISO-8601 start time.'),
        end: stringSchema('ISO-8601 end time.'),
        attendees: stringArraySchema('Attendee email addresses.'),
        proposalId: stringSchema('Proposal ID linked to this review call.'),
        reviewCallId: stringSchema('Review call ID linked to this event.'),
        confirmedByUser: approvalBooleanSchema,
        approvalNote: approvalNoteSchema,
      },
      ['summary', 'start', 'end'],
    ),
    parameters: z.object({
      calendarId: z.string().default('primary'),
      summary: z.string().min(1),
      description: z.string().default(''),
      start: z.string().min(1),
      end: z.string().min(1),
      attendees: z.array(z.string().email()).default([]),
      proposalId: z.string().default(''),
      reviewCallId: z.string().default(''),
      confirmedByUser: z.boolean().default(false),
      approvalNote: z.string().default(''),
    }),
    scopes: ['runtime.proposal.write', 'https://www.googleapis.com/auth/calendar.events'],
    riskLevel: 'write',
    humanApprovalRequired: true,
    audit: {
      category: 'proposal',
      action: 'schedule_review_call',
      resourceType: 'calendar_event',
      resourceIdField: 'reviewCallId',
      sensitiveFields: ['summary', 'description', 'attendees', 'proposalId', 'reviewCallId'],
      logEvents: ['tool.proposal.schedule_review_call.approval_requested', 'tool.proposal.schedule_review_call.completed'],
    },
    executor: async (input) => createCalendarEvent(input),
  },
  {
    name: 'closing.capture_close',
    description: 'Capture Jordan-approved closed-won context and create internal client/project/kickoff memory records. Does not send externally or schedule anything.',
    inputSchema: objectSchema({
      leadId: stringSchema('Closed lead ID.'),
      proposalId: stringSchema('Approved proposal ID.'),
      jordanCloseNote: stringSchema('Jordan close note.'),
      movingForwardFeeling: stringSchema('Client answer about how they feel moving forward.'),
      confidenceLevel: numberSchema('Close confidence from 0 to 100.', { minimum: 0, maximum: 100 }),
      concerns: stringArraySchema('Captured concerns.'),
      agreedNextStep: stringSchema('Agreed next step.'),
      sessionId: stringSchema('Optional session ID.'),
      clientName: stringSchema('Optional client name.'),
      clientEmail: stringSchema('Optional client email.'),
      company: stringSchema('Optional company.'),
      projectName: stringSchema('Optional project name.'),
      assignedSpecialist: stringSchema('Optional assigned specialist.'),
      firstWinTarget: stringSchema('Optional first win target.'),
      closedAt: stringSchema('Optional close timestamp.'),
      memoryScope: stringSchema('Optional memory scope.'),
      metadata: genericObjectJsonSchema,
    }, ['leadId', 'proposalId', 'jordanCloseNote', 'movingForwardFeeling', 'confidenceLevel', 'agreedNextStep']),
    parameters: z.object({
      leadId: z.string().min(1),
      proposalId: z.string().min(1),
      jordanCloseNote: z.string().min(1),
      movingForwardFeeling: z.string().min(1),
      confidenceLevel: z.number().min(0).max(100),
      concerns: z.array(z.string()).default([]),
      agreedNextStep: z.string().min(1),
      sessionId: z.string().default(''),
      clientName: z.string().default(''),
      clientEmail: z.string().default(''),
      company: z.string().default(''),
      projectName: z.string().default(''),
      assignedSpecialist: z.string().default(''),
      firstWinTarget: z.string().default(''),
      closedAt: z.string().default(''),
      memoryScope: z.string().default(''),
      metadata: z.record(z.string(), z.unknown()).default({}),
    }),
    scopes: ['runtime.closing.write', 'runtime.memory.write'],
    riskLevel: 'write',
    humanApprovalRequired: false,
    audit: {
      category: 'closing',
      action: 'capture_close',
      resourceType: 'closed_won_context',
      resourceIdField: 'proposalId',
      sensitiveFields: ['jordanCloseNote', 'movingForwardFeeling', 'concerns', 'clientName', 'clientEmail', 'company'],
      logEvents: ['tool.closing.capture_close.requested', 'tool.closing.capture_close.completed'],
    },
    executor: async (input) => captureClose(input, { memoryScope: compactString(input.memoryScope) || undefined }),
  },
  {
    name: 'closing.create_client_project',
    description: 'Create internal client and project records from approved closing context. Does not send externally or schedule anything.',
    inputSchema: objectSchema({
      clientId: stringSchema('Optional client ID.'),
      projectId: stringSchema('Optional project ID.'),
      leadId: stringSchema('Optional source lead ID.'),
      proposalId: stringSchema('Optional source proposal ID.'),
      sessionId: stringSchema('Optional session ID.'),
      clientName: stringSchema('Client name.'),
      clientEmail: stringSchema('Client email.'),
      company: stringSchema('Company.'),
      projectName: stringSchema('Project name.'),
      status: stringSchema('Internal status.'),
      assignedSpecialist: stringSchema('Assigned specialist.'),
      firstWinTarget: stringSchema('First win target.'),
      concerns: stringArraySchema('Known concerns.'),
      notes: stringSchema('Internal notes.'),
      metadata: genericObjectJsonSchema,
    }),
    parameters: z.object({
      clientId: z.string().default(''),
      projectId: z.string().default(''),
      leadId: z.string().default(''),
      proposalId: z.string().default(''),
      sessionId: z.string().default(''),
      clientName: z.string().default(''),
      clientEmail: z.string().default(''),
      company: z.string().default(''),
      projectName: z.string().default(''),
      status: z.string().default('active'),
      assignedSpecialist: z.string().default(''),
      firstWinTarget: z.string().default(''),
      concerns: z.array(z.string()).default([]),
      notes: z.string().default(''),
      metadata: z.record(z.string(), z.unknown()).default({}),
    }),
    scopes: ['runtime.closing.write'],
    riskLevel: 'write',
    humanApprovalRequired: false,
    audit: {
      category: 'closing',
      action: 'create_client_project',
      resourceType: 'client_project',
      resourceIdField: 'clientId',
      sensitiveFields: ['clientName', 'clientEmail', 'company', 'projectName', 'concerns', 'notes'],
      logEvents: ['tool.closing.create_client_project.requested', 'tool.closing.create_client_project.completed'],
    },
    executor: async (input) => createClientProject(input),
  },
  {
    name: 'closing.create_first_win_plan',
    description: 'Create an internal first-win plan from intake/proposal/classification context. Does not send externally or schedule anything.',
    inputSchema: objectSchema({ intakeRecord: genericObjectJsonSchema, proposalRecord: genericObjectJsonSchema, classification: genericObjectJsonSchema, domainClassification: genericObjectJsonSchema, approvedAt: stringSchema('Optional approval timestamp.'), planId: stringSchema('Optional plan ID.') }),
    parameters: z.object({ intakeRecord: z.object({}).passthrough().optional(), proposalRecord: z.object({}).passthrough().optional(), classification: z.object({}).passthrough().optional(), domainClassification: z.object({}).passthrough().optional(), approvedAt: z.string().default(''), planId: z.string().default('') }),
    scopes: ['runtime.closing.write'],
    riskLevel: 'write',
    humanApprovalRequired: false,
    audit: {
      category: 'closing',
      action: 'create_first_win_plan',
      resourceType: 'first_win_plan',
      resourceIdField: 'planId',
      sensitiveFields: ['intakeRecord', 'proposalRecord', 'classification', 'domainClassification'],
      logEvents: ['tool.closing.create_first_win_plan.requested', 'tool.closing.create_first_win_plan.completed'],
    },
    executor: async (input) => createFirstWinPlan({ ...input, approvedAt: compactString(input.approvedAt) || undefined, planId: compactString(input.planId) || undefined } as any),
  },
  {
    name: 'closing.draft_welcome_sequence',
    description: 'Draft a welcome sequence for Jordan review. Draft only; external sends must use approval-gated outreach/Gmail tools.',
    inputSchema: objectSchema({ clientRecord: genericObjectJsonSchema, projectRecord: genericObjectJsonSchema, clientName: stringSchema('Client name.'), company: stringSchema('Company.'), projectName: stringSchema('Project name.'), agreedNextStep: stringSchema('Agreed next step.'), firstWinTarget: stringSchema('First win target.'), assignedSpecialist: stringSchema('Assigned specialist.'), buyerConfidenceSignals: stringArraySchema('Buyer confidence signals.'), knownConcerns: stringArraySchema('Known concerns.'), kickoffExpectations: stringArraySchema('Kickoff expectations.'), firstUsefulArtifact: stringSchema('First useful artifact.'), firstUsefulArtifactDueAt: stringSchema('First useful artifact due timestamp.'), nextStepOwner: stringSchema('Next step owner.'), nextStepDueAt: stringSchema('Next step due timestamp.'), jordanApprovalNote: stringSchema('Jordan approval note.'), createdAt: stringSchema('Optional created timestamp.'), sequenceId: stringSchema('Optional sequence ID.'), metadata: genericObjectJsonSchema }),
    parameters: z.object({ clientRecord: z.object({}).passthrough().optional(), projectRecord: z.object({}).passthrough().optional(), clientName: z.string().default(''), company: z.string().default(''), projectName: z.string().default(''), agreedNextStep: z.string().default(''), firstWinTarget: z.string().default(''), assignedSpecialist: z.string().default(''), buyerConfidenceSignals: z.array(z.string()).default([]), knownConcerns: z.array(z.string()).default([]), kickoffExpectations: z.array(z.string()).default([]), firstUsefulArtifact: z.string().default(''), firstUsefulArtifactDueAt: z.string().default(''), nextStepOwner: z.string().default(''), nextStepDueAt: z.string().default(''), jordanApprovalNote: z.string().default(''), createdAt: z.string().default(''), sequenceId: z.string().default(''), metadata: z.record(z.string(), z.unknown()).default({}) }),
    scopes: ['runtime.closing.write'],
    riskLevel: 'write',
    humanApprovalRequired: false,
    audit: {
      category: 'closing',
      action: 'draft_welcome_sequence',
      resourceType: 'welcome_sequence_draft',
      resourceIdField: 'sequenceId',
      sensitiveFields: ['clientRecord', 'projectRecord', 'clientName', 'company', 'buyerConfidenceSignals', 'knownConcerns'],
      logEvents: ['tool.closing.draft_welcome_sequence.requested', 'tool.closing.draft_welcome_sequence.completed'],
    },
    executor: async (input) => createWelcomeSequence(input),
  },
  {
    name: 'closing.create_delivery_tasks',
    description: 'Create internal delivery tasks from an approved first-win plan. Client-visible release remains blocked until review approval; no external send or scheduling occurs.',
    inputSchema: objectSchema({ projectRecord: genericObjectJsonSchema, firstWinPlan: genericObjectJsonSchema, assignedSpecialist: stringSchema('Assigned specialist.'), deadlineTargetHours: numberSchema('Deadline target hours between 24 and 48.', { minimum: 24, maximum: 48 }), createdAt: stringSchema('Optional created timestamp.') }, ['projectRecord', 'firstWinPlan', 'assignedSpecialist']),
    parameters: z.object({ projectRecord: ProjectRecordSchema, firstWinPlan: z.object({}).passthrough(), assignedSpecialist: z.string().min(1), deadlineTargetHours: z.number().min(24).max(48).optional(), createdAt: z.string().default('') }),
    scopes: ['runtime.closing.write'],
    riskLevel: 'write',
    humanApprovalRequired: false,
    audit: {
      category: 'closing',
      action: 'create_delivery_tasks',
      resourceType: 'internal_delivery_task_batch',
      resourceIdField: 'projectRecord.id',
      sensitiveFields: ['projectRecord', 'firstWinPlan'],
      logEvents: ['tool.closing.create_delivery_tasks.requested', 'tool.closing.create_delivery_tasks.completed'],
    },
    executor: async (input) => createDeliveryTasks({ ...input, createdAt: compactString(input.createdAt) || undefined } as any),
  },
  {
    name: 'voice.transcribe_audio',
    description: 'Transcribe a previously uploaded audio artifact.',
    inputSchema: objectSchema({ audioId: stringSchema('Runtime audio artifact ID.'), language: stringSchema('BCP-47 language hint.') }, ['audioId']),
    parameters: z.object({ audioId: z.string().min(1), language: z.string().default('') }),
    scopes: ['voice.transcription.create'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'voice',
      action: 'transcribe_audio',
      resourceType: 'audio_artifact',
      resourceIdField: 'audioId',
      sensitiveFields: ['audioId'],
      logEvents: ['tool.voice.transcribe_audio.requested', 'tool.voice.transcribe_audio.completed'],
    },
    executor: unavailableProvider('voice', 'voice'),
  },
  {
    name: 'voice.speak_text',
    description: 'Render text to speech for a selected voice profile.',
    inputSchema: objectSchema({ text: stringSchema('Text to render.'), voice: stringSchema('Voice profile key.'), delivery: stringSchema('Delivery mode: preview, call, or stream.'), confirmedByUser: approvalBooleanSchema, approvalNote: approvalNoteSchema }, ['text']),
    parameters: z.object({ text: z.string().min(1), voice: z.string().default('default'), delivery: z.enum(['preview', 'call', 'stream']).default('preview'), confirmedByUser: z.boolean().default(false), approvalNote: z.string().default('') }),
    scopes: ['voice.speech.create'],
    riskLevel: 'external_send',
    humanApprovalRequired: true,
    audit: {
      category: 'voice',
      action: 'speak_text',
      resourceType: 'speech_render',
      sensitiveFields: ['text', 'voice', 'delivery'],
      logEvents: ['tool.voice.speak_text.approval_requested', 'tool.voice.speak_text.completed'],
    },
    executor: unavailableProvider('voice', 'voice'),
  },
  {
    name: 'memory.remember',
    description: `Persist durable backend memory for the current session. Supported scopes: ${durableMemoryScopes.join(', ')}.`,
    inputSchema: objectSchema(
      {
        text: stringSchema('Memory text to store.'),
        scope: stringSchema(`Durable memory scope: ${durableMemoryScopes.join(', ')}.`),
        tags: stringArraySchema('Memory tags.'),
        importance: numberSchema('Importance from 0 to 1.', { minimum: 0, maximum: 1 }),
      },
      ['text'],
    ),
    parameters: z.object({
      text: z.string().min(1),
      scope: z.enum(durableMemoryScopes).default('conversation_summary'),
      tags: z.array(z.string()).default([]),
      importance: z.number().min(0).max(1).default(0.5),
    }),
    scopes: ['runtime.memory.write'],
    riskLevel: 'write',
    humanApprovalRequired: false,
    audit: {
      category: 'memory',
      action: 'remember',
      resourceType: 'memory_reference',
      sensitiveFields: ['text', 'tags'],
      logEvents: ['tool.memory.remember.requested', 'tool.memory.remember.completed'],
    },
    executor: async (input, context) => remember(context.sessionId, input.text, { scope: input.scope, tags: input.tags, importance: input.importance }),
  },
  {
    name: 'memory.list',
    description: 'List recent durable backend memory references available to Elora.',
    inputSchema: objectSchema({ limit: numberSchema('Maximum memories.', { minimum: 1, maximum: 25 }), scopes: stringArraySchema('Optional memory scopes to include.') }),
    parameters: z.object({ limit: z.number().int().min(1).max(25).default(10), scopes: z.array(z.enum(durableMemoryScopes)).default([]) }),
    scopes: ['runtime.memory.read'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'memory',
      action: 'list',
      resourceType: 'memory_reference',
      logEvents: ['tool.memory.list.requested', 'tool.memory.list.completed'],
    },
    executor: async (input, context) => listMemories(context.sessionId, input.limit, input.scopes),
  },
  {
    name: 'memory.retrieve',
    description: 'Retrieve relevant durable backend memories by keyword scoring. Vector retrieval can be added behind this interface later.',
    inputSchema: objectSchema({ query: stringSchema('Search query.'), limit: numberSchema('Maximum memories.', { minimum: 1, maximum: 25 }), scopes: stringArraySchema('Optional memory scopes to include.') }, ['query']),
    parameters: z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(25).default(10), scopes: z.array(z.enum(durableMemoryScopes)).default([]) }),
    scopes: ['runtime.memory.read'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'memory',
      action: 'retrieve',
      resourceType: 'memory_reference',
      sensitiveFields: ['query'],
      logEvents: ['tool.memory.retrieve.requested', 'tool.memory.retrieve.completed'],
    },
    executor: async (input, context) => retrieveMemories({ sessionId: context.sessionId, query: input.query, limit: input.limit, scopes: input.scopes }),
  },
  {
    name: 'memory.summarize',
    description: 'Build a concise extractive summary from relevant durable backend memories.',
    inputSchema: objectSchema({ query: stringSchema('Optional summary focus.'), limit: numberSchema('Maximum source memories.', { minimum: 1, maximum: 25 }), scopes: stringArraySchema('Optional memory scopes to include.') }),
    parameters: z.object({ query: z.string().default(''), limit: z.number().int().min(1).max(25).default(12), scopes: z.array(z.enum(durableMemoryScopes)).default([]) }),
    scopes: ['runtime.memory.read'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'memory',
      action: 'summarize',
      resourceType: 'memory_reference',
      sensitiveFields: ['query'],
      logEvents: ['tool.memory.summarize.requested', 'tool.memory.summarize.completed'],
    },
    executor: async (input, context) => summarizeMemories({ sessionId: context.sessionId, query: input.query, limit: input.limit, scopes: input.scopes }),
  },


  {
    name: 'observation.recommend',
    description: 'Store an auditable proactive-observation recommendation linked to relevant files, tasks, receipts, memories, or other internal evidence. This creates an internal draft/recommendation only and must not edit repo files, send externally, or write providers.',
    inputSchema: objectSchema(
      {
        title: stringSchema('Short recommendation title.'),
        summary: stringSchema('Concise finding summary.'),
        rationale: stringSchema('Why ELORA/CORE recommends this action, grounded in inspected evidence.'),
        recommendedAction: stringSchema('Recommended next step for a human or later approved execution.'),
        affectedPaths: stringArraySchema('Workspace paths affected by the recommendation; these are evidence/review targets only and are never modified by observation mode.'),
        confidence: numberSchema('Recommendation confidence from 0 to 1.', { minimum: 0, maximum: 1 }),
        risk: stringSchema('Risk level for the recommended action: low, medium, or high.'),
        links: {
          type: 'array',
          description: 'Auditable links to relevant files, tasks, receipts, memories, or other evidence.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: { type: stringSchema('file, task, receipt, memory, or other.'), id: stringSchema('Linked item path or identifier.'), label: stringSchema('Optional display label.') },
            required: ['type', 'id'],
          },
        },
        rank: numberSchema('Optional recommendation rank; lower numbers are reviewed first.', { minimum: 1, maximum: 100 }),
        draft: stringSchema('Optional internal draft content; never sent externally.'),
        draftPatchProposal: stringSchema('Optional patch proposal text. Level 3 may draft this only; applying it requires a separate approval-gated code tool.'),
      },
      ['title', 'summary', 'rationale', 'recommendedAction', 'affectedPaths', 'confidence', 'risk'],
    ),
    parameters: z.object({
      title: z.string().min(1),
      summary: z.string().min(1),
      rationale: z.string().min(1),
      recommendedAction: z.string().min(1),
      affectedPaths: z.array(z.string().min(1)).default([]),
      confidence: z.number().min(0).max(1).default(0.5),
      risk: z.enum(['low', 'medium', 'high']).default('medium'),
      links: z.array(z.object({ type: z.enum(['file', 'task', 'receipt', 'memory', 'other']), id: z.string().min(1), label: z.string().optional() })).default([]),
      rank: z.number().int().min(1).max(100).optional(),
      draft: z.string().optional(),
      draftPatchProposal: z.string().optional(),
    }),
    scopes: ['runtime.observation.recommend'],
    riskLevel: 'write',
    humanApprovalRequired: false,
    audit: {
      category: 'observation',
      action: 'recommend',
      resourceType: 'observation_recommendation',
      resourceIdField: 'title',
      sensitiveFields: ['summary', 'rationale', 'recommendedAction', 'draft', 'draftPatchProposal'],
      logEvents: ['tool.observation.recommend.requested', 'tool.observation.recommend.completed'],
    },
    executor: createObservationRecommendation,
  },
  {
    name: 'code.read',
    description: 'Read a UTF-8 text file from the sandboxed Nexora workspace root. Rejects absolute paths, parent traversal, and symlink escapes.',
    inputSchema: objectSchema({ path: relativePathSchema, maxBytes: numberSchema('Maximum bytes to read.', { minimum: 1, maximum: 200000 }) }, ['path']),
    parameters: z.object({ path: z.string().min(1), maxBytes: z.number().int().min(1).max(200000).default(20000) }),
    scopes: ['runtime.code.read'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'code',
      action: 'read',
      resourceType: 'workspace_file',
      resourceIdField: 'path',
      sensitiveFields: ['path'],
      logEvents: ['tool.code.read.requested', 'tool.code.read.completed'],
    },
    executor: codeRead,
  },
  {
    name: 'code.search',
    description: 'Search text files inside the sandboxed Nexora workspace root with bounded results and ignored dependency/build directories.',
    inputSchema: objectSchema({ query: stringSchema('Literal text or regular expression to search for.'), path: relativePathSchema, isRegex: { type: 'boolean', description: 'Treat query as a JavaScript regular expression.' }, maxResults: numberSchema('Maximum matches.', { minimum: 1, maximum: 200 }) }, ['query']),
    parameters: z.object({ query: z.string().min(1), path: z.string().default('.'), isRegex: z.boolean().default(false), maxResults: z.number().int().min(1).max(200).default(50) }),
    scopes: ['runtime.code.search'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'code',
      action: 'search',
      resourceType: 'workspace_search',
      sensitiveFields: ['query', 'path'],
      logEvents: ['tool.code.search.requested', 'tool.code.search.completed'],
    },
    executor: codeSearch,
  },

  {
    name: 'code.tree',
    description: 'Return a bounded JSON tree of workspace files and directories, ignoring dependency/build/runtime output folders. Read-only and does not require approval.',
    inputSchema: objectSchema({ path: relativePathSchema, maxFiles: numberSchema('Maximum files to scan.', { minimum: 1, maximum: 2000 }), maxItems: numberSchema('Maximum tree items to return.', { minimum: 1, maximum: 500 }), maxDepth: numberSchema('Maximum directory depth to return.', { minimum: 1, maximum: 12 }) }),
    parameters: z.object({ path: z.string().default('.'), maxFiles: z.number().int().min(1).max(2000).default(2000), maxItems: z.number().int().min(1).max(500).default(200), maxDepth: z.number().int().min(1).max(12).default(4) }),
    scopes: ['runtime.code.read'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: { category: 'code', action: 'tree', resourceType: 'workspace_tree', resourceIdField: 'path', sensitiveFields: ['path'], logEvents: ['tool.code.tree.requested', 'tool.code.tree.completed'] },
    executor: codeTree,
  },
  {
    name: 'code.project_summary',
    description: 'Return bounded structured project metrics by top-level path and file extension, ignoring dependency/build/runtime output folders.',
    inputSchema: objectSchema({ path: relativePathSchema, maxFiles: numberSchema('Maximum files to scan.', { minimum: 1, maximum: 2000 }), maxItems: numberSchema('Maximum package paths to return.', { minimum: 1, maximum: 500 }) }),
    parameters: z.object({ path: z.string().default('.'), maxFiles: z.number().int().min(1).max(2000).default(2000), maxItems: z.number().int().min(1).max(500).default(100) }),
    scopes: ['runtime.code.read'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: { category: 'code', action: 'project_summary', resourceType: 'workspace_summary', resourceIdField: 'path', sensitiveFields: ['path'], logEvents: ['tool.code.project_summary.requested', 'tool.code.project_summary.completed'] },
    executor: codeProjectSummary,
  },
  {
    name: 'code.package_scripts',
    description: 'Return package.json scripts as structured JSON from bounded workspace package manifests.',
    inputSchema: objectSchema({ path: relativePathSchema, maxFiles: numberSchema('Maximum files to scan.', { minimum: 1, maximum: 2000 }), maxItems: numberSchema('Maximum package manifests to return.', { minimum: 1, maximum: 500 }) }),
    parameters: z.object({ path: z.string().default('.'), maxFiles: z.number().int().min(1).max(2000).default(2000), maxItems: z.number().int().min(1).max(500).default(50) }),
    scopes: ['runtime.code.read'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: { category: 'code', action: 'package_scripts', resourceType: 'package_manifest', resourceIdField: 'path', sensitiveFields: ['path'], logEvents: ['tool.code.package_scripts.requested', 'tool.code.package_scripts.completed'] },
    executor: codePackageScripts,
  },
  {
    name: 'code.dependency_summary',
    description: 'Return package dependency sections as structured JSON from bounded workspace package manifests.',
    inputSchema: objectSchema({ path: relativePathSchema, maxFiles: numberSchema('Maximum files to scan.', { minimum: 1, maximum: 2000 }), maxItems: numberSchema('Maximum package manifests to return.', { minimum: 1, maximum: 500 }) }),
    parameters: z.object({ path: z.string().default('.'), maxFiles: z.number().int().min(1).max(2000).default(2000), maxItems: z.number().int().min(1).max(500).default(50) }),
    scopes: ['runtime.code.read'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: { category: 'code', action: 'dependency_summary', resourceType: 'package_manifest', resourceIdField: 'path', sensitiveFields: ['path'], logEvents: ['tool.code.dependency_summary.requested', 'tool.code.dependency_summary.completed'] },
    executor: codeDependencySummary,
  },
  {
    name: 'code.find_entrypoints',
    description: 'Find likely project entrypoints from package manifest fields and conventional entrypoint filenames with bounded output.',
    inputSchema: objectSchema({ path: relativePathSchema, maxFiles: numberSchema('Maximum files to scan.', { minimum: 1, maximum: 2000 }), maxItems: numberSchema('Maximum entrypoint records to return.', { minimum: 1, maximum: 500 }) }),
    parameters: z.object({ path: z.string().default('.'), maxFiles: z.number().int().min(1).max(2000).default(2000), maxItems: z.number().int().min(1).max(500).default(100) }),
    scopes: ['runtime.code.read'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: { category: 'code', action: 'find_entrypoints', resourceType: 'workspace_entrypoint', resourceIdField: 'path', sensitiveFields: ['path'], logEvents: ['tool.code.find_entrypoints.requested', 'tool.code.find_entrypoints.completed'] },
    executor: codeFindEntrypoints,
  },
  {
    name: 'code.find_configs',
    description: 'Find common project/configuration files with bounded structured JSON output.',
    inputSchema: objectSchema({ path: relativePathSchema, maxFiles: numberSchema('Maximum files to scan.', { minimum: 1, maximum: 2000 }), maxItems: numberSchema('Maximum config files to return.', { minimum: 1, maximum: 500 }) }),
    parameters: z.object({ path: z.string().default('.'), maxFiles: z.number().int().min(1).max(2000).default(2000), maxItems: z.number().int().min(1).max(500).default(200) }),
    scopes: ['runtime.code.read'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: { category: 'code', action: 'find_configs', resourceType: 'workspace_config', resourceIdField: 'path', sensitiveFields: ['path'], logEvents: ['tool.code.find_configs.requested', 'tool.code.find_configs.completed'] },
    executor: codeFindConfigs,
  },
  {
    name: 'code.edit',
    description: 'Overwrite or append to a file inside the Nexora workspace root after explicit approval. Supports expectedSha256 optimistic locking.',
    inputSchema: objectSchema({ path: relativePathSchema, content: stringSchema('UTF-8 content to write.'), mode: stringSchema('overwrite or append.'), expectedSha256: stringSchema('Optional sha256 of existing content.'), confirmedByUser: approvalBooleanSchema, approvalNote: approvalNoteSchema }, ['path', 'content']),
    parameters: z.object({ path: z.string().min(1), content: z.string(), mode: z.enum(['overwrite', 'append']).default('overwrite'), expectedSha256: z.string().default(''), confirmedByUser: z.boolean().default(false), approvalNote: z.string().default('') }),
    scopes: ['runtime.code.write'],
    riskLevel: 'write',
    humanApprovalRequired: true,
    audit: {
      category: 'code',
      action: 'edit',
      resourceType: 'workspace_file',
      resourceIdField: 'path',
      sensitiveFields: ['path', 'content'],
      logEvents: ['tool.code.edit.approval_requested', 'tool.code.edit.completed'],
    },
    executor: codeEdit,
  },
  {
    name: 'code.create_file',
    description: 'Create a new UTF-8 file inside the Nexora workspace root after explicit approval. Rejects absolute paths, parent traversal, and symlink escapes.',
    inputSchema: objectSchema({ path: relativePathSchema, content: stringSchema('UTF-8 content to write.'), expectedSha256: stringSchema('Optional sha256 expected for a non-existent/empty file guard.'), confirmedByUser: approvalBooleanSchema, approvalNote: approvalNoteSchema }, ['path', 'content']),
    parameters: z.object({ path: z.string().min(1), content: z.string(), expectedSha256: z.string().default(''), confirmedByUser: z.boolean().default(false), approvalNote: z.string().default('') }),
    scopes: ['runtime.code.write'],
    riskLevel: 'write',
    humanApprovalRequired: true,
    audit: { category: 'code', action: 'create_file', resourceType: 'workspace_file', resourceIdField: 'path', sensitiveFields: ['path', 'content'], logEvents: ['tool.code.create_file.approval_requested', 'tool.code.create_file.completed'] },
    executor: codeCreateFile,
  },
  {
    name: 'code.patch_file',
    description: 'Patch a UTF-8 file by replacing literal text after explicit approval. Supports expectedSha256 optimistic locking.',
    inputSchema: objectSchema({ path: relativePathSchema, search: stringSchema('Literal text to replace.'), replace: stringSchema('Replacement text.'), replaceAll: { type: 'boolean', description: 'Replace all matches instead of requiring a single match.' }, expectedSha256: stringSchema('Optional sha256 of existing content.'), confirmedByUser: approvalBooleanSchema, approvalNote: approvalNoteSchema }, ['path', 'search', 'replace']),
    parameters: z.object({ path: z.string().min(1), search: z.string().min(1), replace: z.string(), replaceAll: z.boolean().default(false), expectedSha256: z.string().default(''), confirmedByUser: z.boolean().default(false), approvalNote: z.string().default('') }),
    scopes: ['runtime.code.write'],
    riskLevel: 'write',
    humanApprovalRequired: true,
    audit: { category: 'code', action: 'patch_file', resourceType: 'workspace_file', resourceIdField: 'path', sensitiveFields: ['path', 'search', 'replace'], logEvents: ['tool.code.patch_file.approval_requested', 'tool.code.patch_file.completed'] },
    executor: codePatchFile,
  },
  {
    name: 'code.delete_file',
    description: 'Trash a file inside the Nexora workspace root after explicit approval. Defaults to .runtime-data/trash quarantine; permanent deletion requires permanentApprovalNote. Refuses .git, .env files, lockfiles, and package manifests unless allowHighRiskDelete and highRiskApprovalNote are supplied.',
    inputSchema: objectSchema({ path: relativePathSchema, expectedSha256: stringSchema('Optional sha256 of existing content.'), permanent: { type: 'boolean', description: 'Permanently delete instead of moving to runtime trash. Requires permanentApprovalNote.' }, permanentApprovalNote: stringSchema('Separate approval note required when permanent is true.'), allowHighRiskDelete: { type: 'boolean', description: 'Permit deletion of .git, .env files, lockfiles, or package manifests only with highRiskApprovalNote.' }, highRiskApprovalNote: stringSchema('Separate high-risk approval note required when allowHighRiskDelete is true.'), confirmedByUser: approvalBooleanSchema, approvalNote: approvalNoteSchema }, ['path']),
    parameters: z.object({ path: z.string().min(1), expectedSha256: z.string().default(''), permanent: z.boolean().default(false), permanentApprovalNote: z.string().default(''), allowHighRiskDelete: z.boolean().default(false), highRiskApprovalNote: z.string().default(''), confirmedByUser: z.boolean().default(false), approvalNote: z.string().default('') }),
    scopes: ['runtime.code.write'],
    riskLevel: 'write',
    humanApprovalRequired: true,
    audit: { category: 'code', action: 'delete_file', resourceType: 'workspace_file', resourceIdField: 'path', sensitiveFields: ['path', 'permanentApprovalNote', 'highRiskApprovalNote'], logEvents: ['tool.code.delete_file.approval_requested', 'tool.code.delete_file.completed'] },
    executor: codeDeleteFile,
  },
  {
    name: 'code.delete_path',
    description: 'Explicitly trash or permanently delete a bounded file/directory path after approval. Directory deletes are capped and treated as code_execution risk; defaults to .runtime-data/trash quarantine.',
    inputSchema: objectSchema({ path: relativePathSchema, permanent: { type: 'boolean', description: 'Permanently delete instead of moving to runtime trash. Requires permanentApprovalNote.' }, permanentApprovalNote: stringSchema('Separate approval note required when permanent is true.'), allowHighRiskDelete: { type: 'boolean', description: 'Permit deletion of .git, .env files, lockfiles, or package manifests only with highRiskApprovalNote.' }, highRiskApprovalNote: stringSchema('Separate high-risk approval note required when allowHighRiskDelete is true.'), confirmedByUser: approvalBooleanSchema, approvalNote: approvalNoteSchema }, ['path']),
    parameters: z.object({ path: z.string().min(1), permanent: z.boolean().default(false), permanentApprovalNote: z.string().default(''), allowHighRiskDelete: z.boolean().default(false), highRiskApprovalNote: z.string().default(''), confirmedByUser: z.boolean().default(false), approvalNote: z.string().default('') }),
    scopes: ['runtime.code.write', 'runtime.code.execute'],
    riskLevel: 'code_execution',
    humanApprovalRequired: true,
    audit: { category: 'code', action: 'delete_path', resourceType: 'workspace_path', resourceIdField: 'path', sensitiveFields: ['path', 'permanentApprovalNote', 'highRiskApprovalNote'], logEvents: ['tool.code.delete_path.approval_requested', 'tool.code.delete_path.completed'] },
    executor: codeDeletePath,
  },
  {
    name: 'code.move_path',
    description: 'Move a file or directory inside the Nexora workspace root after explicit approval. Rejects absolute paths, parent traversal, and symlinks.',
    inputSchema: objectSchema({ fromPath: relativePathSchema, toPath: relativePathSchema, overwrite: { type: 'boolean', description: 'Allow replacing an existing destination.' }, confirmedByUser: approvalBooleanSchema, approvalNote: approvalNoteSchema }, ['fromPath', 'toPath']),
    parameters: z.object({ fromPath: z.string().min(1), toPath: z.string().min(1), overwrite: z.boolean().default(false), confirmedByUser: z.boolean().default(false), approvalNote: z.string().default('') }),
    scopes: ['runtime.code.write'],
    riskLevel: 'write',
    humanApprovalRequired: true,
    audit: { category: 'code', action: 'move_path', resourceType: 'workspace_path', resourceIdField: 'fromPath', sensitiveFields: ['fromPath', 'toPath'], logEvents: ['tool.code.move_path.approval_requested', 'tool.code.move_path.completed'] },
    executor: codeMovePath,
  },
  {
    name: 'code.copy_path',
    description: 'Copy a file or directory inside the Nexora workspace root after explicit approval. Rejects absolute paths, parent traversal, and symlinks.',
    inputSchema: objectSchema({ fromPath: relativePathSchema, toPath: relativePathSchema, overwrite: { type: 'boolean', description: 'Allow replacing an existing destination.' }, confirmedByUser: approvalBooleanSchema, approvalNote: approvalNoteSchema }, ['fromPath', 'toPath']),
    parameters: z.object({ fromPath: z.string().min(1), toPath: z.string().min(1), overwrite: z.boolean().default(false), confirmedByUser: z.boolean().default(false), approvalNote: z.string().default('') }),
    scopes: ['runtime.code.write'],
    riskLevel: 'write',
    humanApprovalRequired: true,
    audit: { category: 'code', action: 'copy_path', resourceType: 'workspace_path', resourceIdField: 'fromPath', sensitiveFields: ['fromPath', 'toPath'], logEvents: ['tool.code.copy_path.approval_requested', 'tool.code.copy_path.completed'] },
    executor: codeCopyPath,
  },
  {
    name: 'code.mkdir',
    description: 'Create a directory inside the Nexora workspace root after explicit approval. Rejects absolute paths, parent traversal, and symlink escapes.',
    inputSchema: objectSchema({ path: relativePathSchema, confirmedByUser: approvalBooleanSchema, approvalNote: approvalNoteSchema }, ['path']),
    parameters: z.object({ path: z.string().min(1), confirmedByUser: z.boolean().default(false), approvalNote: z.string().default('') }),
    scopes: ['runtime.code.write'],
    riskLevel: 'write',
    humanApprovalRequired: true,
    audit: { category: 'code', action: 'mkdir', resourceType: 'workspace_directory', resourceIdField: 'path', sensitiveFields: ['path'], logEvents: ['tool.code.mkdir.approval_requested', 'tool.code.mkdir.completed'] },
    executor: codeMkdir,
  },
  {
    name: 'code.write_json',
    description: 'Serialize JSON to a file inside the Nexora workspace root after explicit approval. Supports expectedSha256 optimistic locking.',
    inputSchema: objectSchema({ path: relativePathSchema, data: genericObjectJsonSchema, space: numberSchema('JSON indentation spaces.', { minimum: 0, maximum: 10 }), expectedSha256: stringSchema('Optional sha256 of existing content.'), confirmedByUser: approvalBooleanSchema, approvalNote: approvalNoteSchema }, ['path', 'data']),
    parameters: z.object({ path: z.string().min(1), data: z.unknown(), space: z.number().int().min(0).max(10).default(2), expectedSha256: z.string().default(''), confirmedByUser: z.boolean().default(false), approvalNote: z.string().default('') }),
    scopes: ['runtime.code.write'],
    riskLevel: 'write',
    humanApprovalRequired: true,
    audit: { category: 'code', action: 'write_json', resourceType: 'workspace_file', resourceIdField: 'path', sensitiveFields: ['path', 'data'], logEvents: ['tool.code.write_json.approval_requested', 'tool.code.write_json.completed'] },
    executor: codeWriteJson,
  },
  {
    name: 'code.read_json',
    description: 'Read and parse a JSON file from the sandboxed Nexora workspace root. Rejects absolute paths, parent traversal, and symlink escapes.',
    inputSchema: objectSchema({ path: relativePathSchema, maxBytes: numberSchema('Maximum bytes to read.', { minimum: 1, maximum: 200000 }) }, ['path']),
    parameters: z.object({ path: z.string().min(1), maxBytes: z.number().int().min(1).max(200000).default(20000) }),
    scopes: ['runtime.code.read'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: { category: 'code', action: 'read_json', resourceType: 'workspace_file', resourceIdField: 'path', sensitiveFields: ['path'], logEvents: ['tool.code.read_json.requested', 'tool.code.read_json.completed'] },
    executor: codeReadJson,
  },
  {
    name: 'code.diff',
    description: 'Return git diff output for the sandboxed Nexora workspace root or a workspace-relative path.',
    inputSchema: objectSchema({ path: relativePathSchema }),
    parameters: z.object({ path: z.string().default('') }),
    scopes: ['runtime.code.diff'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'code',
      action: 'diff',
      resourceType: 'workspace_diff',
      resourceIdField: 'path',
      sensitiveFields: ['path'],
      logEvents: ['tool.code.diff.requested', 'tool.code.diff.completed'],
    },
    executor: codeDiff,
  },

  {
    name: 'code.git_status',
    description: 'Return lightweight git status information for the configured Nexora workspace root.',
    inputSchema: objectSchema({}),
    parameters: z.object({}),
    scopes: ['runtime.code.git_status'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'code',
      action: 'git_status',
      resourceType: 'workspace_status',
      logEvents: ['tool.code.git_status.requested', 'tool.code.git_status.completed'],
    },
    executor: codeGitStatus,
  },
  {
    name: 'code.git_diff',
    description: 'Return git diff output for the configured Nexora workspace root or a workspace-relative path.',
    inputSchema: objectSchema({ path: relativePathSchema }),
    parameters: z.object({ path: z.string().default('') }),
    scopes: ['runtime.code.git_diff'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'code',
      action: 'git_diff',
      resourceType: 'workspace_diff',
      resourceIdField: 'path',
      sensitiveFields: ['path'],
      logEvents: ['tool.code.git_diff.requested', 'tool.code.git_diff.completed'],
    },
    executor: codeGitDiff,
  },
  {
    name: 'code.git_log',
    description: 'Return recent git commit history for the configured Nexora workspace root or a workspace-relative path.',
    inputSchema: objectSchema({ maxCount: numberSchema('Maximum commits to return.', { minimum: 1, maximum: 100 }), path: relativePathSchema }),
    parameters: z.object({ maxCount: z.number().int().min(1).max(100).default(20), path: z.string().default('') }),
    scopes: ['runtime.code.git_log'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'code',
      action: 'git_log',
      resourceType: 'git_log',
      resourceIdField: 'path',
      sensitiveFields: ['path'],
      logEvents: ['tool.code.git_log.requested', 'tool.code.git_log.completed'],
    },
    executor: codeGitLog,
  },
  {
    name: 'code.git_restore_file',
    description: 'Restore a workspace-relative file from git after explicit user approval.',
    inputSchema: objectSchema({ path: relativePathSchema, confirmedByUser: approvalBooleanSchema, approvalNote: approvalNoteSchema }, ['path']),
    parameters: z.object({ path: z.string().min(1), confirmedByUser: z.boolean().default(false), approvalNote: z.string().default('') }),
    scopes: ['runtime.code.git_restore_file'],
    riskLevel: 'write',
    humanApprovalRequired: true,
    audit: {
      category: 'code',
      action: 'git_restore_file',
      resourceType: 'workspace_file',
      resourceIdField: 'path',
      sensitiveFields: ['path', 'approvalNote'],
      logEvents: ['tool.code.git_restore_file.approval_requested', 'tool.code.git_restore_file.completed'],
    },
    executor: codeGitRestoreFile,
  },
  {
    name: 'code.git_create_branch',
    description: 'Create a git branch in the configured Nexora workspace root after explicit user approval. Checks out the new branch by default.',
    inputSchema: objectSchema({ branch: stringSchema('Branch name to create.'), startPoint: stringSchema('Optional git start point.'), checkout: { type: 'boolean', description: 'Check out the new branch after creating it. Defaults to true.' }, confirmedByUser: approvalBooleanSchema, approvalNote: approvalNoteSchema }, ['branch']),
    parameters: z.object({ branch: z.string().min(1), startPoint: z.string().default(''), checkout: z.boolean().default(true), confirmedByUser: z.boolean().default(false), approvalNote: z.string().default('') }),
    scopes: ['runtime.code.git_create_branch'],
    riskLevel: 'write',
    humanApprovalRequired: true,
    audit: {
      category: 'code',
      action: 'git_create_branch',
      resourceType: 'git_branch',
      resourceIdField: 'branch',
      sensitiveFields: ['branch', 'startPoint', 'approvalNote'],
      logEvents: ['tool.code.git_create_branch.approval_requested', 'tool.code.git_create_branch.completed'],
    },
    executor: codeGitCreateBranch,
  },

  {
    name: 'code.run_command',
    description: 'Run an approved non-test shell command from a required workspace-relative cwd with bounded timeout/output, captured stdout/stderr/exit code, dangerous-command blocking, and execution receipt metadata. Use code.test for test/check commands.',
    inputSchema: objectSchema({ command: stringSchema('Command to run after approval. Use code.test for test/check commands.'), cwd: relativePathSchema, timeoutMs: numberSchema('Timeout in milliseconds.', { minimum: 1000, maximum: 600000 }), maxOutputBytes: numberSchema('Maximum combined stdout/stderr bytes to capture.', { minimum: 1024, maximum: 2000000 }), allowHighRiskCommand: { type: 'boolean', description: 'Permit known dangerous command patterns only when paired with highRiskApprovalNote.' }, highRiskApprovalNote: stringSchema('Separate high-risk approval note required when allowHighRiskCommand is true.'), confirmedByUser: approvalBooleanSchema, approvalNote: approvalNoteSchema }, ['command', 'cwd']),
    parameters: z.object({ command: z.string().min(1), cwd: z.string().min(1), timeoutMs: z.number().int().min(1000).max(600000).default(120000), maxOutputBytes: z.number().int().min(1024).max(2000000).default(1000000), allowHighRiskCommand: z.boolean().default(false), highRiskApprovalNote: z.string().default(''), confirmedByUser: z.boolean().default(false), approvalNote: z.string().default('') }),
    scopes: ['runtime.code.execute'],
    riskLevel: 'code_execution',
    humanApprovalRequired: true,
    audit: {
      category: 'code',
      action: 'run_command',
      resourceType: 'workspace_command',
      sensitiveFields: ['command', 'cwd', 'approvalNote', 'highRiskApprovalNote'],
      logEvents: ['tool.code.run_command.approval_requested', 'tool.code.run_command.completed'],
    },
    executor: codeRunCommand,
  },
  {
    name: 'code.test',
    description: 'Run an approved shell command from a sandboxed workspace-relative cwd with a bounded timeout and captured output.',
    inputSchema: objectSchema({ command: stringSchema('Test/check command to run after approval.'), cwd: relativePathSchema, timeoutMs: numberSchema('Timeout in milliseconds.', { minimum: 1000, maximum: 600000 }), maxOutputBytes: numberSchema('Maximum combined stdout/stderr bytes to capture.', { minimum: 1024, maximum: 2000000 }), confirmedByUser: approvalBooleanSchema, approvalNote: approvalNoteSchema }, ['command']),
    parameters: z.object({ command: z.string().min(1), cwd: z.string().default('.'), timeoutMs: z.number().int().min(1000).max(600000).default(120000), maxOutputBytes: z.number().int().min(1024).max(2000000).default(1000000), confirmedByUser: z.boolean().default(false), approvalNote: z.string().default('') }),
    scopes: ['runtime.code.execute'],
    riskLevel: 'code_execution',
    humanApprovalRequired: true,
    audit: {
      category: 'code',
      action: 'test',
      resourceType: 'workspace_command',
      sensitiveFields: ['command', 'cwd'],
      logEvents: ['tool.code.test.approval_requested', 'tool.code.test.completed'],
    },
    executor: codeTest,
  },
  {
    name: 'code.commit',
    description: 'Stage workspace-relative paths and create a git commit after explicit user approval.',
    inputSchema: objectSchema({ message: stringSchema('Git commit message.'), paths: stringArraySchema('Workspace-relative paths to stage; defaults to all.'), confirmedByUser: approvalBooleanSchema, approvalNote: approvalNoteSchema }, ['message']),
    parameters: z.object({ message: z.string().min(1), paths: z.array(z.string()).default([]), confirmedByUser: z.boolean().default(false), approvalNote: z.string().default('') }),
    scopes: ['runtime.code.commit'],
    riskLevel: 'purchase_or_commit',
    humanApprovalRequired: true,
    audit: {
      category: 'code',
      action: 'commit',
      resourceType: 'git_commit',
      sensitiveFields: ['message', 'paths'],
      logEvents: ['tool.code.commit.approval_requested', 'tool.code.commit.completed'],
    },
    executor: codeCommit,
  },
  {
    name: 'vscode.open',
    description: 'Build a vscode://file URI for an existing file inside the sandboxed Nexora workspace root.',
    inputSchema: objectSchema({ path: relativePathSchema, line: numberSchema('One-based line number.', { minimum: 1 }), column: numberSchema('One-based column number.', { minimum: 1 }) }, ['path']),
    parameters: z.object({ path: z.string().min(1), line: z.number().int().min(1).default(1), column: z.number().int().min(1).default(1) }),
    scopes: ['runtime.vscode.open'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'vscode',
      action: 'open',
      resourceType: 'workspace_file',
      resourceIdField: 'path',
      sensitiveFields: ['path'],
      logEvents: ['tool.vscode.open.requested', 'tool.vscode.open.completed'],
    },
    executor: vscodeOpen,
  },
  {
    name: 'vscode.status',
    description: 'Return workspace root and lightweight git status information for Nexora workspace context.',
    inputSchema: objectSchema({}),
    parameters: z.object({}),
    scopes: ['runtime.vscode.status'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'vscode',
      action: 'status',
      resourceType: 'workspace_status',
      logEvents: ['tool.vscode.status.requested', 'tool.vscode.status.completed'],
    },
    executor: vscodeStatus,
  },
  {
    name: 'nexora.scaffold_app',
    description: 'Nexora-only approved app scaffolding workflow. Creates an app directory, package/config/source files, README/usage notes, and always returns a created/changed-file manifest. Optional install/build/test commands require separate explicit approval; global installs and unapproved network package installs are blocked.',
    inputSchema: objectSchema({ appName: stringSchema('Human-readable app name.'), appDir: relativePathSchema, directories: stringArraySchema('Workspace-relative subdirectories to create under appDir.'), files: scaffoldFileArrayJsonSchema, readme: stringSchema('Optional README.md content to create under appDir.'), usageNotes: stringSchema('Optional USAGE.md content to create under appDir.'), commands: scaffoldCommandArrayJsonSchema, allowNetworkPackageInstall: { type: 'boolean', description: 'Permit approved npm/pnpm/yarn/bun install/add commands. Global installs remain blocked.' }, confirmedByUser: approvalBooleanSchema, approvalNote: approvalNoteSchema, commandConfirmedByUser: approvalBooleanSchema, commandApprovalNote: approvalNoteSchema }, ['appName', 'appDir']),
    parameters: z.object({
      appName: z.string().min(1),
      appDir: z.string().min(1),
      directories: z.array(z.string()).default([]),
      files: z.array(z.union([
        z.object({ path: z.string().min(1), content: z.string(), kind: z.enum(['source', 'config', 'readme', 'package', 'usage']).optional() }),
        z.object({ path: z.string().min(1), json: z.unknown(), kind: z.enum(['config', 'package']).optional(), space: z.number().int().min(0).max(10).optional() }),
      ])).default([]),
      readme: z.string().default(''),
      usageNotes: z.string().default(''),
      commands: z.array(z.object({ command: z.string().min(1), cwd: z.string().optional(), kind: z.enum(['install', 'build', 'test', 'other']).optional(), timeoutMs: z.number().int().min(1000).max(600000).optional(), maxOutputBytes: z.number().int().min(1024).max(2000000).optional() })).default([]),
      allowNetworkPackageInstall: z.boolean().default(false),
      confirmedByUser: z.boolean().default(false),
      approvalNote: z.string().default(''),
      commandConfirmedByUser: z.boolean().default(false),
      commandApprovalNote: z.string().default(''),
    }),
    scopes: ['runtime.nexora.scaffold'],
    riskLevel: 'code_execution',
    humanApprovalRequired: true,
    audit: { category: 'nexora', action: 'scaffold_app', resourceType: 'workspace_app', resourceIdField: 'appDir', sensitiveFields: ['appDir', 'files', 'readme', 'usageNotes', 'commands', 'approvalNote', 'commandApprovalNote'], logEvents: ['tool.nexora.scaffold_app.approval_requested', 'tool.nexora.scaffold_app.completed'] },
    executor: (input) => scaffoldApp({ ...input, approval: { confirmedByUser: input.confirmedByUser, approvalNote: input.approvalNote }, commandApproval: { confirmedByUser: input.commandConfirmedByUser, approvalNote: input.commandApprovalNote } }),
  },
  {
    name: 'delegation.create_task',
    description: 'Create a durable delegated task from Elora to Nexora with objective, constraints, tool needs, approvals, events, and audit trail.',
    inputSchema: objectSchema(
      {
        objective: stringSchema('Specific outcome Nexora should accomplish.'),
        constraints: stringArraySchema('Rules, limits, or context Nexora must follow.'),
        requiredTools: stringArraySchema('Tool names or capabilities Nexora is expected to need.'),
        approvalRequirements: stringArraySchema('Human approvals required before the task can be dispatched.'),
        initialLog: stringSchema('Optional initial task log entry.'),
        executionPlan: { type: 'array', description: 'Optional ordered execution-plan steps with targetTool, arguments, per-step timeoutMs, and per-step approval state.', items: { type: 'object', additionalProperties: true } },
        timeoutMs: numberSchema('Optional task timeout in milliseconds.', { minimum: 1000, maximum: 600000 }),
      },
      ['objective'],
    ),
    parameters: z.object({
      objective: z.string().min(1),
      constraints: z.array(z.string()).default([]),
      requiredTools: z.array(z.string()).default([]),
      approvalRequirements: z.array(z.string()).default([]),
      initialLog: z.string().default(''),
      timeoutMs: z.number().int().min(1000).max(600000).optional(),
      executionPlan: z.array(z.object({
        id: z.string().optional(),
        order: z.number().optional(),
        targetTool: z.string().min(1),
        arguments: z.unknown().optional(),
        argumentTemplate: z.unknown().optional(),
        approvalStatus: z.enum(['not_required', 'pending', 'approved', 'rejected']).optional(),
        status: z.enum(['queued', 'running', 'blocked', 'completed', 'failed', 'skipped', 'cancelled']).optional(),
        timeoutMs: z.number().int().min(1000).max(600000).optional(),
      })).optional(),
    }),
    scopes: ['runtime.delegation.write'],
    riskLevel: 'write',
    humanApprovalRequired: false,
    audit: {
      category: 'delegation',
      action: 'create_task',
      resourceType: 'delegated_task',
      sensitiveFields: ['objective', 'constraints', 'initialLog'],
      logEvents: ['tool.delegation.create_task.requested', 'tool.delegation.create_task.completed'],
    },
    executor: createDelegationTask,
  },
  {
    name: 'delegation.list_tasks',
    description: 'List durable Elora-to-Nexora delegated task statuses for the current session.',
    inputSchema: objectSchema({ includeAllSessions: { type: 'boolean', description: 'When true, include tasks from every session.' } }),
    parameters: z.object({ includeAllSessions: z.boolean().default(false) }),
    scopes: ['runtime.delegation.read'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'delegation',
      action: 'list_tasks',
      resourceType: 'delegated_task',
      logEvents: ['tool.delegation.list_tasks.requested', 'tool.delegation.list_tasks.completed'],
    },
    executor: listDelegationTasks,
  },
  {
    name: 'delegation.get_task',
    description: 'Fetch one durable delegated task with events, result, receipt, and audit trail.',
    inputSchema: objectSchema({ taskId: stringSchema('Delegated task ID.') }, ['taskId']),
    parameters: z.object({ taskId: z.string().min(1) }),
    scopes: ['runtime.delegation.read'],
    riskLevel: 'read',
    humanApprovalRequired: false,
    audit: {
      category: 'delegation',
      action: 'get_task',
      resourceType: 'delegated_task',
      resourceIdField: 'taskId',
      logEvents: ['tool.delegation.get_task.requested', 'tool.delegation.get_task.completed'],
    },
    executor: getDelegationTask,
  },
  {
    name: 'delegation.create_proposal',
    description: 'Store an autonomous patch proposal on an existing delegated task without mutating files. The proposal includes rationale, risk, affected files, optional diff, and optional executable changes that can only be applied later through the existing task approval route.',
    inputSchema: objectSchema(
      {
        taskId: stringSchema('Delegated task ID that owns this autonomous proposal.'),
        title: stringSchema('Short proposal title.'),
        summary: stringSchema('What the proposed patch would change.'),
        rationale: stringSchema('Why the autonomous agent recommends this patch.'),
        affectedFiles: stringArraySchema('Workspace-relative files expected to be affected.'),
        riskLevel: stringSchema('Proposal risk level: low, medium, or high.'),
        proposedDiff: stringSchema('Optional unified diff preview. This is stored only and is not applied.'),
        implementationNotes: stringSchema('Optional implementation notes for review.'),
        changes: { type: 'array', description: 'Optional executable change descriptors for create_file, edit_file, or patch_file. These are stored only until user approval.', items: { type: 'object', additionalProperties: true } },
        proposedBy: stringSchema('Autonomous proposer identity: nexora, elora, or core.'),
      },
      ['taskId', 'title', 'summary', 'rationale'],
    ),
    parameters: z.object({
      taskId: z.string().min(1),
      title: z.string().min(1),
      summary: z.string().min(1),
      rationale: z.string().min(1),
      affectedFiles: z.array(z.string()).default([]),
      riskLevel: z.enum(['low', 'medium', 'high']).default('medium'),
      proposedDiff: z.string().optional(),
      implementationNotes: z.string().optional(),
      changes: z.array(z.union([
        z.object({ kind: z.literal('create_file'), path: z.string().min(1), content: z.string(), expectedSha256: z.string().optional() }),
        z.object({ kind: z.literal('edit_file'), path: z.string().min(1), content: z.string(), mode: z.enum(['overwrite', 'append']).optional(), expectedSha256: z.string().optional() }),
        z.object({ kind: z.literal('patch_file'), path: z.string().min(1), search: z.string(), replace: z.string(), replaceAll: z.boolean().optional(), expectedSha256: z.string().optional() }),
      ])).optional(),
      proposedBy: z.enum(['core', 'elora', 'nexora']).default('nexora'),
    }),
    scopes: ['runtime.delegation.write'],
    riskLevel: 'write',
    humanApprovalRequired: false,
    audit: {
      category: 'delegation',
      action: 'create_proposal',
      resourceType: 'autonomous_patch_proposal',
      resourceIdField: 'taskId',
      sensitiveFields: ['summary', 'rationale', 'proposedDiff', 'implementationNotes', 'changes'],
      logEvents: ['tool.delegation.create_proposal.requested', 'tool.delegation.create_proposal.completed'],
    },
    executor: createAutonomousProposal,
  },

  {
    name: 'delegation.approve_task',
    description: 'Record human approval for a pending durable delegated task and enqueue it when all approvals are satisfied.',
    inputSchema: objectSchema(
      { taskId: stringSchema('Delegated task ID.'), approver: stringSchema('Person approving the task.'), note: approvalNoteSchema, confirmedByUser: approvalBooleanSchema },
      ['taskId', 'confirmedByUser'],
    ),
    parameters: z.object({ taskId: z.string().min(1), approver: z.string().default('user'), note: z.string().default(''), confirmedByUser: z.boolean().default(false) }),
    scopes: ['runtime.delegation.write'],
    riskLevel: 'write',
    humanApprovalRequired: true,
    audit: {
      category: 'delegation',
      action: 'approve_task',
      resourceType: 'delegated_task',
      resourceIdField: 'taskId',
      sensitiveFields: ['note'],
      logEvents: ['tool.delegation.approve_task.approval_requested', 'tool.delegation.approve_task.completed'],
    },
    executor: approveDelegationTask,
  },

  {
    name: 'delegation.approve_step',
    description: 'Record human approval for one blocked execution-plan step/tool action and resume the same durable task from that step.',
    inputSchema: objectSchema(
      { taskId: stringSchema('Delegated task ID.'), stepId: stringSchema('Execution plan step ID.'), approver: stringSchema('Person approving the step.'), note: approvalNoteSchema, confirmedByUser: approvalBooleanSchema },
      ['taskId', 'stepId', 'confirmedByUser'],
    ),
    parameters: z.object({ taskId: z.string().min(1), stepId: z.string().min(1), approver: z.string().default('user'), note: z.string().default(''), confirmedByUser: z.boolean().default(false) }),
    scopes: ['runtime.delegation.write'],
    riskLevel: 'write',
    humanApprovalRequired: true,
    audit: {
      category: 'delegation',
      action: 'approve_step',
      resourceType: 'delegated_task_step',
      resourceIdField: 'stepId',
      sensitiveFields: ['note'],
      logEvents: ['tool.delegation.approve_step.approval_requested', 'tool.delegation.approve_step.completed'],
    },
    executor: approveDelegationStep,
  },

  {
    name: 'delegation.resume_task',
    description: 'Resume an existing blocked durable delegated task by ID, preserving its execution-plan progress and re-enqueueing it after approval/configuration is satisfied.',
    inputSchema: objectSchema({ taskId: stringSchema('Delegated task ID.'), note: stringSchema('Optional resume note.') }, ['taskId']),
    parameters: z.object({ taskId: z.string().min(1), note: z.string().default('') }),
    scopes: ['runtime.delegation.write'],
    riskLevel: 'write',
    humanApprovalRequired: false,
    audit: {
      category: 'delegation',
      action: 'resume_task',
      resourceType: 'delegated_task',
      resourceIdField: 'taskId',
      sensitiveFields: ['note'],
      logEvents: ['tool.delegation.resume_task.requested', 'tool.delegation.resume_task.completed'],
    },
    executor: resumeDelegationTask,
  },

  {
    name: 'delegation.cancel_task',
    description: 'Cancel a queued, running, or blocked delegated task, terminate an active Nexora command step when present, audit the cancellation, and create a final cancellation receipt.',
    inputSchema: objectSchema({ taskId: stringSchema('Delegated task ID.'), reason: stringSchema('Cancellation reason.') }, ['taskId']),
    parameters: z.object({ taskId: z.string().min(1), reason: z.string().default('Task cancellation requested.') }),
    scopes: ['runtime.delegation.write'],
    riskLevel: 'write',
    humanApprovalRequired: false,
    audit: {
      category: 'delegation',
      action: 'cancel_task',
      resourceType: 'delegated_task',
      resourceIdField: 'taskId',
      sensitiveFields: ['reason'],
      logEvents: ['tool.delegation.cancel_task.requested', 'tool.delegation.cancel_task.completed'],
    },
    executor: cancelDelegationTask,
  },
  {
    name: 'delegation.update_task',
    description: 'Update durable delegated task status or append an operational log entry.',
    inputSchema: objectSchema({ taskId: stringSchema('Delegated task ID.'), status: stringSchema('New task status.'), log: stringSchema('Log entry to append.') }, ['taskId']),
    parameters: z.object({
      taskId: z.string().min(1),
      status: z.enum(['queued', 'pending_approval', 'running', 'blocked', 'completed', 'failed', 'cancelled']).optional(),
      log: z.string().optional(),
    }),
    scopes: ['runtime.delegation.write'],
    riskLevel: 'write',
    humanApprovalRequired: false,
    audit: {
      category: 'delegation',
      action: 'update_task',
      resourceType: 'delegated_task',
      resourceIdField: 'taskId',
      sensitiveFields: ['log'],
      logEvents: ['tool.delegation.update_task.requested', 'tool.delegation.update_task.completed'],
    },
    executor: updateDelegationTask,
  },
  {
    name: 'delegation.record_result',
    description: 'Record Nexora task output, mark the task completed or failed, and generate a receipt/audit proof.',
    inputSchema: objectSchema(
      { taskId: stringSchema('Delegated task ID.'), ok: { type: 'boolean', description: 'Whether Nexora completed the task successfully.' }, summary: stringSchema('Result summary.'), data: { type: 'object', additionalProperties: true, description: 'Optional structured result data.' }, errorMessage: stringSchema('Failure message when ok is false.') },
      ['taskId', 'ok', 'summary'],
    ),
    parameters: z.object({ taskId: z.string().min(1), ok: z.boolean(), summary: z.string().min(1), data: z.unknown().optional(), errorMessage: z.string().optional() }),
    scopes: ['runtime.delegation.write'],
    riskLevel: 'write',
    humanApprovalRequired: false,
    audit: {
      category: 'delegation',
      action: 'record_result',
      resourceType: 'delegated_task',
      resourceIdField: 'taskId',
      sensitiveFields: ['summary', 'data', 'errorMessage'],
      logEvents: ['tool.delegation.record_result.requested', 'tool.delegation.record_result.completed'],
    },
    executor: recordDelegationTaskResult,
  },
  {
    name: 'delegation.execute_code',
    description: 'Execute one approved Nexora execution-plan command through the local worker bridge after task approval, step approval, workspace-root, and command policy checks.',
    inputSchema: objectSchema({ taskId: stringSchema('Delegation task ID.'), stepId: stringSchema('Approved execution-plan step ID.'), command: stringSchema('Allowlisted command to execute.'), workingDirectory: stringSchema('Workspace-relative working directory.'), timeoutMs: numberSchema('Timeout in milliseconds.', { minimum: 1000, maximum: 600000 }), maxOutputBytes: numberSchema('Maximum captured output bytes.', { minimum: 1024, maximum: 2000000 }), confirmedByUser: approvalBooleanSchema, approvalNote: approvalNoteSchema }, ['taskId', 'command', 'confirmedByUser']),
    parameters: z.object({ taskId: z.string().min(1), stepId: z.string().optional(), command: z.string().min(1), workingDirectory: z.string().default('.'), timeoutMs: z.number().int().min(1000).max(600000).optional(), maxOutputBytes: z.number().int().min(1024).max(2000000).optional(), confirmedByUser: z.boolean().default(false), approvalNote: z.string().default('') }),
    scopes: ['runtime.delegation.execute'],
    riskLevel: 'code_execution',
    humanApprovalRequired: true,
    audit: {
      category: 'delegation',
      action: 'execute_code',
      resourceType: 'worker_execution',
      resourceIdField: 'taskId',
      sensitiveFields: ['command', 'workingDirectory'],
      logEvents: ['tool.delegation.execute_code.approval_requested', 'tool.delegation.execute_code.completed'],
    },
    executor: executeDelegatedCode,
  },
];

const registryByName = new Map(toolRegistry.map((definition) => [definition.name, definition]));

function isHighRisk(definition: RegisteredToolDefinition) {
  return definition.riskLevel !== 'read';
}

function summarizeApprovalInput(input: Record<string, unknown>) {
  try {
    const serialized = JSON.stringify(input);
    return serialized.length > 700 ? `${serialized.slice(0, 697)}...` : serialized;
  } catch (_error) {
    return 'Input summary unavailable.';
  }
}

function approvalBlockedResult(definition: RegisteredToolDefinition, context: RuntimeContext, reason: string, executionId?: string, sanitizedInput?: Record<string, unknown>) {
  return {
    ok: false,
    tool: definition.name,
    riskLevel: definition.riskLevel,
    humanApprovalRequired: definition.humanApprovalRequired,
    audit: {
      ...definition.audit,
      blockedAt: new Date().toISOString(),
      sessionId: context.sessionId,
      channel: context.channel || 'text',
      voiceSessionId: context.voiceSessionId,
      autonomyLevel: activeAutonomyLevel(context),
    },
    approval: {
      executionId,
      approvalScope: requiredApprovalScope(definition),
      toolName: definition.name,
      riskLevel: definition.riskLevel,
      requestedAction: definition.audit.action,
      sanitizedInputSummary: sanitizedInput ? summarizeApprovalInput(sanitizedInput) : 'Input summary unavailable.',
      reason,
    },
    result: {
      status: 'approval_required',
      reason,
      message: context.voiceApproval?.lockedReason || `The ${definition.name} action requires explicit approval in the React approval UI before it can run.`,
    },
  };
}


function requiredApprovalScope(definition: RegisteredToolDefinition): ApprovalScope | undefined {
  if (!isHighRisk(definition)) return undefined;
  if (definition.requiredApprovalScope) return definition.requiredApprovalScope;
  if (definition.name === 'code.commit') return 'repo.commit';
  if (definition.riskLevel === 'code_execution') return 'repo.command';
  if (definition.audit.category === 'code' || definition.audit.category === 'nexora') {
    return definition.audit.action.includes('delete') ? 'repo.delete' : 'repo.write';
  }
  if (definition.riskLevel === 'external_send') return 'external.send';
  if (definition.name.includes('migrate') || definition.audit.action.includes('migrate')) return 'database.migrate';
  if (definition.audit.action.includes('delete')) return 'provider.delete';
  if (definition.audit.action.includes('create')) return 'provider.create';
  return 'provider.update';
}

async function hasExactApprovalScope(definition: RegisteredToolDefinition, input: Record<string, unknown>, context: RuntimeContext, executionId?: string) {
  const scope = requiredApprovalScope(definition);
  if (!scope) return true;
  if (!executionId) return false;
  const approvedRecord = await getExecutionRecord(executionId);
  if (approvedRecord) return approvedRecord.action === definition.name && approvedRecord.approvalRequest?.approvalScope === scope;

  if (isDirectProviderWrite(definition)) return false;

  const taskId = typeof input.taskId === 'string' ? input.taskId : typeof context.approvedDelegatedTaskId === 'string' ? context.approvedDelegatedTaskId : undefined;
  const stepId = typeof input.stepId === 'string' ? input.stepId : typeof context.approvedDelegatedStepId === 'string' ? context.approvedDelegatedStepId : executionId;
  if (!taskId || !stepId) return false;
  const task = await getStoredDelegatedTask(taskId);
  const step = task?.executionPlan?.find((candidate) => candidate.id === stepId);
  if (step?.targetTool !== definition.name) return false;
  if (step.approval?.scope === scope) return true;
  return (task?.authorizationSource === 'user_requested' || task?.authorizationSource === 'user_delegated') && step.approvalStatus === 'approved';
}

async function enforceApprovalLimits(definition: RegisteredToolDefinition, input: Record<string, unknown>, context: RuntimeContext, approvedThroughUi: boolean, executionId?: string, sanitizedInput?: Record<string, unknown>, approvalRequired = definition.humanApprovalRequired) {
  if (approvalRequired && !approvedThroughUi) {
    const reason = input?.confirmedByUser === true ? 'missing_react_ui_approval_context' : 'missing_explicit_user_approval';
    return approvalBlockedResult(definition, context, reason, executionId, sanitizedInput);
  }

  if (approvalRequired && definition.humanApprovalRequired && approvedThroughUi && !(await hasExactApprovalScope(definition, input, context, executionId))) {
    return approvalBlockedResult(definition, context, 'approval_scope_mismatch', executionId, sanitizedInput);
  }

  if (context.channel === 'voice') {
    const policy = context.voiceApproval;
    const lockedToolCategories = new Set(policy?.lockedToolCategories || []);
    const lockedRiskLevels = new Set(policy?.lockedRiskLevels || []);

    if (lockedToolCategories.has(definition.audit.category) || lockedRiskLevels.has(definition.riskLevel)) {
      return approvalBlockedResult(definition, context, 'voice_policy_locked_tool', executionId, sanitizedInput);
    }

    if (isHighRisk(definition)) {
      if (!policy?.allowHighRiskActions) {
        return approvalBlockedResult(definition, context, 'voice_high_risk_actions_not_approved', executionId, sanitizedInput);
      }

      if (policy.approvedHighRiskActions >= policy.maxHighRiskActions) {
        return approvalBlockedResult(definition, context, 'voice_high_risk_action_limit_exhausted', executionId, sanitizedInput);
      }

      policy.approvedHighRiskActions += 1;
    }
  }

  return undefined;
}

function normalizeToolInput(input: unknown): Record<string, unknown> {
  if (input && typeof input === 'object' && !Array.isArray(input)) return input as Record<string, unknown>;
  return { value: input };
}


function isDirectProviderWrite(definition: RegisteredToolDefinition) {
  return definition.name === 'gmail.send_email'
    || definition.name === 'sheets.update_range';
}

function usesSdkApprovalGate(definition: RegisteredToolDefinition) {
  // Durable delegation approval tools mutate the task queue's approval state rather than
  // approving the current SDK tool call, so they keep the legacy queue approval shim.
  return definition.humanApprovalRequired && definition.name !== 'delegation.approve_task' && definition.name !== 'delegation.approve_step';
}

function wasApprovedBySdkResume(definition: RegisteredToolDefinition, context: RuntimeContext, callId?: string) {
  if (!usesSdkApprovalGate(definition)) return false;
  const approvedCallIds = new Set(context.sdkApprovedToolCallIds || []);
  if (callId && approvedCallIds.has(callId)) return true;
  // Older serialized SDK states may not preserve a stable call id across versions; use
  // tool name as a fallback only on the explicit resume path populated by agentEndpoint.
  return new Set(context.sdkApprovedToolNames || []).has(definition.name);
}

export async function executeRegisteredTool(name: string, input: unknown, context: RuntimeContext, sdkToolCallId?: string) {
  const definition = getRegisteredTool(name);
  if (!definition) throw new Error(`Unknown registered tool: ${name}`);
  if (!context?.sessionId) throw new Error(`Runtime context is missing for ${definition.name}`);

  context.relationshipContext ||= await getRelationshipContext('jordan');
  const normalizedInput = normalizeToolInput(input);
  const parsedInput = definition.parameters.parse(normalizedInput) as Record<string, unknown>;
  const executionMode = normalizeExecutionMode(context.executionMode, context.autonomyProfile === 'proactive_observation' ? 'observation' : context.autonomyProfile ? 'autonomous' : 'reactive');
  const autonomyLevel = activeAutonomyLevel(context);
  if ((executionMode === 'observation' || context.autonomyProfile === 'proactive_observation') && !proactiveObservationAllows(definition, autonomyLevel, parsedInput)) {
    return approvalBlockedResult(definition, context, 'observation_mode_read_only_policy', undefined, sanitizeAuditInput(parsedInput, definition.audit.sensitiveFields || []));
  }
  if (!autonomyLevelAllows(autonomyLevel, definition, parsedInput, executionMode)) {
    return approvalBlockedResult(definition, context, `autonomy_level_${autonomyLevel}_policy`, undefined, sanitizeAuditInput(parsedInput, definition.audit.sensitiveFields || []));
  }
  const sdkApproved = wasApprovedBySdkResume(definition, context, sdkToolCallId);
  if (sdkApproved) {
    parsedInput.confirmedByUser = true;
    parsedInput.approvalNote ||= `Approved through OpenAI Agents SDK human-in-the-loop resume${sdkToolCallId ? ` for call ${sdkToolCallId}` : ''}.`;
  } else if (!usesSdkApprovalGate(definition) && executionMode !== 'autonomous' && definition.humanApprovalRequired && parsedInput.confirmedByUser !== true) {
    parsedInput.confirmedByUser = true;
    parsedInput.approvalNote ||= `Authorized by ${executionMode} user-requested execution mode.`;
  }
  const sanitizedInput = sanitizeAuditInput(parsedInput, definition.audit.sensitiveFields || []);
  const approvedExecutionId = typeof context.approvedExecutionId === 'string' ? context.approvedExecutionId : undefined;
  const approvalScope = requiredApprovalScope(definition);

  const approved = !approvalRequired || sdkApproved || Boolean(parsedInput.confirmedByUser === true && approvedExecutionId);
  const executionRecord = createExecutionRecord({
    kind: 'tool_call',
    whoRequested: executionMode === 'autonomous' ? 'agent' : 'user',
    chosenByAgent: context.agent || 'elora',
    action: definition.name,
    inputPayload: sanitizedInput,
    riskLevel: definition.riskLevel,
    approvalStatus: approvalRequired ? (approved ? 'approved' : 'pending') : 'not_required',
    approvalScope,

    linkedIds: {
      sessionId: context.sessionId,
      voiceSessionId: context.voiceSessionId,
      executionMode,
      executionOrigin: executionMode,
      autonomyLevel,
      ...(context.approvedDelegatedTaskId ? { taskIds: [context.approvedDelegatedTaskId], parentTaskId: context.approvedDelegatedTaskId, rootTaskId: context.approvedDelegatedTaskId } : {}),
    },
    status: 'running',
    startedAt: new Date().toISOString(),
    receiptSummary: `${definition.name} requested`,
  });

  await writeToolAuditLog({
    event: definition.audit.logEvents[0] || `${definition.name}.requested`,
    tool: definition.name,
    sessionId: context.sessionId,
    riskLevel: definition.riskLevel,
    humanApprovalRequired: definition.humanApprovalRequired,
    approved,
    executionMode,
    autonomyLevel,
    workspaceRoot: definition.audit.category === 'code' || definition.audit.category === 'vscode' ? workspaceRoot() : undefined,
    input: sanitizedInput,
  });

  const approvalBlock = await enforceApprovalLimits(definition, parsedInput, context, Boolean(approved), sdkApproved ? executionRecord.id : (approvedExecutionId || executionRecord.id), sanitizedInput, approvalRequired && !sdkApproved);
  if (approvalBlock) {
    const blockedRecord = completeExecutionRecord(executionRecord, {
      status: 'blocked',
      executionResult: approvalBlock,
      providerResponseSummary: summarizeProviderResponse(approvalBlock),
      approvalStatus: 'pending',
      receiptSummary: `${definition.name} blocked pending approval`,
    });
    blockedRecord.approvalRequest = {
      toolName: definition.name,
      requestedAction: definition.audit.action,
      sanitizedInputSummary: summarizeApprovalInput(sanitizedInput),
      reason: approvalBlock.result.reason,
      originalInput: redactForLogs(parsedInput),
      approvalScope,
      requestedAt: executionRecord.timestamps.requestedAt,
    };
    await writeExecutionRecord(blockedRecord);
    await recordTrustEventFromPolicyDecision({
      decision: policyDecision,
      status: 'blocked',
      actor: context.agent || 'elora',
      action: definition.name,
      executionId: blockedRecord.id,
      metadata: { approvalRequired, executionMode, autonomyLevel },
    });
    await writeToolAuditLog({
      event: `${definition.name}.approval_required`,
      tool: definition.name,
      sessionId: context.sessionId,
      riskLevel: definition.riskLevel,
      humanApprovalRequired: definition.humanApprovalRequired,
      approved: false,
      executionMode,
      autonomyLevel,
      workspaceRoot: definition.audit.category === 'code' || definition.audit.category === 'vscode' ? workspaceRoot() : undefined,
      input: sanitizedInput,
      resultStatus: 'approval_required',
    });
    return approvalBlock;
  }

  try {
    const result = redactProviderReceiptPayload(await definition.executor(parsedInput, context));
    const completedRecord = completeExecutionRecord(executionRecord, {
      status: 'completed',
      executionResult: result,
      providerResponseSummary: summarizeProviderResponse(result),
      approvalStatus: approvalRequired ? 'approved' : 'not_required',
      receiptSummary: `${definition.name} completed`,
    });
    await writeExecutionRecord(completedRecord);
    await recordTrustEventFromPolicyDecision({
      decision: policyDecision,
      status: 'completed',
      actor: context.agent || 'elora',
      action: definition.name,
      executionId: completedRecord.id,
      receiptComplete: Boolean(completedRecord.receipt.summary),
      validationPassed: true,
      metadata: { approvalRequired, executionMode, autonomyLevel },
    });
    await writeToolAuditLog({
      event: definition.audit.logEvents[1] || `${definition.name}.completed`,
      tool: definition.name,
      sessionId: context.sessionId,
      riskLevel: definition.riskLevel,
      humanApprovalRequired: definition.humanApprovalRequired,
      approved,
      executionMode,
      autonomyLevel,
      workspaceRoot: definition.audit.category === 'code' || definition.audit.category === 'vscode' ? workspaceRoot() : undefined,
      input: sanitizedInput,
      resultStatus: 'completed',
    });
    return result;
  } catch (error) {
    const message = redactForLogs(error instanceof Error ? error.message : String(error));
    const failedRecord = completeExecutionRecord(executionRecord, {
      status: 'failed',
      errors: [message],
      providerResponseSummary: message,
      approvalStatus: approved ? 'approved' : 'unknown',
      receiptSummary: `${definition.name} failed: ${message}`,
    });
    await writeExecutionRecord(failedRecord);
    await recordTrustEventFromPolicyDecision({
      decision: policyDecision,
      status: 'failed',
      actor: context.agent || 'elora',
      action: definition.name,
      executionId: failedRecord.id,
      validationPassed: false,
      metadata: { approvalRequired, executionMode, autonomyLevel, error: message },
    });
    await writeToolAuditLog({
      event: `${definition.name}.failed`,
      tool: definition.name,
      sessionId: context.sessionId,
      riskLevel: definition.riskLevel,
      humanApprovalRequired: definition.humanApprovalRequired,
      approved,
      executionMode,
      autonomyLevel,
      workspaceRoot: definition.audit.category === 'code' || definition.audit.category === 'vscode' ? workspaceRoot() : undefined,
      input: sanitizedInput,
      resultStatus: 'failed',
      error: message,
    });
    throw error;
  }
}

function toRuntimeTool(definition: RegisteredToolDefinition) {
  return tool({
    name: definition.name,
    description: definition.description,
    parameters: definition.inputSchema,
    strict: false,
    needsApproval: async (runContext: any, input: any) => {
      const context = runContext?.context as RuntimeContext | undefined;
      if (!context) return definition.humanApprovalRequired;
      const executionMode = normalizeExecutionMode(context.executionMode, context.autonomyProfile === 'proactive_observation' ? 'observation' : context.autonomyProfile ? 'autonomous' : 'reactive');
      const autonomyLevel = activeAutonomyLevel(context);
      if (!usesSdkApprovalGate(definition)) return false;
      if ((executionMode === 'observation' || context.autonomyProfile === 'proactive_observation') && !proactiveObservationAllows(definition, autonomyLevel, input)) return true;
      return requiresApprovalForExecutionMode(context.executionMode, context.autonomyProfile, definition, input, requiredApprovalScope(definition));
    },
    execute: async (input: any, runContext: any, details: any) => {
      const context = runContext?.context as RuntimeContext | undefined;
      if (!context) throw new Error(`Runtime context is missing for ${definition.name}`);
      return executeRegisteredTool(definition.name, input, context, details?.toolCall?.callId);
    },
  } as any);
}

export function getRegisteredTool(name: string) {
  return registryByName.get(name as RegisteredToolDefinition['name']);
}

export function runtimeToolsForCategories(categories: ToolCategory[]) {
  const desired = new Set(categories);
  return toolRegistry.filter((definition) => desired.has(definition.audit.category)).map(toRuntimeTool);
}

export function runtimeToolsForRiskLevels(riskLevels: ToolRiskLevel[]) {
  const desired = new Set(riskLevels);
  return toolRegistry.filter((definition) => desired.has(definition.riskLevel)).map(toRuntimeTool);
}

export const sharedRuntimeToolCategories: ToolCategory[] = ['web', 'calendar', 'gmail', 'drive', 'sheets', 'crm', 'clay', 'leadgen', 'outreach', 'objection', 'intake', 'qualification', 'proposal', 'voice', 'memory', 'delegation'];
export const nexoraRuntimeToolCategories: ToolCategory[] = [...sharedRuntimeToolCategories, 'nexora', 'code', 'vscode'];

export const runtimeTools = runtimeToolsForCategories(sharedRuntimeToolCategories);
export const safeRuntimeTools = runtimeToolsForRiskLevels(['read']);
export const nexoraRuntimeTools = runtimeToolsForCategories(nexoraRuntimeToolCategories);

export const toolManifest = toolRegistry.map(({ executor: _executor, parameters: _parameters, ...definition }) => definition);

export const toolCategories = [...new Set(toolRegistry.map((definition) => definition.audit.category))];
