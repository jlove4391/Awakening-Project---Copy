import type { RuntimeContext } from '../../types.js';
import { completeExecutionRecord, createExecutionRecord, summarizeProviderResponse, writeExecutionRecord } from '../../executions.js';

export interface CrmApprovalInput {
  confirmedByUser?: boolean;
  approvalNote?: string;
}

export interface CrmProviderInput {
  provider?: string;
}

export interface CrmLookupInput extends CrmProviderInput {
  query: string;
}

export interface CrmUpsertContactInput extends CrmApprovalInput, CrmProviderInput {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  notes?: string;
  leadId?: string;
}

export interface CrmUpdateLeadStatusInput extends CrmApprovalInput, CrmProviderInput {
  contactId?: string;
  email?: string;
  leadId?: string;
  status: string;
  statusNote?: string;
}

export interface CrmAppendActivityInput extends CrmApprovalInput, CrmProviderInput {
  contactId?: string;
  email?: string;
  leadId?: string;
  activityType: string;
  title: string;
  body?: string;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
}

export interface CrmContact {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  notes?: string;
  provider: string;
  updatedAt: string;
}

export interface CrmProvider {
  key: string;
  lookupContact(input: CrmLookupInput): Promise<unknown>;
  upsertContact(input: CrmUpsertContactInput): Promise<unknown>;
  updateLeadStatus(input: CrmUpdateLeadStatusInput): Promise<unknown>;
  appendActivity(input: CrmAppendActivityInput): Promise<unknown>;
}

function requireApproval(input: CrmApprovalInput, action: string) {
  if (input.confirmedByUser !== true) {
    return {
      ok: false,
      status: 'approval_required',
      action,
      message: 'CRM writes require explicit user approval before the CRM adapter is called.',
    };
  }
  return null;
}

function configuredProvider(provider?: string) {
  return provider && provider !== 'default' ? provider : process.env.CRM_PROVIDER || 'local-crm';
}

function localContactId(input: { email?: string; leadId?: string; contactId?: string }) {
  if (input.contactId) return input.contactId;
  if (input.leadId) return input.leadId;
  if (input.email) return `crm_${Buffer.from(input.email).toString('base64url').slice(0, 24)}`;
  return `crm_${Date.now().toString(36)}`;
}

function nowIso() {
  return new Date().toISOString();
}

class LocalNoopCrmProvider implements CrmProvider {
  constructor(public readonly key: string) {}

  async lookupContact(input: CrmLookupInput) {
    return {
      ok: true,
      status: 'not_configured_noop',
      provider: this.key,
      contacts: [],
      message: 'CRM lookup adapter is installed. Configure a provider-specific client to return live CRM contacts.',
    };
  }

  async upsertContact(input: CrmUpsertContactInput) {
    const contact: CrmContact = {
      id: localContactId(input),
      email: input.email,
      firstName: input.firstName || '',
      lastName: input.lastName || '',
      company: input.company || '',
      notes: input.notes || '',
      provider: this.key,
      updatedAt: nowIso(),
    };
    return {
      ok: true,
      status: 'queued_noop',
      provider: this.key,
      contact,
      message: 'CRM adapter accepted the write as a local no-op because no live CRM credentials are configured.',
    };
  }

  async updateLeadStatus(input: CrmUpdateLeadStatusInput) {
    return {
      ok: true,
      status: 'queued_noop',
      provider: this.key,
      lead: {
        id: localContactId(input),
        email: input.email || '',
        leadId: input.leadId || '',
        status: input.status,
        statusNote: input.statusNote || '',
        updatedAt: nowIso(),
      },
      message: 'CRM adapter accepted the lead status update as a local no-op because no live CRM credentials are configured.',
    };
  }

  async appendActivity(input: CrmAppendActivityInput) {
    return {
      ok: true,
      status: 'queued_noop',
      provider: this.key,
      activity: {
        id: `activity_${Buffer.from(`${localContactId(input)}:${input.activityType}:${input.title}`).toString('base64url').slice(0, 24)}`,
        contactId: localContactId(input),
        email: input.email || '',
        leadId: input.leadId || '',
        activityType: input.activityType,
        title: input.title,
        body: input.body || '',
        occurredAt: input.occurredAt || nowIso(),
        metadata: input.metadata || {},
      },
      message: 'CRM adapter accepted the activity append as a local no-op because no live CRM credentials are configured.',
    };
  }
}

const providerFactories: Record<string, (key: string) => CrmProvider> = {
  'local-crm': (key) => new LocalNoopCrmProvider(key),
  local: (key) => new LocalNoopCrmProvider(key),
};

export function resolveCrmProvider(provider?: string): CrmProvider {
  const key = configuredProvider(provider);
  const createProvider = providerFactories[key] || providerFactories['local-crm'];
  return createProvider(key);
}

async function writeCrmReceipt(action: string, input: unknown, result: unknown, context: RuntimeContext) {
  const record = createExecutionRecord({
    kind: 'runtime_action',
    whoRequested: 'leadgen.workflow',
    chosenByAgent: context.agent || 'elora',
    action,
    inputPayload: input,
    riskLevel: 'write',
    approvalStatus: 'approved',
    executionResult: result,
    providerResponseSummary: summarizeProviderResponse(result),
    linkedIds: { sessionId: context.sessionId, voiceSessionId: context.voiceSessionId },
    status: 'running',
    startedAt: new Date().toISOString(),
    receiptSummary: `${action} requested`,
  });
  const completed = completeExecutionRecord(record, {
    status: 'completed',
    executionResult: result,
    providerResponseSummary: summarizeProviderResponse(result),
    approvalStatus: 'approved',
    receiptSummary: `${action} completed`,
  });
  await writeExecutionRecord(completed);
  return { id: completed.id, summary: completed.receipt.summary, status: completed.status };
}

async function runApprovedCrmWrite<TInput extends CrmApprovalInput & CrmProviderInput>(
  action: string,
  input: TInput,
  context: RuntimeContext | undefined,
  execute: (provider: CrmProvider) => Promise<unknown>,
) {
  const approvalBlock = requireApproval(input, action);
  if (approvalBlock) return approvalBlock;

  const result = await execute(resolveCrmProvider(input.provider));
  const receipt = context ? await writeCrmReceipt(action, { ...input, confirmedByUser: true }, result, context) : undefined;
  return { ...(result as Record<string, unknown>), receipt };
}

export async function lookupCrmContact(input: CrmLookupInput) {
  return resolveCrmProvider(input.provider).lookupContact(input);
}

export async function upsertCrmContact(input: CrmUpsertContactInput, context?: RuntimeContext) {
  return runApprovedCrmWrite('crm.upsert_contact', input, context, (provider) => provider.upsertContact(input));
}

export async function updateLeadStatus(input: CrmUpdateLeadStatusInput, context?: RuntimeContext) {
  return runApprovedCrmWrite('crm.update_lead_status', input, context, (provider) => provider.updateLeadStatus(input));
}

export async function appendActivity(input: CrmAppendActivityInput, context?: RuntimeContext) {
  return runApprovedCrmWrite('crm.append_activity', input, context, (provider) => provider.appendActivity(input));
}
