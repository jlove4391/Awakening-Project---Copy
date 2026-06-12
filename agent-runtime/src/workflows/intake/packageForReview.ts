import type { IntakeRecord, SharedRecordValue } from '@awakening/shared';
import type {
  IntakeClassificationResult,
  IntakeClassificationRiskFlag,
  IntakeSpecialist,
} from './classifyIntake.js';

export type ReviewApprovalStatus = 'pending_jordan_review' | 'risk_review_required';

export type SpecialistDraftContent = string | Record<string, unknown>;

export interface PackageForReviewInput {
  intakeRecord: IntakeRecord;
  classification: IntakeClassificationResult;
  specialistDraftContent: SpecialistDraftContent;
  riskFlags?: IntakeClassificationRiskFlag[];
  recommendedNextStep: string;
  packagedAt?: string | Date;
}

export interface IntakeReviewSummary {
  intakeId: string;
  sessionId?: string;
  leadId?: string;
  clientId?: string;
  submittedAt?: string;
  summary: string;
  businessName: string;
  contactName: string;
  email: string;
  industry: string;
  desiredOutcome: string;
  timeline: string;
}

export interface IntakeReviewStatus {
  status: ReviewApprovalStatus;
  reviewRequiredBy: 'Jordan';
  approvedForExternalSend: false;
  externalSend: false;
  reason: string;
}

export interface IntakeReviewPackage {
  packageId: string;
  createdAt: string;
  intakeSummary: IntakeReviewSummary;
  specialistSelected: IntakeSpecialist;
  secondarySpecialists: IntakeSpecialist[];
  classification: IntakeClassificationResult;
  draftDeliverable: SpecialistDraftContent;
  caveats: string[];
  riskFlags: IntakeClassificationRiskFlag[];
  approvalReviewStatus: IntakeReviewStatus;
  suggestedNextActionForJordan: string;
  externalSend: false;
}

function timestamp(value: string | Date | undefined) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return new Date(value).toISOString();
  }

  return new Date().toISOString();
}

function stringValue(value: SharedRecordValue | undefined): string {
  return typeof value === 'string' ? value : '';
}

function summarizeRiskFlag(flag: IntakeClassificationRiskFlag) {
  return `${flag.type} risk in ${String(flag.field)}: ${flag.reason}`;
}

function createIntakeSummary(intakeRecord: IntakeRecord): IntakeReviewSummary {
  const responses = intakeRecord.responses ?? {};

  return {
    intakeId: intakeRecord.id,
    sessionId: intakeRecord.sessionId,
    leadId: intakeRecord.leadId,
    clientId: intakeRecord.clientId,
    submittedAt: intakeRecord.submittedAt,
    summary: intakeRecord.summary ?? '',
    businessName: stringValue(responses.businessName),
    contactName: stringValue(responses.contactName),
    email: stringValue(responses.email),
    industry: stringValue(responses.industry),
    desiredOutcome: stringValue(responses.desiredOutcome),
    timeline: stringValue(responses.timeline),
  };
}

function createCaveats(classification: IntakeClassificationResult, riskFlags: IntakeClassificationRiskFlag[]) {
  const caveats = [
    'Internal review package only; do not send externally.',
    'Jordan must review and approve the draft before any client-facing use.',
    `Classification confidence: ${classification.confidence}.`,
  ];

  if (classification.secondarySpecialists.length > 0) {
    caveats.push(`Secondary specialists to consider: ${classification.secondarySpecialists.join(', ')}.`);
  }

  if (riskFlags.length > 0) {
    caveats.push('Risk flags require additional human review before downstream action.');
    caveats.push(...riskFlags.map(summarizeRiskFlag));
  }

  return caveats;
}

function createReviewStatus(riskFlags: IntakeClassificationRiskFlag[]): IntakeReviewStatus {
  if (riskFlags.length > 0) {
    return {
      status: 'risk_review_required',
      reviewRequiredBy: 'Jordan',
      approvedForExternalSend: false,
      externalSend: false,
      reason: 'Risk flags are present, so Jordan must review before any next step or external use.',
    };
  }

  return {
    status: 'pending_jordan_review',
    reviewRequiredBy: 'Jordan',
    approvedForExternalSend: false,
    externalSend: false,
    reason: 'Draft deliverable is packaged for internal review only and has not been approved for external send.',
  };
}

export function packageForReview(input: PackageForReviewInput): IntakeReviewPackage {
  const createdAt = timestamp(input.packagedAt);
  const riskFlags = input.riskFlags ?? input.classification.riskFlags;

  return {
    packageId: `review_${input.intakeRecord.id}_${input.classification.primarySpecialist}`,
    createdAt,
    intakeSummary: createIntakeSummary(input.intakeRecord),
    specialistSelected: input.classification.primarySpecialist,
    secondarySpecialists: input.classification.secondarySpecialists,
    classification: input.classification,
    draftDeliverable: input.specialistDraftContent,
    caveats: createCaveats(input.classification, riskFlags),
    riskFlags,
    approvalReviewStatus: createReviewStatus(riskFlags),
    suggestedNextActionForJordan: input.recommendedNextStep,
    externalSend: false,
  };
}
