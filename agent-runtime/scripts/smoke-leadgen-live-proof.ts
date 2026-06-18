#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.AGENT_RUNTIME_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'awakening-leadgen-proof-smoke-'));
process.env.AGENT_RUNTIME_SESSION_BACKEND = 'local-memory';
process.env.MASTER_KEY = 'leadgen-proof-smoke-master-key-32-chars-minimum';

try {
  const { setStoredGoogleTokens } = await import('../src/providers/google/auth.js');
  setStoredGoogleTokens({ access_token: 'smoke-access-token', expiry_date: Date.now() + 60_000 });

  const originalFetch = globalThis.fetch;
  let gmailSendCount = 0;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes('https://gmail.googleapis.com/gmail/v1/users/me/messages/send')) {
      gmailSendCount += 1;
      const payload = JSON.parse(String(init?.body || '{}')) as { raw?: string };
      assert.ok(payload.raw, 'Gmail send should receive an encoded raw email payload');
      return new Response(JSON.stringify({ id: 'gmail_smoke_message_1', threadId: 'gmail_smoke_thread_1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return originalFetch(input as any, init);
  }) as typeof fetch;

  const { runLeadgenProofWorkflow } = await import('../src/workflows/leadgen/index.js');
  const context = { sessionId: 'leadgen-live-proof-smoke', agent: 'elora' } as any;
  const awaitingApproval = await runLeadgenProofWorkflow({
    market: 'dental appointment booking',
    titles: ['Owner'],
    geography: 'Austin, TX',
    buyingSignals: ['missed call volume', 'manual follow-up'],
    sourceMode: 'synthetic',
  }, context);

  assert.equal(awaitingApproval.status, 'approval_required');
  assert.equal(gmailSendCount, 0, 'Gmail must not be called before Jordan approval');
  assert.ok(awaitingApproval.inboxItem, 'lead should be placed in the lead inbox');
  assert.ok(awaitingApproval.lead?.outreachDraft, 'one email draft should be attached before approval');

  const sent = await runLeadgenProofWorkflow({
    market: 'dental appointment booking',
    titles: ['Owner'],
    geography: 'Austin, TX',
    buyingSignals: ['missed call volume', 'manual follow-up'],
    sourceMode: 'synthetic',
    approvalMessage: 'I approve',
    followUpDays: 3,
  }, context);

  assert.equal(sent.ok, true);
  assert.equal(sent.status, 'sent');
  assert.equal(gmailSendCount, 1, 'workflow should send exactly one Gmail email');
  assert.equal(sent.sentReceipt?.status, 'sent');
  assert.equal(sent.sentReceipt?.providerMessageId, 'gmail_smoke_message_1');
  assert.equal(sent.lead?.status, 'follow_up_scheduled');
  assert.equal(sent.inboxItem?.followUpStatus, 'scheduled');
  assert.ok(sent.receipts.length >= 2, 'workflow and Gmail execution receipts should be stored');
  console.log('leadgen live proof smoke passed');
} finally {
  await rm(process.env.AGENT_RUNTIME_DATA_DIR!, { recursive: true, force: true });
}
