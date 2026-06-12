import { tool } from '@openai/agents';
import { z } from 'zod';
import { durableMemoryScopes, listMemories, remember, retrieveMemories, summarizeMemories } from '../memory/index.js';
import { writeToolAuditLog, sanitizeAuditInput } from '../audit/auditLogger.js';
import {
  completeExecutionRecord,
  createExecutionRecord,
  summarizeProviderResponse,
  writeExecutionRecord,
} from '../executions.js';
import { createCalendarEvent, listCalendarEvents } from '../providers/google/calendar.js';
import { lookupCrmContact, upsertCrmContact } from '../providers/crm/index.js';
import { enrichPersonWithClay } from '../providers/clay/index.js';
import { exportSequence, findLeadsWorkflow } from '../workflows/leadgen/index.js';
import { classifyIntake } from '../workflows/intake/classifyIntake.js';
import { createIntakeRecord } from '../workflows/intake/createIntakeRecord.js';
import { packageForReview } from '../workflows/intake/packageForReview.js';
import { routeSpecialist } from '../workflows/intake/routeSpecialist.js';
import { createDriveTextFile, searchDriveFiles } from '../providers/google/drive.js';
import { searchGmailMessages, sendGmailEmail } from '../providers/google/gmail.js';
import { readSheetRange, updateSheetRange } from '../providers/google/sheets.js';
import type { RuntimeContext } from '../types.js';
import {
  codeCommit,
  codeDiff,
  codeEdit,
  codeRead,
  codeSearch,
  codeTest,
  vscodeOpen,
  vscodeStatus,
  workspaceRoot,
} from './codeTools.js';
import {
  approveDelegationTask,
  createDelegationTask,
  getDelegationTask,
  listDelegationTasks,
  recordDelegationTaskResult,
  updateDelegationTask,
} from './delegation.js';

export type ToolCategory =
  | 'calendar'
  | 'gmail'
  | 'drive'
  | 'sheets'
  | 'crm'
  | 'clay'
  | 'leadgen'
  | 'intake'
  | 'voice'
  | 'memory'
  | 'delegation'
  | 'code'
  | 'vscode';

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

export const toolRegistry: RegisteredToolDefinition[] = [
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
    description: 'Create a calendar event through the configured calendar provider adapter.',
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
    humanApprovalRequired: true,
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
    description: 'Create a text file in the connected drive provider.',
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
    humanApprovalRequired: true,
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
      { spreadsheetId: stringSchema('Spreadsheet ID.'), range: stringSchema('A1 notation range.'), values: { type: 'array', description: 'Two-dimensional row values.', items: { type: 'array', items: {} } }, confirmedByUser: approvalBooleanSchema, approvalNote: approvalNoteSchema },
      ['spreadsheetId', 'range', 'values'],
    ),
    parameters: z.object({ spreadsheetId: z.string().min(1), range: z.string().min(1), values: z.array(z.array(z.unknown())), confirmedByUser: z.boolean().default(false), approvalNote: z.string().default('') }),
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
    name: 'code.test',
    description: 'Run an approved shell command from a sandboxed workspace-relative cwd with a bounded timeout and captured output.',
    inputSchema: objectSchema({ command: stringSchema('Command to run after approval.'), cwd: relativePathSchema, timeoutMs: numberSchema('Timeout in milliseconds.', { minimum: 1000, maximum: 600000 }), confirmedByUser: approvalBooleanSchema, approvalNote: approvalNoteSchema }, ['command']),
    parameters: z.object({ command: z.string().min(1), cwd: z.string().default('.'), timeoutMs: z.number().int().min(1000).max(600000).default(120000), confirmedByUser: z.boolean().default(false), approvalNote: z.string().default('') }),
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
    name: 'delegation.create_task',
    description: 'Create a durable delegated task from Elora to Nexora with objective, constraints, tool needs, approvals, events, and audit trail.',
    inputSchema: objectSchema(
      {
        objective: stringSchema('Specific outcome Nexora should accomplish.'),
        constraints: stringArraySchema('Rules, limits, or context Nexora must follow.'),
        requiredTools: stringArraySchema('Tool names or capabilities Nexora is expected to need.'),
        approvalRequirements: stringArraySchema('Human approvals required before the task can be dispatched.'),
        initialLog: stringSchema('Optional initial task log entry.'),
      },
      ['objective'],
    ),
    parameters: z.object({
      objective: z.string().min(1),
      constraints: z.array(z.string()).default([]),
      requiredTools: z.array(z.string()).default([]),
      approvalRequirements: z.array(z.string()).default([]),
      initialLog: z.string().default(''),
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
    description: 'Reserve a reviewed code-execution task for a dedicated worker bridge; this does not execute code until an approved adapter is configured.',
    inputSchema: objectSchema({ taskId: stringSchema('Delegation task ID.'), command: stringSchema('Command or script to execute.'), workingDirectory: stringSchema('Working directory.') }, ['taskId', 'command']),
    parameters: z.object({ taskId: z.string().min(1), command: z.string().min(1), workingDirectory: z.string().default('.') }),
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
    executor: unavailableProvider('delegation', 'worker-bridge'),
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
    },
    approval: {
      executionId,
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

function enforceApprovalLimits(definition: RegisteredToolDefinition, input: any, context: RuntimeContext, approvedThroughUi: boolean, executionId?: string, sanitizedInput?: Record<string, unknown>) {
  if (definition.humanApprovalRequired && !approvedThroughUi) {
    const reason = input?.confirmedByUser === true ? 'missing_react_ui_approval_context' : 'missing_explicit_user_approval';
    return approvalBlockedResult(definition, context, reason, executionId, sanitizedInput);
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

export async function executeRegisteredTool(name: string, input: unknown, context: RuntimeContext) {
  const definition = getRegisteredTool(name);
  if (!definition) throw new Error(`Unknown registered tool: ${name}`);
  if (!context?.sessionId) throw new Error(`Runtime context is missing for ${definition.name}`);

  const normalizedInput = normalizeToolInput(input);
  const parsedInput = definition.parameters.parse(normalizedInput) as Record<string, unknown>;
  const sanitizedInput = sanitizeAuditInput(parsedInput, definition.audit.sensitiveFields || []);
  const approved = !definition.humanApprovalRequired || Boolean(parsedInput.confirmedByUser === true && context.approvedExecutionId);
  const executionRecord = createExecutionRecord({
    kind: 'tool_call',
    whoRequested: 'user',
    chosenByAgent: context.agent || 'elora',
    action: definition.name,
    inputPayload: sanitizedInput,
    riskLevel: definition.riskLevel,
    approvalStatus: definition.humanApprovalRequired ? (approved ? 'approved' : 'pending') : 'not_required',
    linkedIds: {
      sessionId: context.sessionId,
      voiceSessionId: context.voiceSessionId,
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
    workspaceRoot: definition.audit.category === 'code' || definition.audit.category === 'vscode' ? workspaceRoot() : undefined,
    input: sanitizedInput,
  });

  const approvalBlock = enforceApprovalLimits(definition, parsedInput, context, Boolean(approved), executionRecord.id, sanitizedInput);
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
      originalInput: parsedInput,
      requestedAt: executionRecord.timestamps.requestedAt,
    };
    await writeExecutionRecord(blockedRecord);
    await writeToolAuditLog({
      event: `${definition.name}.approval_required`,
      tool: definition.name,
      sessionId: context.sessionId,
      riskLevel: definition.riskLevel,
      humanApprovalRequired: definition.humanApprovalRequired,
      approved: false,
      workspaceRoot: definition.audit.category === 'code' || definition.audit.category === 'vscode' ? workspaceRoot() : undefined,
      input: sanitizedInput,
      resultStatus: 'approval_required',
    });
    return approvalBlock;
  }

  try {
    const result = await definition.executor(parsedInput, context);
    const completedRecord = completeExecutionRecord(executionRecord, {
      status: 'completed',
      executionResult: result,
      providerResponseSummary: summarizeProviderResponse(result),
      approvalStatus: approved ? 'approved' : 'not_required',
      receiptSummary: `${definition.name} completed`,
    });
    await writeExecutionRecord(completedRecord);
    await writeToolAuditLog({
      event: definition.audit.logEvents[1] || `${definition.name}.completed`,
      tool: definition.name,
      sessionId: context.sessionId,
      riskLevel: definition.riskLevel,
      humanApprovalRequired: definition.humanApprovalRequired,
      approved,
      workspaceRoot: definition.audit.category === 'code' || definition.audit.category === 'vscode' ? workspaceRoot() : undefined,
      input: sanitizedInput,
      resultStatus: 'completed',
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failedRecord = completeExecutionRecord(executionRecord, {
      status: 'failed',
      errors: [message],
      providerResponseSummary: message,
      approvalStatus: approved ? 'approved' : 'unknown',
      receiptSummary: `${definition.name} failed: ${message}`,
    });
    await writeExecutionRecord(failedRecord);
    await writeToolAuditLog({
      event: `${definition.name}.failed`,
      tool: definition.name,
      sessionId: context.sessionId,
      riskLevel: definition.riskLevel,
      humanApprovalRequired: definition.humanApprovalRequired,
      approved,
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
    needsApproval: false,
    execute: async (input: any, runContext: any) => {
      const context = runContext?.context as RuntimeContext | undefined;
      if (!context) throw new Error(`Runtime context is missing for ${definition.name}`);
      return executeRegisteredTool(definition.name, input, context);
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

export const sharedRuntimeToolCategories: ToolCategory[] = ['calendar', 'gmail', 'drive', 'sheets', 'crm', 'clay', 'leadgen', 'intake', 'voice', 'memory', 'delegation'];
export const nexoraRuntimeToolCategories: ToolCategory[] = [...sharedRuntimeToolCategories, 'code', 'vscode'];

export const runtimeTools = runtimeToolsForCategories(sharedRuntimeToolCategories);
export const safeRuntimeTools = runtimeToolsForRiskLevels(['read']);
export const nexoraRuntimeTools = runtimeToolsForCategories(nexoraRuntimeToolCategories);

export const toolManifest = toolRegistry.map(({ executor: _executor, parameters: _parameters, ...definition }) => definition);

export const toolCategories = [...new Set(toolRegistry.map((definition) => definition.audit.category))];
