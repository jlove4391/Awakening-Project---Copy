import type { LeadRecord, LeadScoreDimensions, LeadgenIcp } from './types.js';

const DECISION_MAKER_TITLES = [
  'founder',
  'owner',
  'chief',
  'ceo',
  'coo',
  'cfo',
  'cto',
  'president',
  'partner',
  'principal',
  'director',
  'head',
  'vp',
  'vice president',
  'operations',
  'practice manager',
  'office manager',
];

const LOCAL_SERVICE_TERMS = [
  'clinic',
  'dental',
  'dentist',
  'hvac',
  'plumbing',
  'roofing',
  'legal',
  'law firm',
  'med spa',
  'salon',
  'contractor',
  'repair',
  'home service',
  'real estate',
  'chiropractic',
  'veterinary',
  'appointment',
  'booking',
  'local',
];

const MISSED_CALL_TERMS = ['missed call', 'phone', 'voicemail', 'after hours', 'call volume', 'appointment', 'booking', 'emergency', 'front desk', 'reception'];
const FOLLOW_UP_TERMS = ['follow up', 'follow-up', 'lead response', 'no show', 'no-show', 'pipeline', 'crm', 'manual', 'quote', 'estimate', 'inquiry', 'nurture'];
const AI_FIT_TERMS = ['automation', 'ai', 'workflow', 'manual', 'intake', 'scheduling', 'crm', 'follow up', 'follow-up', 'routing', 'qualification'];
const HIGH_VALUE_TERMS = ['enterprise', 'commercial', 'b2b', 'healthcare', 'legal', 'finance', 'real estate', 'construction', 'dental', 'medical'];
const COMPLIANCE_TERMS = ['healthcare', 'medical', 'dental', 'clinic', 'patient', 'hipaa', 'finance', 'financial', 'legal', 'law firm', 'insurance'];

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalized(value: string | undefined) {
  return (value || '').toLowerCase();
}

function joinedLeadText(lead: LeadRecord) {
  return [lead.title, lead.company, lead.market, lead.geography, ...lead.signals].filter(Boolean).join(' ').toLowerCase();
}

function includesAny(text: string, terms: readonly string[]) {
  return terms.some((term) => text.includes(term));
}

function numericEnrichmentValue(lead: LeadRecord, key: string) {
  const value = lead.enrichment?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/%$/, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function stringEnrichmentValue(lead: LeadRecord, key: string) {
  const value = lead.enrichment?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function industryFit(lead: LeadRecord, icp: LeadgenIcp) {
  const leadMarket = normalized(lead.market);
  const icpMarket = normalized(icp.market);
  if (leadMarket.includes(icpMarket) || icpMarket.includes(leadMarket)) return 90;

  const icpTokens = icpMarket.split(/\W+/).filter((token) => token.length > 2);
  const matchingTokens = icpTokens.filter((token) => joinedLeadText(lead).includes(token)).length;
  if (matchingTokens) return 65 + Math.min(20, matchingTokens * 5);

  return 40;
}

function localServiceFit(lead: LeadRecord, icp: LeadgenIcp, leadText: string) {
  const geography = normalized(lead.geography);
  const icpGeography = normalized(icp.geography);
  const geographyMatches = Boolean(geography && icpGeography && icpGeography !== 'any geography' && geography.includes(icpGeography));
  const isLocalService = includesAny(leadText, LOCAL_SERVICE_TERMS);

  if (geographyMatches && isLocalService) return 90;
  if (geographyMatches) return 78;
  if (isLocalService) return 72;
  if (!geography && icpGeography === 'any geography') return 55;
  return 45;
}

function contactConfidence(lead: LeadRecord) {
  const importedConfidence = numericEnrichmentValue(lead, 'confidence');
  if (importedConfidence !== undefined) return importedConfidence > 1 ? clampScore(importedConfidence) : clampScore(importedConfidence * 100);

  const phone = stringEnrichmentValue(lead, 'phone');
  if (lead.email && phone) return 92;
  if (lead.email) return 75;
  if (phone) return 68;
  if (lead.linkedinUrl) return 45;
  return 25;
}

function decisionMakerScore(lead: LeadRecord, icp: LeadgenIcp) {
  const title = normalized(lead.title);
  if (icp.titles.some((icpTitle) => title.includes(icpTitle.toLowerCase()))) return 92;
  if (includesAny(title, DECISION_MAKER_TITLES)) return 85;
  if (title) return 55;
  return 25;
}

function complianceRisk(leadText: string) {
  if (leadText.includes('hipaa') || leadText.includes('patient')) return 75;
  if (includesAny(leadText, COMPLIANCE_TERMS)) return 55;
  return 20;
}

function estimatedValue(leadText: string, dimensions: Omit<LeadScoreDimensions, 'estimatedValue' | 'recommendedFirstOffer'>) {
  const base = includesAny(leadText, HIGH_VALUE_TERMS) ? 12000 : 7500;
  const fitMultiplier = 0.75 + (dimensions.industryFit + dimensions.abilityToPay + dimensions.aiAutomationFit) / 400;
  const riskDiscount = 1 - dimensions.complianceRisk / 500;
  return Math.max(2500, Math.round((base * fitMultiplier * riskDiscount) / 500) * 500);
}

function recommendedFirstOffer(dimensions: Omit<LeadScoreDimensions, 'estimatedValue' | 'recommendedFirstOffer'>) {
  if (dimensions.complianceRisk >= 65) return 'Compliance-safe AI intake and follow-up audit';
  if (dimensions.missedCallLikelihood >= dimensions.followUpPainLikelihood && dimensions.missedCallLikelihood >= 70) return 'Missed-call capture and booking recovery pilot';
  if (dimensions.followUpPainLikelihood >= 70) return 'Automated lead follow-up and nurture pilot';
  if (dimensions.aiAutomationFit >= 75) return 'Workflow automation discovery sprint';
  return 'Low-risk revenue operations assessment';
}

function buildDimensions(lead: LeadRecord, icp: LeadgenIcp): LeadScoreDimensions {
  const leadText = joinedLeadText(lead);
  const hasLocalService = includesAny(leadText, LOCAL_SERVICE_TERMS);
  const dimensionsWithoutValue = {
    industryFit: clampScore(industryFit(lead, icp)),
    localServiceFit: clampScore(localServiceFit(lead, icp, leadText)),
    missedCallLikelihood: clampScore(includesAny(leadText, MISSED_CALL_TERMS) ? 85 : hasLocalService ? 70 : 45),
    followUpPainLikelihood: clampScore(includesAny(leadText, FOLLOW_UP_TERMS) ? 85 : lead.signals.length >= 2 ? 65 : 45),
    aiAutomationFit: clampScore(includesAny(leadText, AI_FIT_TERMS) ? 85 : hasLocalService ? 70 : 55),
    abilityToPay: clampScore(includesAny(leadText, HIGH_VALUE_TERMS) ? 82 : hasLocalService ? 68 : 58),
    decisionMakerIdentified: clampScore(decisionMakerScore(lead, icp)),
    emailPhoneConfidence: clampScore(contactConfidence(lead)),
    complianceRisk: clampScore(complianceRisk(leadText)),
  };

  return {
    ...dimensionsWithoutValue,
    estimatedValue: estimatedValue(leadText, dimensionsWithoutValue),
    recommendedFirstOffer: recommendedFirstOffer(dimensionsWithoutValue),
  };
}

function finalScore(dimensions: LeadScoreDimensions) {
  const positiveScore =
    dimensions.industryFit * 0.18 +
    dimensions.localServiceFit * 0.1 +
    dimensions.missedCallLikelihood * 0.12 +
    dimensions.followUpPainLikelihood * 0.12 +
    dimensions.aiAutomationFit * 0.14 +
    dimensions.abilityToPay * 0.12 +
    dimensions.decisionMakerIdentified * 0.1 +
    dimensions.emailPhoneConfidence * 0.08;
  const compliancePenalty = dimensions.complianceRisk * 0.06;

  return clampScore(positiveScore - compliancePenalty);
}

function dimensionReasons(dimensions: LeadScoreDimensions) {
  const reasons: string[] = [];

  if (dimensions.industryFit >= 75) reasons.push('strong industry fit');
  if (dimensions.localServiceFit >= 70) reasons.push('local service fit present');
  if (dimensions.missedCallLikelihood >= 70) reasons.push('missed-call opportunity likely');
  if (dimensions.followUpPainLikelihood >= 70) reasons.push('follow-up pain likely');
  if (dimensions.aiAutomationFit >= 75) reasons.push('AI automation fit');
  if (dimensions.abilityToPay >= 75) reasons.push('ability to pay appears strong');
  if (dimensions.decisionMakerIdentified >= 80) reasons.push('decision maker identified');
  if (dimensions.emailPhoneConfidence >= 70) reasons.push('email/phone confidence is high');
  if (dimensions.complianceRisk >= 60) reasons.push('compliance risk requires careful positioning');
  reasons.push(`estimated value $${dimensions.estimatedValue.toLocaleString('en-US')}`);
  reasons.push(`recommended first offer: ${dimensions.recommendedFirstOffer}`);

  return reasons;
}

export function scoreLeads(leads: LeadRecord[], icp: LeadgenIcp): LeadRecord[] {
  return leads.map((lead) => {
    const dimensions = buildDimensions(lead, icp);
    const score = finalScore(dimensions);
    const existingReasons = lead.scoreReasons || [];
    const reasons = [...existingReasons, ...dimensionReasons(dimensions)];

    return {
      ...lead,
      score,
      scoreDimensions: dimensions,
      scoreReasons: reasons.length ? [...new Set(reasons)] : ['baseline ICP fit'],
      status: 'scored' as const,
      updatedAt: new Date().toISOString(),
    };
  }).sort((a, b) => b.score - a.score);
}
