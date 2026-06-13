import { z } from 'zod';

const normalizeBlankString = (value: unknown) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeText = (value: unknown) => {
  if (typeof value !== 'string') {
    return value;
  }

  return value.trim();
};

const requiredText = z.preprocess(normalizeBlankString, z.string().min(1));
const optionalText = z.preprocess(normalizeText, z.string().default('').catch(''));
const optionalStringList = z.preprocess((value) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : String(item).trim()))
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return [];
    }

    return trimmed
      .split(/[\n,]+/u)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return value;
}, z.array(z.string()).default([]).catch([]));

export const VoiceQualificationQuestionCategorySchema = z.enum([
  'lead_source',
  'current_volume',
  'response_gap',
  'system_fit',
  'urgency',
  'decision_process',
  'budget_context',
  'scheduling',
]);

export const VoiceQualificationQuestionSchema = z.object({
  id: requiredText,
  category: VoiceQualificationQuestionCategorySchema,
  question: requiredText,
  purpose: optionalText,
  requiredForBooking: z.boolean().default(false).catch(false),
  allowedFollowUps: optionalStringList,
});

export const AllowedVoiceBehaviorSchema = z.object({
  tone: z.array(z.enum(['warm', 'concise', 'consultative', 'calm', 'professional'])).default([
    'warm',
    'concise',
    'consultative',
  ]),
  mayAskClarifyingQuestions: z.boolean().default(true),
  maySummarizeAnswers: z.boolean().default(true),
  mayOfferSchedulingWindow: z.boolean().default(true),
  mustDiscloseAiAssistant: z.boolean().default(true),
  mustConfirmConsentToContinue: z.boolean().default(true),
  maxQualificationQuestionsBeforeSummary: z.number().int().positive().default(6).catch(6),
  fallbackPhrases: z.array(z.string()).default([
    'I can capture that for the team to review.',
    'I do not want to overpromise, but I can note that as a priority.',
    'The best next step is a review with a human specialist.',
  ]),
});

export const DisallowedPromiseSchema = z.object({
  id: requiredText,
  promise: requiredText,
  reason: optionalText,
  safeAlternative: optionalText,
});

export const BookingCriterionSchema = z.object({
  id: requiredText,
  label: requiredText,
  description: optionalText,
  required: z.boolean().default(true).catch(true),
});

export const EscalationCriterionSchema = z.object({
  id: requiredText,
  label: requiredText,
  trigger: requiredText,
  escalationPath: z.enum(['human_review', 'sales_specialist', 'support', 'compliance']).default('human_review'),
  urgency: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
});

export const TranscriptSyncMetadataSchema = z.object({
  transcriptId: requiredText,
  callId: optionalText,
  leadId: optionalText,
  source: z.enum(['voice_qualification', 'manual_upload', 'provider_import']).default('voice_qualification'),
  syncedAt: z.string().datetime(),
  schemaVersion: requiredText,
  reviewedByHuman: z.boolean().default(false).catch(false),
  redactionStatus: z.enum(['not_required', 'pending', 'redacted']).default('pending'),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

export const VoiceQualificationConfigSchema = z.object({
  schemaVersion: requiredText,
  approvedQuestions: z.array(VoiceQualificationQuestionSchema).min(1),
  allowedVoiceBehavior: AllowedVoiceBehaviorSchema,
  disallowedPromises: z.array(DisallowedPromiseSchema).default([]),
  bookingCriteria: z.array(BookingCriterionSchema).default([]),
  escalationCriteria: z.array(EscalationCriterionSchema).default([]),
});

export const defaultVoiceQualificationConfig = VoiceQualificationConfigSchema.parse({
  schemaVersion: 'voice-qualification.config.v1',
  approvedQuestions: [
    {
      id: 'lead-source',
      category: 'lead_source',
      question: 'What prompted you to reach out today?',
      purpose: 'Understand the source of demand and immediate context.',
      requiredForBooking: false,
      allowedFollowUps: ['Was there a specific event or bottleneck that made this urgent?'],
    },
    {
      id: 'monthly-lead-volume',
      category: 'current_volume',
      question: 'About how many new leads or calls do you handle in a typical month?',
      purpose: 'Confirm whether volume supports a meaningful review.',
      requiredForBooking: true,
      allowedFollowUps: ['Is that mostly calls, web forms, referrals, or a mix?'],
    },
    {
      id: 'missed-response-gap',
      category: 'response_gap',
      question: 'Where do leads most often fall through the cracks right now?',
      purpose: 'Identify missed calls, slow follow-up, handoff, or tracking issues.',
      requiredForBooking: true,
      allowedFollowUps: ['How quickly does your team usually respond after hours?'],
    },
    {
      id: 'current-systems',
      category: 'system_fit',
      question: 'What CRM, calendar, phone, or tracking tools are you currently using?',
      purpose: 'Capture integration and workflow context without starting implementation.',
      requiredForBooking: false,
      allowedFollowUps: ['Are those tools working well enough, or are they part of the problem?'],
    },
    {
      id: 'urgency-window',
      category: 'urgency',
      question: 'How soon are you hoping to improve this process?',
      purpose: 'Assess timeline fit for a review call.',
      requiredForBooking: true,
      allowedFollowUps: ['Is there a deadline, campaign, or seasonal push driving that timing?'],
    },
    {
      id: 'decision-process',
      category: 'decision_process',
      question: 'Who else would need to be involved in reviewing the next step?',
      purpose: 'Confirm stakeholder needs before booking.',
      requiredForBooking: false,
      allowedFollowUps: ['Would it be helpful to include them on the review call?'],
    },
    {
      id: 'budget-context',
      category: 'budget_context',
      question: 'Have you set aside a budget range for improving lead response or operations?',
      purpose: 'Collect budget context without quoting pricing or guaranteeing affordability.',
      requiredForBooking: false,
      allowedFollowUps: ['Would you prefer to discuss options with the specialist instead?'],
    },
    {
      id: 'scheduling-fit',
      category: 'scheduling',
      question: 'If this looks like a fit, what days or times are usually best for a review call?',
      purpose: 'Capture scheduling preferences for a human-approved booking step.',
      requiredForBooking: true,
      allowedFollowUps: ['What time zone should we use for that availability?'],
    },
  ],
  allowedVoiceBehavior: {},
  disallowedPromises: [
    {
      id: 'no-guaranteed-results',
      promise: 'Do not guarantee revenue, lead volume, booked jobs, or close-rate improvements.',
      reason: 'Performance depends on market, offer, team execution, and implementation scope.',
      safeAlternative: 'Say the team can review the current process and identify likely improvement opportunities.',
    },
    {
      id: 'no-pricing-commitments',
      promise: 'Do not quote final pricing, discounts, terms, or payment plans.',
      reason: 'Pricing requires human review and scope confirmation.',
      safeAlternative: 'Offer to have a specialist discuss scope and pricing on the review call.',
    },
    {
      id: 'no-integration-commitments',
      promise: 'Do not promise compatibility, migration, or implementation timelines for specific tools.',
      reason: 'Technical feasibility must be confirmed separately.',
      safeAlternative: 'Capture the tools mentioned and flag them for technical review.',
    },
    {
      id: 'no-calendar-autobooking',
      promise: 'Do not state that a meeting is confirmed unless a human-approved booking record exists.',
      reason: 'This schema is not a live phone or calendar integration.',
      safeAlternative: 'Say the requested time will be sent for confirmation.',
    },
  ],
  bookingCriteria: [
    {
      id: 'clear-business-need',
      label: 'Clear business need',
      description: 'The caller described a lead response, sales, operations, or tracking bottleneck.',
      required: true,
    },
    {
      id: 'sufficient-volume-or-value',
      label: 'Sufficient volume or customer value',
      description: 'The caller has enough lead volume, deal value, or urgency to justify a review.',
      required: true,
    },
    {
      id: 'timeline-captured',
      label: 'Timeline captured',
      description: 'The caller shared when they want the issue improved or reviewed.',
      required: true,
    },
    {
      id: 'contact-and-scheduling',
      label: 'Contact and scheduling preference captured',
      description: 'The workflow has enough contact and availability context to request a booking.',
      required: true,
    },
  ],
  escalationCriteria: [
    {
      id: 'angry-or-distressed-caller',
      label: 'Angry or distressed caller',
      trigger: 'Caller is upset, distressed, threatening, or repeatedly asks for a human.',
      escalationPath: 'human_review',
      urgency: 'urgent',
    },
    {
      id: 'legal-financial-or-medical-advice',
      label: 'Regulated advice requested',
      trigger: 'Caller asks for legal, financial, medical, tax, or compliance advice.',
      escalationPath: 'compliance',
      urgency: 'high',
    },
    {
      id: 'existing-customer-support',
      label: 'Existing customer support issue',
      trigger: 'Caller is an existing customer requesting support, billing help, or incident response.',
      escalationPath: 'support',
      urgency: 'normal',
    },
    {
      id: 'high-value-or-complex-opportunity',
      label: 'High-value or complex opportunity',
      trigger: 'Caller describes multiple locations, enterprise scope, or urgent high-value implementation needs.',
      escalationPath: 'sales_specialist',
      urgency: 'high',
    },
  ],
});

export type VoiceQualificationQuestionCategory = z.infer<typeof VoiceQualificationQuestionCategorySchema>;
export type VoiceQualificationQuestion = z.infer<typeof VoiceQualificationQuestionSchema>;
export type AllowedVoiceBehavior = z.infer<typeof AllowedVoiceBehaviorSchema>;
export type DisallowedPromise = z.infer<typeof DisallowedPromiseSchema>;
export type BookingCriterion = z.infer<typeof BookingCriterionSchema>;
export type EscalationCriterion = z.infer<typeof EscalationCriterionSchema>;
export type TranscriptSyncMetadata = z.infer<typeof TranscriptSyncMetadataSchema>;
export type VoiceQualificationConfig = z.infer<typeof VoiceQualificationConfigSchema>;
