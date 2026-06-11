import type { RuntimeContext } from '../../types.js';
import { completeExecutionRecord, createExecutionRecord, summarizeProviderResponse, writeExecutionRecord } from '../../executions.js';

export interface CrmApprovalInput {
  confirmedByUser?: boolean;
  approvalNote?: string;
}

export interface CrmLookupInput {
  query: string;
  provider?: string;
}

export interface CrmUpsertContactInput extends CrmApprovalInput {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  notes?: string;
  provider?: string;
  leadId?: string;
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
  return provider || process.env.CRM_PROVIDER || 'local-crm';
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

export async function lookupCrmContact(input: CrmLookupInput) {
  return {
    ok: true,
    status: 'not_configured_noop',
    provider: configuredProvider(input.provider),
    contacts: [],
    message: 'CRM lookup adapter is installed. Configure a provider-specific client to return live CRM contacts.',
  };
}

export async function upsertCrmContact(input: CrmUpsertContactInput, context?: RuntimeContext) {
  const approvalBlock = requireApproval(input, 'crm.upsert_contact');
  if (approvalBlock) return approvalBlock;

  const provider = configuredProvider(input.provider);
  const contact = {
    id: input.leadId || `crm_${Buffer.from(input.email).toString('base64url').slice(0, 24)}`,
    email: input.email,
    firstName: input.firstName || '',
    lastName: input.lastName || '',
    company: input.company || '',
    notes: input.notes || '',
    provider,
    updatedAt: new Date().toISOString(),
  };
  const result = {
    ok: true,
    status: 'queued_noop',
    provider,
    contact,
    message: 'CRM adapter accepted the write as a local no-op because no live CRM credentials are configured.',
  };

  const receipt = context ? await writeCrmReceipt('crm.upsert_contact', { ...input, confirmedByUser: true }, result, context) : undefined;
  return { ...result, receipt };
}
