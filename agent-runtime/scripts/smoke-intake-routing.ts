#!/usr/bin/env tsx

import 'dotenv/config';
import { executeRegisteredTool } from '../src/tools/registry.js';
import type { RuntimeContext } from '../src/types.js';

type IntakeSpecialist = 'nexora' | 'kaz' | 'jynx';

type SmokeCase = {
  label: string;
  expectedSpecialist: IntakeSpecialist;
  intake: Record<string, unknown>;
};

type Options = {
  help?: boolean;
  sessionPrefix?: string;
};

const options = parseArgs(process.argv.slice(2));
const sessionPrefix = options.sessionPrefix || process.env.SMOKE_INTAKE_ROUTING_SESSION_PREFIX || 'intake-routing-smoke';
const submittedAt = process.env.SMOKE_INTAKE_ROUTING_SUBMITTED_AT || new Date().toISOString();

const smokeCases: SmokeCase[] = [
  {
    label: 'Tech/automation bottleneck routes to Nexora',
    expectedSpecialist: 'nexora',
    intake: {
      businessName: 'Atlas Automation Studio',
      contactName: 'Nina Patel',
      email: 'nina@example.com',
      phone: '+1 555 0100',
      website: 'https://atlas.example.com',
      industry: 'Home services marketing',
      teamSize: '8',
      currentTools: ['HubSpot', 'Google Workspace', 'Zapier', 'Looker Studio'],
      currentCrm: 'HubSpot',
      mainBottleneck: 'CRM handoffs and reporting integrations break whenever the team changes a lead stage.',
      leadCustomerFlow: 'Leads arrive from ads, forms, and calls before the CRM assignment workflow starts.',
      techAutomationIssue: 'Automation rules, API handoffs, dashboards, and email sequences are unreliable across the CRM and Google Workspace.',
      desiredOutcome: 'Stabilize the automation map and identify safe implementation priorities.',
      timeline: '30 days',
      budgetComfortRange: '$5k-$8k',
      permissionToContact: true,
    },
  },
  {
    label: 'SOP/process bottleneck routes to Kaz',
    expectedSpecialist: 'kaz',
    intake: {
      businessName: 'Cedar Client Ops',
      contactName: 'Marcus Reed',
      email: 'marcus@example.com',
      phone: '+1 555 0111',
      website: 'https://cedar.example.com',
      industry: 'Creative services agency',
      teamSize: '12',
      currentTools: ['ClickUp', 'Google Drive', 'Slack'],
      currentCrm: 'Spreadsheet tracker',
      mainBottleneck: 'Client onboarding stalls because owners, handoffs, quality checks, and escalation paths are unclear.',
      leadCustomerFlow: 'Sales closes the account, then delivery recreates the customer journey from scattered notes.',
      operationsSopIssue: 'SOPs are missing for kickoff, fulfillment, review cycles, internal approvals, and client handoff steps.',
      desiredOutcome: 'Create a process map and priority SOP backlog for the operating team.',
      timeline: '45 days',
      budgetComfortRange: '$4k-$7k',
      permissionToContact: true,
    },
  },
  {
    label: 'Pricing/cash-flow workflow concerns route to Jynx',
    expectedSpecialist: 'jynx',
    intake: {
      businessName: 'Riverbend Revenue Ops',
      contactName: 'Avery Chen',
      email: 'avery@example.com',
      phone: '+1 555 0122',
      website: 'https://riverbend.example.com',
      industry: 'B2B consulting',
      teamSize: '6',
      currentTools: ['QuickBooks', 'Stripe', 'Airtable'],
      currentCrm: 'Pipedrive',
      mainBottleneck: 'Pricing approvals, invoice follow-up, and cash-flow visibility are inconsistent across the client workflow.',
      financePricingCashFlowIssue: 'The team needs clearer pricing guardrails, payment tracking, invoice ownership, and cash-flow reporting before committing to new retainers.',
      desiredOutcome: 'Define a finance operations workflow and dashboard requirements for predictable revenue follow-up.',
      timeline: '60 days',
      budgetComfortRange: '$6k-$10k',
      permissionToContact: true,
    },
  },
];

if (options.help) {
  printHelp();
  process.exit(0);
}

console.log('Intake routing smoke: create intake → route specialist → package for review');
console.log(`Cases: ${smokeCases.map((item) => item.expectedSpecialist).join(', ')}`);

const results: Array<Record<string, unknown>> = [];

for (const [index, smokeCase] of smokeCases.entries()) {
  const context = createContext(`${sessionPrefix}-${index + 1}-${smokeCase.expectedSpecialist}`);
  const created = await executeRegisteredTool(
    'intake.create_record',
    {
      ...smokeCase.intake,
      submittedAt,
      memoryScope: 'business_context',
    },
    context,
  );

  const intakeRecord = getObjectProperty(created, 'record');
  assertIntakeRecord(intakeRecord, smokeCase.label);

  const routed = await executeRegisteredTool(
    'intake.route_specialist',
    {
      intakeRecord,
      requestedAt: submittedAt,
      memoryScope: 'task_history',
    },
    context,
  );

  assertRouteResult(routed, smokeCase.expectedSpecialist, smokeCase.label);

  const classification = getObjectProperty(routed, 'classification');
  const packaged = await executeRegisteredTool(
    'intake.package_for_review',
    {
      intakeRecord,
      classification,
      specialistDraftContent: createSpecialistDraftContent(smokeCase, routed),
      recommendedNextStep: `Jordan reviews the ${smokeCase.expectedSpecialist} internal draft request before any client-facing next step.`,
      packagedAt: submittedAt,
    },
    context,
  );

  assertReviewPackage(packaged, smokeCase.expectedSpecialist, smokeCase.label);

  results.push({
    label: smokeCase.label,
    sessionId: context.sessionId,
    intakeId: getStringProperty(intakeRecord, 'id'),
    specialist: getStringProperty(routed, 'specialist'),
    confidence: getNumberProperty(classification, 'confidence'),
    reasons: getArrayProperty(classification, 'reasons'),
    packageId: getStringProperty(packaged, 'packageId'),
  });

  console.log(`✓ ${smokeCase.label}: ${getStringProperty(routed, 'specialist')} (${getStringProperty(packaged, 'packageId')})`);
}

console.log(JSON.stringify({ ok: true, results }, null, 2));

function createContext(sessionId: string): RuntimeContext {
  return {
    sessionId,
    agent: 'elora',
  } as RuntimeContext;
}

function createSpecialistDraftContent(smokeCase: SmokeCase, routed: unknown): Record<string, unknown> {
  const draftRequest = getObjectProperty(routed, 'draftRequest');

  return {
    specialist: smokeCase.expectedSpecialist,
    title: getStringProperty(draftRequest, 'title'),
    objective: getStringProperty(draftRequest, 'objective'),
    internalOnly: true,
    source: 'smoke-intake-routing',
  };
}

function assertIntakeRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  const record = asObject(value, `${label}: create result must include a structured IntakeRecord`);
  assertNonEmptyString(record.id, `${label}: IntakeRecord.id is required`);
  assertNonEmptyString(record.createdAt, `${label}: IntakeRecord.createdAt is required`);
  assertNonEmptyString(record.updatedAt, `${label}: IntakeRecord.updatedAt is required`);
  assertEqual(record.status, 'submitted', `${label}: IntakeRecord.status must be submitted`);
  assertNonEmptyString(record.submittedAt, `${label}: IntakeRecord.submittedAt is required`);
  assertNonEmptyString(record.summary, `${label}: IntakeRecord.summary is required`);

  const responses = asObject(record.responses, `${label}: IntakeRecord.responses must be structured`);
  assertNonEmptyString(responses.businessName, `${label}: IntakeRecord.responses.businessName is required`);
  assertNonEmptyString(responses.contactName, `${label}: IntakeRecord.responses.contactName is required`);
}

function assertRouteResult(value: unknown, expectedSpecialist: IntakeSpecialist, label: string) {
  const result = asObject(value, `${label}: route result must be structured`);
  assertEqual(result.ok, true, `${label}: route result ok must be true`);
  assertEqual(result.status, 'draft_requested', `${label}: route status must be draft_requested`);
  assertEqual(result.specialist, expectedSpecialist, `${label}: expected specialist ${expectedSpecialist}`);
  assertEqual(result.externalSend, false, `${label}: route result must not send externally`);

  assertIntakeRecord(result.intakeRecord, label);

  const classification = asObject(result.classification, `${label}: classification must be structured`);
  assertEqual(classification.primarySpecialist, expectedSpecialist, `${label}: classification primary specialist mismatch`);
  assertNonEmptyArray(classification.reasons, `${label}: classification reasons are required`);
  assertNonEmptyArray(classification.matchedSignals, `${label}: classification matchedSignals are required`);
  asObject(classification.scores, `${label}: classification scores are required`);

  const draftRequest = asObject(result.draftRequest, `${label}: draftRequest is required`);
  assertEqual(draftRequest.specialist, expectedSpecialist, `${label}: draftRequest specialist mismatch`);
  assertEqual(draftRequest.externalSend, false, `${label}: draftRequest must be internal only`);
  assertNonEmptyString(draftRequest.requestedDeliverableType, `${label}: requestedDeliverableType is required`);

  const deliverableRequest = asObject(result.deliverableRequest, `${label}: deliverableRequest is required`);
  assertEqual(deliverableRequest.assignedSpecialist, expectedSpecialist, `${label}: deliverableRequest assigned specialist mismatch`);
  assertEqual(deliverableRequest.externalSend, false, `${label}: deliverableRequest must be internal only`);

  const deliverableRecord = asObject(result.deliverableRecord, `${label}: deliverableRecord is required`);
  assertEqual(deliverableRecord.status, 'draft_requested', `${label}: deliverableRecord status mismatch`);
}

function assertReviewPackage(value: unknown, expectedSpecialist: IntakeSpecialist, label: string) {
  const reviewPackage = asObject(value, `${label}: review package must be structured`);
  assertNonEmptyString(reviewPackage.packageId, `${label}: review package packageId is required`);
  assertNonEmptyString(reviewPackage.createdAt, `${label}: review package createdAt is required`);
  assertEqual(reviewPackage.specialistSelected, expectedSpecialist, `${label}: review package specialist mismatch`);
  assertEqual(reviewPackage.externalSend, false, `${label}: review package must not send externally`);
  assertNonEmptyString(reviewPackage.suggestedNextActionForJordan, `${label}: suggestedNextActionForJordan is required`);

  const intakeSummary = asObject(reviewPackage.intakeSummary, `${label}: review package intakeSummary is required`);
  assertNonEmptyString(intakeSummary.intakeId, `${label}: intakeSummary.intakeId is required`);
  assertNonEmptyString(intakeSummary.summary, `${label}: intakeSummary.summary is required`);
  assertNonEmptyString(intakeSummary.businessName, `${label}: intakeSummary.businessName is required`);
  assertNonEmptyString(intakeSummary.contactName, `${label}: intakeSummary.contactName is required`);

  const classification = asObject(reviewPackage.classification, `${label}: review package classification is required`);
  assertEqual(classification.primarySpecialist, expectedSpecialist, `${label}: review classification specialist mismatch`);
  assertNonEmptyArray(classification.reasons, `${label}: review classification reasons are required`);

  assertNonEmptyArray(reviewPackage.caveats, `${label}: review package caveats are required`);
  asObject(reviewPackage.draftDeliverable, `${label}: review package draftDeliverable is required`);

  const approvalReviewStatus = asObject(reviewPackage.approvalReviewStatus, `${label}: approvalReviewStatus is required`);
  assertEqual(approvalReviewStatus.reviewRequiredBy, 'Jordan', `${label}: approval review must be assigned to Jordan`);
  assertEqual(approvalReviewStatus.approvedForExternalSend, false, `${label}: approval review must not approve external sends`);
  assertEqual(approvalReviewStatus.externalSend, false, `${label}: approval review externalSend must be false`);
}

function asObject(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(message);
  }

  return value as Record<string, unknown>;
}

function getObjectProperty(value: unknown, property: string): Record<string, unknown> {
  return asObject(asObject(value, `Expected object while reading ${property}`)[property], `Expected ${property} to be an object`);
}

function getStringProperty(value: unknown, property: string): string {
  const actual = asObject(value, `Expected object while reading ${property}`)[property];
  return typeof actual === 'string' ? actual : '';
}

function getNumberProperty(value: unknown, property: string): number | undefined {
  const actual = asObject(value, `Expected object while reading ${property}`)[property];
  return typeof actual === 'number' ? actual : undefined;
}

function getArrayProperty(value: unknown, property: string): unknown[] {
  const actual = asObject(value, `Expected object while reading ${property}`)[property];
  return Array.isArray(actual) ? actual : [];
}

function assertNonEmptyString(value: unknown, message: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(message);
  }
}

function assertNonEmptyArray(value: unknown, message: string): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(message);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}; got ${JSON.stringify(actual)}`);
  }
}

function parseArgs(args: string[]): Options {
  const parsed: Options = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }

    if (arg === '--session-prefix') {
      parsed.sessionPrefix = args[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith('--session-prefix=')) {
      parsed.sessionPrefix = arg.slice('--session-prefix='.length);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function printHelp() {
  console.log(`Usage: npm run smoke:intake-routing -- [--session-prefix <prefix>]\n\nRuns three local intake workflow smoke cases and verifies routing to Nexora, Kaz, and Jynx.`);
}
