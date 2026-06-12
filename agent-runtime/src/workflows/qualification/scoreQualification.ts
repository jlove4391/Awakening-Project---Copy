import type { QualificationRecord } from './types.js';

export type QualificationFitTier = 'excellent_fit' | 'good_fit' | 'conditional_fit' | 'poor_fit' | 'disqualified';

export type QualificationDisqualifier =
  | 'no_lead_response_dependency'
  | 'no_missed_call_or_follow_up_pain'
  | 'no_measurable_revenue_leak'
  | 'low_ability_to_pay'
  | 'not_ready_to_implement'
  | 'unacceptable_compliance_risk';

export type QualificationNextAction =
  | 'book_core_diagnostic'
  | 'send_roi_case_study_then_book'
  | 'run_revenue_leak_audit'
  | 'nurture_until_ready'
  | 'manual_compliance_review'
  | 'disqualify';

export interface QualificationScoreDimensions {
  leadResponseDependency: number;
  missedCallFollowUpPain: number;
  measurableRevenueLeak: number;
  abilityToPay: number;
  implementationReadiness: number;
  complianceRisk: number;
  estimatedMonthlyLeak: number;
}

export interface QualificationScoreResult {
  score: number;
  fitTier: QualificationFitTier;
  disqualifiers: QualificationDisqualifier[];
  recommendedNextAction: QualificationNextAction;
  dimensions: QualificationScoreDimensions;
  reasons: string[];
}

const HIGH_COMPLIANCE_TERMS = [
  'hipaa',
  'patient',
  'medical',
  'clinic',
  'dental',
  'healthcare',
  'therapy',
  'legal',
  'law firm',
  'attorney',
  'finance',
  'financial',
  'insurance',
  'credit',
  'minor',
  'children',
];

const FOLLOW_UP_PAIN_TERMS = [
  'missed call',
  'voicemail',
  'after hours',
  'slow response',
  'follow up',
  'follow-up',
  'lead response',
  'no show',
  'no-show',
  'fallthrough',
  'fall through',
  'crack',
  'manual',
  'forgot',
  'lost lead',
  'unanswered',
  'callback',
];

const READINESS_TERMS = ['crm', 'calendar', 'booking', 'intake', 'pipeline', 'tracking', 'automation', 'zapier', 'hubspot', 'salesforce'];
const NOT_READY_TERMS = ['no budget', 'not now', 'next year', 'just browsing', 'too busy', 'not interested', 'no owner', 'no decision'];

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalized(value: string | undefined) {
  return (value || '').trim().toLowerCase();
}

function includesAny(text: string, terms: readonly string[]) {
  return terms.some((term) => text.includes(term));
}

function joinedQualificationText(record: QualificationRecord) {
  return [
    record.responseSpeed,
    record.crmTrackingSystem,
    record.desired30DayImprovement,
    ...record.crackFallthroughPoints,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function responseSpeedMinutes(responseSpeed: string) {
  const text = normalized(responseSpeed);
  if (!text) return undefined;
  if (/instant|immediate|real[ -]?time|under\s*5/u.test(text)) return 5;

  const numberMatch = text.match(/(\d+(?:\.\d+)?)/u);
  if (!numberMatch) {
    if (/same day/u.test(text)) return 480;
    if (/next day|24\s*h/u.test(text)) return 1440;
    if (/days?/u.test(text)) return 2880;
    if (/hours?|hrs?/u.test(text)) return 180;
    return undefined;
  }

  const value = Number(numberMatch[1]);
  if (!Number.isFinite(value)) return undefined;
  if (/day/u.test(text)) return value * 1440;
  if (/hour|hr/u.test(text)) return value * 60;
  return value;
}

function leadResponseDependency(record: QualificationRecord, qualificationText: string) {
  const minutes = responseSpeedMinutes(record.responseSpeed);
  const volumeScore = record.monthlyLeadVolume >= 150 ? 35 : record.monthlyLeadVolume >= 75 ? 28 : record.monthlyLeadVolume >= 30 ? 20 : record.monthlyLeadVolume >= 10 ? 12 : 4;
  const speedScore = minutes === undefined ? 10 : minutes <= 15 ? 8 : minutes <= 60 ? 18 : minutes <= 240 ? 28 : 35;
  const painScore = includesAny(qualificationText, ['lead response', 'slow response', 'unanswered', 'callback']) ? 25 : 10;

  return clampScore(volumeScore + speedScore + painScore);
}

function missedCallFollowUpPain(record: QualificationRecord, qualificationText: string) {
  const missedCalls = record.missedCallsMessages;
  const missedCallScore = missedCalls >= 30 ? 45 : missedCalls >= 15 ? 36 : missedCalls >= 5 ? 26 : missedCalls > 0 ? 16 : 0;
  const crackScore = Math.min(30, record.crackFallthroughPoints.length * 10);
  const textScore = includesAny(qualificationText, FOLLOW_UP_PAIN_TERMS) ? 25 : 8;

  return clampScore(missedCallScore + crackScore + textScore);
}

function estimatedMonthlyLeak(record: QualificationRecord) {
  const closeRate = record.closeRate > 1 ? record.closeRate / 100 : record.closeRate;
  const normalizedCloseRate = Math.max(0, Math.min(1, closeRate));
  const missedCalls = record.missedCallsMessages || Math.round(record.monthlyLeadVolume * 0.08);

  return Math.round(missedCalls * record.averageJobCustomerValue * normalizedCloseRate);
}

function measurableRevenueLeak(record: QualificationRecord, leak: number) {
  const hasInputs = record.monthlyLeadVolume > 0 && record.averageJobCustomerValue > 0 && record.closeRate > 0;
  const leakScore = leak >= 25000 ? 55 : leak >= 10000 ? 45 : leak >= 5000 ? 35 : leak >= 1500 ? 24 : leak > 0 ? 14 : 0;
  const measurementScore = hasInputs ? 30 : record.missedCallsMessages > 0 ? 18 : 0;
  const trackingScore = normalized(record.crmTrackingSystem) ? 15 : 5;

  return clampScore(leakScore + measurementScore + trackingScore);
}

function abilityToPay(record: QualificationRecord, leak: number) {
  const valueScore = record.averageJobCustomerValue >= 5000 ? 35 : record.averageJobCustomerValue >= 1500 ? 28 : record.averageJobCustomerValue >= 500 ? 18 : record.averageJobCustomerValue > 0 ? 10 : 0;
  const volumeScore = record.monthlyLeadVolume >= 100 ? 25 : record.monthlyLeadVolume >= 40 ? 20 : record.monthlyLeadVolume >= 15 ? 12 : 5;
  const leakScore = leak >= 10000 ? 30 : leak >= 5000 ? 22 : leak >= 1500 ? 14 : leak > 0 ? 8 : 0;

  return clampScore(valueScore + volumeScore + leakScore + 10);
}

function implementationReadiness(record: QualificationRecord, qualificationText: string) {
  const hasTracking = normalized(record.crmTrackingSystem).length > 0;
  const hasImprovementGoal = normalized(record.desired30DayImprovement).length > 0;
  const readinessScore = hasTracking ? 34 : 14;
  const improvementScore = hasImprovementGoal ? 26 : 8;
  const signalScore = includesAny(qualificationText, READINESS_TERMS) ? 22 : 10;
  const blockerPenalty = includesAny(qualificationText, NOT_READY_TERMS) ? 35 : 0;

  return clampScore(readinessScore + improvementScore + signalScore + 10 - blockerPenalty);
}

function complianceRisk(qualificationText: string) {
  const matchedTerms = HIGH_COMPLIANCE_TERMS.filter((term) => qualificationText.includes(term)).length;
  if (matchedTerms >= 3) return 85;
  if (matchedTerms === 2) return 72;
  if (matchedTerms === 1) return 58;
  return 25;
}

function buildDimensions(record: QualificationRecord): QualificationScoreDimensions {
  const qualificationText = joinedQualificationText(record);
  const monthlyLeak = estimatedMonthlyLeak(record);

  return {
    leadResponseDependency: leadResponseDependency(record, qualificationText),
    missedCallFollowUpPain: missedCallFollowUpPain(record, qualificationText),
    measurableRevenueLeak: measurableRevenueLeak(record, monthlyLeak),
    abilityToPay: abilityToPay(record, monthlyLeak),
    implementationReadiness: implementationReadiness(record, qualificationText),
    complianceRisk: complianceRisk(qualificationText),
    estimatedMonthlyLeak: monthlyLeak,
  };
}

function finalScore(dimensions: QualificationScoreDimensions) {
  const painFit =
    dimensions.leadResponseDependency * 0.2 +
    dimensions.missedCallFollowUpPain * 0.23 +
    dimensions.measurableRevenueLeak * 0.22 +
    dimensions.abilityToPay * 0.16 +
    dimensions.implementationReadiness * 0.14;
  const compliancePenalty = dimensions.complianceRisk >= 80 ? 12 : dimensions.complianceRisk >= 65 ? 6 : 0;

  return clampScore(painFit - compliancePenalty);
}

function disqualifiersFor(dimensions: QualificationScoreDimensions) {
  const disqualifiers: QualificationDisqualifier[] = [];

  if (dimensions.leadResponseDependency < 35) disqualifiers.push('no_lead_response_dependency');
  if (dimensions.missedCallFollowUpPain < 35) disqualifiers.push('no_missed_call_or_follow_up_pain');
  if (dimensions.measurableRevenueLeak < 35) disqualifiers.push('no_measurable_revenue_leak');
  if (dimensions.abilityToPay < 35) disqualifiers.push('low_ability_to_pay');
  if (dimensions.implementationReadiness < 35) disqualifiers.push('not_ready_to_implement');
  if (dimensions.complianceRisk >= 90) disqualifiers.push('unacceptable_compliance_risk');

  return disqualifiers;
}

function fitTier(score: number, disqualifiers: QualificationDisqualifier[], dimensions: QualificationScoreDimensions): QualificationFitTier {
  if (disqualifiers.includes('unacceptable_compliance_risk')) return 'disqualified';
  if (disqualifiers.length >= 3) return 'disqualified';
  if (score >= 82 && disqualifiers.length === 0 && dimensions.complianceRisk < 75) return 'excellent_fit';
  if (score >= 68 && disqualifiers.length <= 1) return 'good_fit';
  if (score >= 50 && disqualifiers.length <= 2) return 'conditional_fit';
  return 'poor_fit';
}

function recommendedNextAction(tier: QualificationFitTier, disqualifiers: QualificationDisqualifier[], dimensions: QualificationScoreDimensions): QualificationNextAction {
  if (tier === 'disqualified' || disqualifiers.includes('low_ability_to_pay')) return 'disqualify';
  if (dimensions.complianceRisk >= 75) return 'manual_compliance_review';
  if (disqualifiers.includes('no_measurable_revenue_leak')) return 'run_revenue_leak_audit';
  if (tier === 'excellent_fit') return 'book_core_diagnostic';
  if (tier === 'good_fit') return 'send_roi_case_study_then_book';
  return 'nurture_until_ready';
}

function reasonsFor(dimensions: QualificationScoreDimensions, disqualifiers: QualificationDisqualifier[], tier: QualificationFitTier) {
  const reasons = [
    `lead-response dependency scored ${dimensions.leadResponseDependency}/100`,
    `missed-call/follow-up pain scored ${dimensions.missedCallFollowUpPain}/100`,
    `measurable revenue leak scored ${dimensions.measurableRevenueLeak}/100`,
    `estimated monthly leak $${dimensions.estimatedMonthlyLeak.toLocaleString('en-US')}`,
    `ability to pay scored ${dimensions.abilityToPay}/100`,
    `implementation readiness scored ${dimensions.implementationReadiness}/100`,
    `compliance risk scored ${dimensions.complianceRisk}/100`,
    `fit tier: ${tier}`,
  ];

  if (disqualifiers.length) {
    reasons.push(`disqualifiers: ${disqualifiers.join(', ')}`);
  }

  return reasons;
}

export function scoreQualification(record: QualificationRecord): QualificationScoreResult {
  const dimensions = buildDimensions(record);
  const score = finalScore(dimensions);
  const disqualifiers = disqualifiersFor(dimensions);
  const tier = fitTier(score, disqualifiers, dimensions);

  return {
    score,
    fitTier: tier,
    disqualifiers,
    recommendedNextAction: recommendedNextAction(tier, disqualifiers, dimensions),
    dimensions,
    reasons: reasonsFor(dimensions, disqualifiers, tier),
  };
}
