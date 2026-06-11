import type { RuntimeContext } from '../../types.js';
import { completeExecutionRecord, createExecutionRecord, summarizeProviderResponse, writeExecutionRecord } from '../../executions.js';

export interface ClayApprovalInput {
  confirmedByUser?: boolean;
  approvalNote?: string;
}

export interface EnrichPersonInput extends ClayApprovalInput {
  email?: string;
  linkedinUrl?: string;
  fullName?: string;
  company?: string;
  provider?: string;
}

function requireApproval(input: ClayApprovalInput, action: string) {
  if (input.confirmedByUser !== true) {
    return {
      ok: false,
      status: 'approval_required',
      action,
      message: 'Clay/enrichment purchases require explicit user approval before the enrichment adapter is called.',
    };
  }
  return null;
}

function configuredProvider(provider?: string) {
  return provider || process.env.CLAY_PROVIDER || 'local-clay';
}

async function writeEnrichmentReceipt(action: string, input: unknown, result: unknown, context: RuntimeContext) {
  const record = createExecutionRecord({
    kind: 'runtime_action',
    whoRequested: 'leadgen.workflow',
    chosenByAgent: context.agent || 'elora',
    action,
    inputPayload: input,
    riskLevel: 'purchase_or_commit',
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

export async function enrichPersonWithClay(input: EnrichPersonInput, context?: RuntimeContext) {
  const approvalBlock = requireApproval(input, 'clay.enrich_person');
  if (approvalBlock) return approvalBlock;

  const provider = configuredProvider(input.provider);
  const enrichment = {
    email: input.email || '',
    linkedinUrl: input.linkedinUrl || '',
    fullName: input.fullName || '',
    company: input.company || '',
    confidence: input.email || input.linkedinUrl ? 0.74 : 0.42,
    enrichedAt: new Date().toISOString(),
    provider,
  };
  const result = {
    ok: true,
    status: 'queued_noop',
    provider,
    enrichment,
    message: 'Clay/enrichment adapter accepted the request as a local no-op because no live enrichment credentials are configured.',
  };

  const receipt = context ? await writeEnrichmentReceipt('clay.enrich_person', { ...input, confirmedByUser: true }, result, context) : undefined;
  return { ...result, receipt };
}
