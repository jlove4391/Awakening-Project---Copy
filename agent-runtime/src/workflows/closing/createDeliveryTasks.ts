import { createHash } from 'node:crypto';
import type { RuntimeAgentName, SharedRecordValue } from '@awakening/shared';
import type { FirstWinPlan, FirstWinPlanStep } from './createFirstWinPlan.js';
import type { ProjectRecord } from './types.js';

export type DeliveryTaskOwner = RuntimeAgentName;

export type DeliveryReviewStatus =
  | 'pending_internal_review'
  | 'approved_for_client_release'
  | 'changes_requested'
  | 'rejected';

export interface CreateDeliveryTasksInput {
  projectRecord: ProjectRecord;
  firstWinPlan: FirstWinPlan;
  assignedSpecialist: DeliveryTaskOwner | string;
  deadlineTargetHours?: number;
  createdAt?: string | Date;
}

export interface InternalDeliveryTask {
  id: string;
  projectId: string;
  firstWinPlanId: string;
  sourceStepId: string;
  title: string;
  objective: string;
  owner: DeliveryTaskOwner;
  dueDate: string;
  reviewStatus: DeliveryReviewStatus;
  linkedReceiptId: string;
  linkedAuditId: string;
  internalOnly: true;
  clientVisible: false;
  approvedForClientRelease: false;
  exposureGate: 'do_not_expose_to_client_until_approved';
  sourceSignals: string[];
  constraints: string[];
  createdAt: string;
  metadata: Record<string, SharedRecordValue>;
}

export interface DeliveryTaskBatch {
  id: string;
  projectId: string;
  firstWinPlanId: string;
  createdAt: string;
  deadlineTargetHours: number;
  owner: DeliveryTaskOwner;
  reviewStatus: 'pending_internal_review';
  internalOnly: true;
  clientVisible: false;
  approvedForClientRelease: false;
  tasks: InternalDeliveryTask[];
  linkedReceiptId: string;
  linkedAuditId: string;
}

const DELIVERY_SPECIALISTS: DeliveryTaskOwner[] = ['elora', 'nexora', 'kaz', 'jynx', 'kalyra'];
const MIN_DEADLINE_HOURS = 24;
const MAX_DEADLINE_HOURS = 48;
const DEFAULT_DEADLINE_HOURS = 36;

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

function normalizeSpecialist(value: DeliveryTaskOwner | string): DeliveryTaskOwner {
  const normalized = value.trim().toLowerCase();
  const specialist = DELIVERY_SPECIALISTS.find((candidate) => normalized === candidate || normalized.includes(candidate));

  if (!specialist) {
    throw new Error(`Unsupported assigned specialist: ${value}`);
  }

  return specialist;
}

function deadlineHours(value: number | undefined) {
  const hours = value ?? DEFAULT_DEADLINE_HOURS;

  if (!Number.isFinite(hours) || hours < MIN_DEADLINE_HOURS || hours > MAX_DEADLINE_HOURS) {
    throw new Error(`deadlineTargetHours must be between ${MIN_DEADLINE_HOURS} and ${MAX_DEADLINE_HOURS}.`);
  }

  return hours;
}

function dueDate(createdAt: string, hours: number) {
  return new Date(new Date(createdAt).getTime() + hours * 60 * 60 * 1000).toISOString();
}

function taskOwner(step: FirstWinPlanStep, assignedSpecialist: DeliveryTaskOwner): DeliveryTaskOwner {
  return step.owner === 'elora' ? 'elora' : assignedSpecialist;
}

function taskObjective(step: FirstWinPlanStep, plan: FirstWinPlan, project: ProjectRecord) {
  return [
    step.description,
    `First-win artifact: ${plan.artifactTitle}.`,
    project.firstWinTarget ? `Project first-win target: ${project.firstWinTarget}.` : undefined,
  ]
    .filter(Boolean)
    .join(' ');
}

function createTask(params: {
  projectRecord: ProjectRecord;
  firstWinPlan: FirstWinPlan;
  step: FirstWinPlanStep;
  assignedSpecialist: DeliveryTaskOwner;
  createdAt: string;
  dueDate: string;
}): InternalDeliveryTask {
  const owner = taskOwner(params.step, params.assignedSpecialist);
  const idSeed = {
    projectId: params.projectRecord.id,
    firstWinPlanId: params.firstWinPlan.id,
    stepId: params.step.id,
    owner,
  };
  const hash = stableHash(idSeed);
  const id = `delivery_task_${hash}`;

  return {
    id,
    projectId: params.projectRecord.id,
    firstWinPlanId: params.firstWinPlan.id,
    sourceStepId: params.step.id,
    title: params.step.title,
    objective: taskObjective(params.step, params.firstWinPlan, params.projectRecord),
    owner,
    dueDate: params.dueDate,
    reviewStatus: 'pending_internal_review',
    linkedReceiptId: `receipt_${id}`,
    linkedAuditId: `audit_${id}`,
    internalOnly: true,
    clientVisible: false,
    approvedForClientRelease: false,
    exposureGate: 'do_not_expose_to_client_until_approved',
    sourceSignals: params.step.sourceSignals,
    constraints: [
      'Internal delivery task only; do not send, show, publish, or summarize to the client before approval.',
      'Use only approved ProjectRecord and FirstWinPlan context when drafting deliverables.',
      'Keep all client-facing language behind Jordan review until approved_for_client_release.',
    ],
    createdAt: params.createdAt,
    metadata: {
      createdBy: 'createDeliveryTasks',
      planArtifactType: params.firstWinPlan.artifactType,
      selectedDomain: params.firstWinPlan.owner,
      approvalGate: params.step.approvalGate,
      internalOnly: true,
      clientVisible: false,
      approvedForClientRelease: false,
    },
  };
}

export function createDeliveryTasks(input: CreateDeliveryTasksInput): DeliveryTaskBatch {
  const createdAt = timestamp(input.createdAt);
  const hours = deadlineHours(input.deadlineTargetHours);
  const owner = normalizeSpecialist(input.assignedSpecialist);
  const taskDueDate = dueDate(createdAt, hours);
  const batchHash = stableHash({
    projectId: input.projectRecord.id,
    firstWinPlanId: input.firstWinPlan.id,
    owner,
    createdAt,
  });
  const id = `delivery_task_batch_${batchHash}`;

  return {
    id,
    projectId: input.projectRecord.id,
    firstWinPlanId: input.firstWinPlan.id,
    createdAt,
    deadlineTargetHours: hours,
    owner,
    reviewStatus: 'pending_internal_review',
    internalOnly: true,
    clientVisible: false,
    approvedForClientRelease: false,
    linkedReceiptId: `receipt_${id}`,
    linkedAuditId: `audit_${id}`,
    tasks: input.firstWinPlan.steps.map((step) => createTask({
      projectRecord: input.projectRecord,
      firstWinPlan: input.firstWinPlan,
      step,
      assignedSpecialist: owner,
      createdAt,
      dueDate: taskDueDate,
    })),
  };
}
