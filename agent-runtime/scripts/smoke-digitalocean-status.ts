import 'dotenv/config';
import assert from 'node:assert/strict';
import { digitalOceanProviderStatus, listDigitalOceanApps, listDigitalOceanDatabases } from '../src/providers/digitalocean/index.js';

const sessionId = process.env.SMOKE_SESSION_ID || `digitalocean-status-smoke-${Date.now()}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function assertProviderNotConfigured(result: unknown, toolName: string) {
  assert.ok(isRecord(result), `${toolName} should return a structured object`);
  assert.equal(result.provider, 'digitalocean', `${toolName} should identify the digitalocean provider`);
  assert.equal(result.configured, false, `${toolName} should report configured=false without provider env vars`);
  assert.equal(result.status, 'provider_not_configured', `${toolName} should use the documented provider_not_configured status when env vars are missing`);
}

function assertReadOnlyListResult(result: unknown, toolName: string, listField: 'apps' | 'databases') {
  assert.ok(isRecord(result), `${toolName} should return a structured object`);
  assert.equal(result.ok, true, `${toolName} should succeed when DigitalOcean env vars are configured`);
  assert.equal(result.provider, 'digitalocean', `${toolName} should identify the digitalocean provider`);
  assert.ok(Array.isArray(result[listField]), `${toolName} should include a ${listField} array`);
  assert.ok('links' in result, `${toolName} should include pagination links`);
  assert.ok('meta' in result, `${toolName} should include pagination metadata`);
}

async function main() {
  const providerStatus = digitalOceanProviderStatus();
  const status = {
    ok: true,
    ...providerStatus,
    status: providerStatus.tokenPresent ? 'configured' : 'provider_not_configured',
    authSource: providerStatus.tokenPresent ? 'env' : 'missing',
    envVariables: ['DIGITALOCEAN_API_TOKEN', 'DO_API_TOKEN'],
  };
  assert.ok(isRecord(status), 'digitalocean.status should return a structured object');
  assert.equal(status.provider, 'digitalocean');

  if (status.configured !== true) {
    assertProviderNotConfigured(status, 'digitalocean.status');
    console.log(JSON.stringify({ ok: true, provider: 'digitalocean', status: 'provider_not_configured', configured: false, sessionId }, null, 2));
    return;
  }

  assert.equal(status.ok, true, 'digitalocean.status should succeed when configured');
  assert.equal(status.status, 'configured', 'digitalocean.status should use the documented configured status when env vars exist');
  assert.equal(status.tokenPresent, true, 'digitalocean.status should report token presence without returning the token');

  const apps = await listDigitalOceanApps({ page: 1, perPage: 5 });
  const databases = await listDigitalOceanDatabases({ page: 1, perPage: 5 });
  assertReadOnlyListResult(apps, 'digitalocean.list_apps', 'apps');
  assertReadOnlyListResult(databases, 'digitalocean.list_databases', 'databases');

  console.log(JSON.stringify({ ok: true, provider: 'digitalocean', status, apps, databases, sessionId }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
