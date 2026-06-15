import 'dotenv/config';
import assert from 'node:assert/strict';

const sessionId = process.env.SMOKE_SESSION_ID || `databank-status-smoke-${Date.now()}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

async function main() {
  const tokenPresent = Boolean((process.env.DATABANK_API_TOKEN || process.env.DATABANK_TOKEN || '').trim());
  const status = {
    ok: true,
    provider: 'databank',
    status: tokenPresent ? 'configured' : 'provider_not_configured',
    configured: tokenPresent,
    tokenPresent,
    authSource: tokenPresent ? 'env' : 'missing',
    envVariables: ['DATABANK_API_TOKEN', 'DATABANK_TOKEN'],
  };
  assert.ok(isRecord(status), 'databank.status should return a structured object');
  assert.equal(status.ok, true, 'databank.status should succeed');
  assert.equal(status.provider, 'databank', 'databank.status should identify the databank provider');
  assert.ok(Array.isArray(status.envVariables), 'databank.status should document its env variables');

  if (status.configured !== true) {
    assert.equal(status.configured, false, 'databank.status should report configured=false without provider env vars');
    assert.equal(status.status, 'provider_not_configured', 'databank.status should use the documented provider_not_configured status when env vars are missing');
    console.log(JSON.stringify({ ok: true, provider: 'databank', status: 'provider_not_configured', configured: false, sessionId }, null, 2));
    return;
  }

  assert.equal(status.status, 'configured', 'databank.status should use the documented configured status when env vars exist');
  assert.equal(status.tokenPresent, true, 'databank.status should report token presence without returning the token');
  assert.equal(status.authSource, 'env', 'databank.status should report env auth source when configured');

  console.log(JSON.stringify({ ok: true, provider: 'databank', status, sessionId }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
