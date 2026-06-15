import { randomUUID } from 'node:crypto';
import type {
  DatabankProvider,
  DatabaseEngine,
  DatabaseMigrationPlan,
  DatabaseSchemaSummary,
} from '../../providers/databank/types.js';
import type { WorkflowReceiptContext, WorkflowExecutionReceipt } from '../receipts.js';
import {
  createWorkflowExecutionRecord,
  summarizeProviderResponse,
  writeCompletedWorkflowExecutionReceipt,
} from '../receipts.js';

export type DatabankMigrationValidationStatus = 'valid' | 'invalid' | 'not_supported';
export type DatabankMigrationExecutionStatus = 'executed' | 'failed' | 'approval_required' | 'backup_required' | 'validation_required';

export interface DatabankMigrationApproval {
  confirmedByUser: boolean;
  approvalNote: string;
  approvedBy?: string;
}

export interface DatabankMigrationSafetyNotes {
  backupNote: string;
  rollbackNote: string;
}

export interface DatabankMigrationValidationResult {
  id: string;
  migrationPlanId: string;
  connectionId: string;
  provider: string;
  engine: DatabaseEngine;
  status: DatabankMigrationValidationStatus;
  dryRun: boolean;
  validatedAt: string;
  summary: string;
  warnings: string[];
  providerResult?: unknown;
  metadata?: Record<string, unknown>;
}

export interface DatabankMigrationExecutionResult {
  id: string;
  migrationPlanId: string;
  connectionId: string;
  provider: string;
  engine: DatabaseEngine;
  status: DatabankMigrationExecutionStatus;
  executedAt?: string;
  message: string;
  backupNote: string;
  rollbackNote: string;
  validation?: DatabankMigrationValidationResult;
  providerResult?: unknown;
  receipt?: WorkflowExecutionReceipt;
  metadata?: Record<string, unknown>;
}

export interface DatabankMigrationAdapter extends DatabankProvider {
  validateMigration?(plan: DatabaseMigrationPlan): Promise<DatabankMigrationValidationResult | unknown>;
  dryRunMigration?(plan: DatabaseMigrationPlan): Promise<DatabankMigrationValidationResult | unknown>;
  executeMigration?(input: {
    plan: DatabaseMigrationPlan;
    approval: DatabankMigrationApproval;
    safety: DatabankMigrationSafetyNotes;
    validation?: DatabankMigrationValidationResult;
  }): Promise<unknown>;
}

export interface ProposeDatabankMigrationInput {
  connectionId: string;
  summary: string;
  proposedSql?: string[];
  metadata?: Record<string, unknown>;
}

export interface ExecuteDatabankMigrationInput {
  plan: DatabaseMigrationPlan;
  context: WorkflowReceiptContext;
  approval: DatabankMigrationApproval;
  safety: DatabankMigrationSafetyNotes;
  validation?: DatabankMigrationValidationResult;
  requireValidation?: boolean;
}

function now() {
  return new Date().toISOString();
}

function hasText(value: string | undefined) {
  return Boolean(value && value.trim().length > 0);
}

function assertStableMigrationContract(provider: DatabankMigrationAdapter) {
  if (provider.key === 'digitalocean') {
    throw new Error('DigitalOcean databank migrations are intentionally disabled until provider-neutral migration contracts are stable.');
  }
}

function assertBackupAndRollbackNotes(safety: DatabankMigrationSafetyNotes) {
  if (!hasText(safety.backupNote) || !hasText(safety.rollbackNote)) {
    throw new Error('Database migrations require both a backup note and a rollback note before execution.');
  }
}

function assertExplicitApproval(approval: DatabankMigrationApproval) {
  if (!approval.confirmedByUser || !hasText(approval.approvalNote)) {
    throw new Error('Database migrations require explicit user approval and a non-empty approval note before execution.');
  }
}

function normalizeValidationResult(
  plan: DatabaseMigrationPlan,
  dryRun: boolean,
  providerResult: DatabankMigrationValidationResult | unknown,
): DatabankMigrationValidationResult {
  if (providerResult && typeof providerResult === 'object' && 'migrationPlanId' in providerResult && 'status' in providerResult) {
    return providerResult as DatabankMigrationValidationResult;
  }

  return {
    id: randomUUID(),
    migrationPlanId: plan.id,
    connectionId: plan.connectionId,
    provider: plan.provider,
    engine: plan.engine,
    status: 'valid',
    dryRun,
    validatedAt: now(),
    summary: summarizeProviderResponse(providerResult),
    warnings: [],
    providerResult,
  };
}

export async function inspectDatabankSchema(provider: DatabankMigrationAdapter, connectionId: string): Promise<DatabaseSchemaSummary> {
  assertStableMigrationContract(provider);
  return provider.summarizeSchema(connectionId);
}

export async function proposeDatabankMigration(
  provider: DatabankMigrationAdapter,
  input: ProposeDatabankMigrationInput,
): Promise<DatabaseMigrationPlan> {
  assertStableMigrationContract(provider);
  if (!provider.planMigration) {
    throw new Error(`Databank provider ${provider.key} does not implement provider-neutral migration planning.`);
  }

  const schema = await inspectDatabankSchema(provider, input.connectionId);
  const plan = await provider.planMigration({
    connectionId: input.connectionId,
    summary: input.summary,
    proposedSql: input.proposedSql,
    metadata: {
      ...input.metadata,
      inspectedSchemaGeneratedAt: schema.generatedAt,
      inspectedTableCount: schema.tables.length,
      providerNeutralContract: true,
    },
  });

  return {
    ...plan,
    readOnlyInspectionComplete: true,
    approvalRequired: true,
    status: plan.status === 'draft' ? 'requires_review' : plan.status,
  };
}

export async function validateDatabankMigration(
  provider: DatabankMigrationAdapter,
  plan: DatabaseMigrationPlan,
  options: { dryRun?: boolean } = {},
): Promise<DatabankMigrationValidationResult> {
  assertStableMigrationContract(provider);
  const useDryRun = options.dryRun ?? true;
  const validate = useDryRun ? provider.dryRunMigration || provider.validateMigration : provider.validateMigration;

  if (!validate) {
    return {
      id: randomUUID(),
      migrationPlanId: plan.id,
      connectionId: plan.connectionId,
      provider: plan.provider,
      engine: plan.engine,
      status: 'not_supported',
      dryRun: useDryRun,
      validatedAt: now(),
      summary: `Provider ${provider.key} does not implement migration ${useDryRun ? 'dry-run' : 'validation'}.`,
      warnings: ['Provider-neutral migration validation is not available for this adapter yet.'],
    };
  }

  const providerResult = await validate.call(provider, plan);
  return normalizeValidationResult(plan, useDryRun, providerResult);
}

export async function executeApprovedDatabankMigration(
  provider: DatabankMigrationAdapter,
  input: ExecuteDatabankMigrationInput,
): Promise<DatabankMigrationExecutionResult> {
  assertStableMigrationContract(provider);
  assertBackupAndRollbackNotes(input.safety);
  assertExplicitApproval(input.approval);

  if (!provider.executeMigration) {
    throw new Error(`Databank provider ${provider.key} does not implement provider-neutral migration execution.`);
  }

  const validation = input.validation || (input.requireValidation === false ? undefined : await validateDatabankMigration(provider, input.plan));
  if (validation && validation.status !== 'valid') {
    return {
      id: randomUUID(),
      migrationPlanId: input.plan.id,
      connectionId: input.plan.connectionId,
      provider: input.plan.provider,
      engine: input.plan.engine,
      status: 'validation_required',
      message: `Migration was not executed because validation status is ${validation.status}.`,
      backupNote: input.safety.backupNote,
      rollbackNote: input.safety.rollbackNote,
      validation,
    };
  }

  const record = createWorkflowExecutionRecord({
    workflow: 'databank.migrations',
    action: 'databank.migration.execute',
    context: input.context,
    inputPayload: {
      migrationPlanId: input.plan.id,
      connectionId: input.plan.connectionId,
      provider: input.plan.provider,
      engine: input.plan.engine,
      backupNote: input.safety.backupNote,
      rollbackNote: input.safety.rollbackNote,
      approvalNote: input.approval.approvalNote,
    },
    riskLevel: 'purchase_or_commit',
    approvalStatus: 'approved',
    status: 'running',
    receiptSummary: `Databank migration ${input.plan.id} approved for execution`,
  });

  try {
    const providerResult = await provider.executeMigration({
      plan: input.plan,
      approval: input.approval,
      safety: input.safety,
      validation,
    });
    const executedAt = now();
    const result: DatabankMigrationExecutionResult = {
      id: randomUUID(),
      migrationPlanId: input.plan.id,
      connectionId: input.plan.connectionId,
      provider: input.plan.provider,
      engine: input.plan.engine,
      status: 'executed',
      executedAt,
      message: `Migration ${input.plan.id} executed through provider-neutral adapter ${provider.key}.`,
      backupNote: input.safety.backupNote,
      rollbackNote: input.safety.rollbackNote,
      validation,
      providerResult,
    };
    const receipt = await writeCompletedWorkflowExecutionReceipt(record, {
      status: 'completed',
      executionResult: result,
      providerResponseSummary: summarizeProviderResponse(providerResult),
      receiptSummary: result.message,
    });
    return { ...result, receipt };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown databank migration execution error.';
    await writeCompletedWorkflowExecutionReceipt(record, {
      status: 'failed',
      executionResult: { migrationPlanId: input.plan.id, error: message },
      errors: [message],
      receiptSummary: `Databank migration ${input.plan.id} failed`,
    });
    throw error;
  }
}
