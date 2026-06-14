#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.AGENT_RUNTIME_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'awakening-closing-smoke-'));
process.env.AGENT_RUNTIME_SESSION_BACKEND = 'local-memory';

try {
  const { executeRegisteredTool } = await import('../src/tools/registry.js');
  const context = { sessionId: 'closing-kickoff-smoke', agent: 'elora' } as any;
  const captured = await executeRegisteredTool('closing.capture_close', {
    leadId: 'lead_smoke_close', proposalId: 'proposal_smoke_close', jordanCloseNote: 'Jordan approved the close after confirming scope and budget.',
    movingForwardFeeling: 'Confident and relieved to start with a focused first win.', confidenceLevel: 88,
    concerns: ['Keep implementation lightweight'], agreedNextStep: 'Kickoff and confirm CRM access checklist.', clientName: 'Avery Chen', clientEmail: 'avery@example.com',
    company: 'Riverbend Home Services', projectName: 'Revenue Follow-up Stabilization', assignedSpecialist: 'nexora', firstWinTarget: 'Callback routing map approved within 48 hours.',
  }, context) as any;
  const welcome = await executeRegisteredTool('closing.draft_welcome_sequence', {
    clientRecord: captured.clientRecord, projectRecord: captured.projectRecord, agreedNextStep: captured.initialKickoffStatus.agreedNextStep,
    firstWinTarget: 'Callback routing map approved within 48 hours.', assignedSpecialist: 'nexora', buyerConfidenceSignals: ['Approved focused first win'], knownConcerns: ['Keep implementation lightweight'],
    kickoffExpectations: ['Confirm CRM access', 'Review callback workflow'], firstUsefulArtifact: 'Callback routing map', nextStepOwner: 'ELORA', jordanApprovalNote: 'Internal draft only.',
  }, context) as any;

  assert.equal(captured.initialKickoffStatus.status, 'ready_for_kickoff');
  assert.equal(captured.clientRecord.kickoffStatus, 'ready_for_kickoff');
  assert.equal(welcome.externalSend, false);
  assert.equal(welcome.status, 'draft_ready_for_jordan_review');
  console.log('closing kickoff smoke passed');
} finally {
  await rm(process.env.AGENT_RUNTIME_DATA_DIR!, { recursive: true, force: true });
}
