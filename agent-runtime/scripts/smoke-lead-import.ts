#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.AGENT_RUNTIME_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'awakening-lead-import-smoke-'));
process.env.AGENT_RUNTIME_SESSION_BACKEND = 'local-memory';

try {
  const { executeRegisteredTool } = await import('../src/tools/registry.js');
  const context = { sessionId: 'lead-import-smoke', agent: 'elora' } as any;
  const result = await executeRegisteredTool('qualification.import_transcript', {
    leadId: 'lead_smoke_import',
    callDate: '2026-06-14T10:00:00.000Z',
    source: 'manual',
    participants: ['Jordan', 'Avery Prospect'],
    transcript: 'Jordan: Where are leads falling through? Avery: Missed calls after hours and slow follow-up from the CRM queue cost us booked jobs.',
    memoryScope: 'business_context',
  }, context) as any;

  assert.ok(result.payload);
  assert.equal(result.payload.routingTargets.includes('elora'), true);
  assert.equal(result.record.leadId, 'lead_smoke_import');
  assert.equal(result.record.status, 'imported');
  assert.ok(result.memoryId);
  console.log('lead import smoke passed');
} finally {
  await rm(process.env.AGENT_RUNTIME_DATA_DIR!, { recursive: true, force: true });
}
