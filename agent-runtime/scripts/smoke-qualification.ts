#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.AGENT_RUNTIME_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'awakening-qualification-smoke-'));
process.env.AGENT_RUNTIME_SESSION_BACKEND = 'local-memory';

try {
  const { executeRegisteredTool } = await import('../src/tools/registry.js');
  const context = { sessionId: 'qualification-smoke', agent: 'elora' } as any;
  const created = await executeRegisteredTool('qualification.create_from_form', {
    leadId: 'lead_smoke_qualification',
    intakeId: 'intake_smoke_qualification',
    monthlyLeadVolume: 140,
    responseSpeed: 'Usually 3 hours during business hours and next day after hours',
    missedCallsMessages: 24,
    crmTrackingSystem: 'HubSpot with calendar booking and pipeline tracking',
    averageJobCustomerValue: 2500,
    closeRate: 35,
    crackFallthroughPoints: ['missed call callback ownership', 'manual CRM assignment', 'after-hours voicemail follow-up'],
    desired30DayImprovement: 'Reduce lost leads by automating response and booking follow-up.',
  }, context) as any;
  const scored = await executeRegisteredTool('qualification.score', { record: created.record }, context) as any;
  const gate = await executeRegisteredTool('qualification.check_gate', {
    leadId: 'lead_smoke_qualification',
    hasSubmittedIntakeForm: true,
    hasQualificationRecord: true,
  }, context) as any;

  assert.equal(created.externalCommunication, false);
  assert.ok(scored.score >= 50, `expected usable qualification score, got ${scored.score}`);
  assert.ok(['excellent_fit', 'good_fit', 'conditional_fit'].includes(scored.fitTier));
  assert.equal(gate.allowed, true);
  assert.equal(gate.status, 'allowed');
  console.log('qualification smoke passed');
} finally {
  await rm(process.env.AGENT_RUNTIME_DATA_DIR!, { recursive: true, force: true });
}
