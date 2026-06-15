export type DigitalOceanInfrastructureOperation = 'create' | 'update' | 'delete' | 'destroy';

export interface DigitalOceanInfrastructureApprovalInput {
  operation: DigitalOceanInfrastructureOperation;
  resourceName?: string;
  region?: string;
  size?: string;
  estimatedCost?: string | number | null;
  dryRunPlan?: string | Record<string, unknown> | Array<unknown>;
  confirmedByUser?: boolean;
  approvalNote?: string;
  typedConfirmation?: string;
  allowDestructiveDelete?: boolean;
}

export interface DigitalOceanApprovalBlock {
  ok: false;
  provider: 'digitalocean';
  status: 'approval_required' | 'policy_blocked';
  reason: string;
  message: string;
  approvalPolicy: {
    riskLevel: 'purchase_or_commit';
    operation: DigitalOceanInfrastructureOperation;
    destructive: boolean;
    requiredTypedConfirmation?: string;
    requirements: string[];
    received: {
      confirmedByUser: boolean;
      approvalNotePresent: boolean;
      resourceNamePresent: boolean;
      regionPresent: boolean;
      sizePresent: boolean;
      estimatedCostPresent: boolean;
      dryRunPlanPresent: boolean;
      typedConfirmationPresent: boolean;
      allowDestructiveDelete: boolean;
    };
  };
}

function hasValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== undefined && value !== null;
}

function destructiveTypedConfirmation(resourceName: string) {
  return `delete ${resourceName}`;
}

export function isDigitalOceanDestructiveOperation(operation: DigitalOceanInfrastructureOperation) {
  return operation === 'delete' || operation === 'destroy';
}

export function requireDigitalOceanInfrastructureApproval(input: DigitalOceanInfrastructureApprovalInput): DigitalOceanApprovalBlock | null {
  const operation = input.operation;
  const destructive = isDigitalOceanDestructiveOperation(operation);
  const resourceName = typeof input.resourceName === 'string' ? input.resourceName.trim() : '';
  const approvalNote = typeof input.approvalNote === 'string' ? input.approvalNote.trim() : '';
  const typedConfirmation = typeof input.typedConfirmation === 'string' ? input.typedConfirmation.trim() : '';
  const requiredTypedConfirmation = destructive && resourceName ? destructiveTypedConfirmation(resourceName) : undefined;
  const missing: string[] = [];

  if (input.confirmedByUser !== true) missing.push('confirmedByUser must be true');
  if (!approvalNote) missing.push('approvalNote must explicitly describe the user approval');
  if (!resourceName) missing.push('resourceName is required');
  if (!hasValue(input.region)) missing.push('region is required');
  if (!hasValue(input.size)) missing.push('size is required');
  if (!hasValue(input.estimatedCost)) missing.push('estimatedCost is required when available; pass "unavailable" if no estimate exists');
  if (!hasValue(input.dryRunPlan)) missing.push('dryRunPlan is required before apply');

  if (destructive) {
    if (input.allowDestructiveDelete !== true) missing.push('destructive delete/destroy is blocked by default; set allowDestructiveDelete only after policy approval');
    if (!requiredTypedConfirmation || typedConfirmation !== requiredTypedConfirmation) {
      missing.push(`typedConfirmation must exactly equal "${requiredTypedConfirmation || 'delete <resourceName>'}"`);
    }
  }

  if (missing.length === 0) return null;

  return {
    ok: false,
    provider: 'digitalocean',
    status: destructive && input.allowDestructiveDelete !== true ? 'policy_blocked' : 'approval_required',
    reason: missing.join('; '),
    message: `DigitalOcean ${operation} is a high-risk infrastructure action and cannot proceed until all approval requirements are satisfied.`,
    approvalPolicy: {
      riskLevel: 'purchase_or_commit',
      operation,
      destructive,
      requiredTypedConfirmation,
      requirements: missing,
      received: {
        confirmedByUser: input.confirmedByUser === true,
        approvalNotePresent: Boolean(approvalNote),
        resourceNamePresent: Boolean(resourceName),
        regionPresent: hasValue(input.region),
        sizePresent: hasValue(input.size),
        estimatedCostPresent: hasValue(input.estimatedCost),
        dryRunPlanPresent: hasValue(input.dryRunPlan),
        typedConfirmationPresent: Boolean(typedConfirmation),
        allowDestructiveDelete: input.allowDestructiveDelete === true,
      },
    },
  };
}
