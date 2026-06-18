import 'dotenv/config';
import assert from 'node:assert/strict';
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.WEB_FETCH_MAX_BYTES = process.env.WEB_FETCH_MAX_BYTES || '128';
process.env.WEB_FETCH_TIMEOUT_MS = process.env.WEB_FETCH_TIMEOUT_MS || '3000';
process.env.WEB_CRAWL_MAX_PAGES = process.env.WEB_CRAWL_MAX_PAGES || '2';
process.env.WEB_CRAWL_MAX_DEPTH = process.env.WEB_CRAWL_MAX_DEPTH || '1';
process.env.AGENT_RUNTIME_DATA_DIR = process.env.AGENT_RUNTIME_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.runtime-data', `smoke-web-tools-${Date.now()}`);

const sessionId = process.env.SMOKE_SESSION_ID || `web-tools-smoke-${Date.now()}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

async function readJsonl(filePath: string) {
  const raw = await fs.readFile(filePath, 'utf8');
  return raw.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function main() {
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname;
    response.setHeader('content-type', 'text/html; charset=utf-8');
    if (pathname === '/page-2') {
      response.end('<!doctype html><title>Page Two</title><main>second smoke page</main>');
      return;
    }
    response.end('<!doctype html><title>Smoke Home</title><main>allowed web smoke home ' + 'x'.repeat(512) + '</main><a href="/page-2">next</a>');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(isRecord(address), 'smoke server should expose an address object');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const {
      executeRegisteredTool,
      getRegisteredTool,
      sharedRuntimeToolCategories,
      toolManifest,
      runtimeToolsForCategories,
    } = await import('../src/tools/registry.js');
    const { runtimeConfig } = await import('../src/config.js');

    const context = { sessionId, agent: 'elora', channel: 'text' } as const;

    const fetchDefinition = getRegisteredTool('web.fetch_url');
    const crawlDefinition = getRegisteredTool('web.crawl_site');
    assert.ok(fetchDefinition, 'web.fetch_url should be registered');
    assert.ok(crawlDefinition, 'web.crawl_site should be registered');
    assert.equal(fetchDefinition.audit.category, 'web', 'web.fetch_url should be a general web CORE tool, not leadgen');
    assert.equal(crawlDefinition.audit.category, 'web', 'web.crawl_site should be a general web CORE tool, not leadgen');
    assert.notEqual(fetchDefinition.audit.category, 'leadgen', 'web.fetch_url must not be lead-generation-specific');
    assert.notEqual(crawlDefinition.audit.category, 'leadgen', 'web.crawl_site must not be lead-generation-specific');
    assert.ok(sharedRuntimeToolCategories.includes('web'), 'general shared CORE tools should include the web category');
    assert.ok(runtimeToolsForCategories(['web']).length >= 2, 'web tools should be available through general runtime category selection');
    assert.ok(toolManifest.some((tool) => tool.name === 'web.fetch_url' && tool.audit.category === 'web'), 'tool manifest should expose web.fetch_url as a web tool');
    assert.ok(toolManifest.some((tool) => tool.name === 'web.crawl_site' && tool.audit.category === 'web'), 'tool manifest should expose web.crawl_site as a web tool');

    const fetchResult = await executeRegisteredTool('web.fetch_url', { url: `${baseUrl}/`, maxBytes: 96, timeoutMs: 1000 }, context);
    assert.ok(isRecord(fetchResult), 'web.fetch_url should return a structured result');
    assert.equal(fetchResult.ok, true, 'web.fetch_url should fetch an allowed URL');
    assert.equal(fetchResult.status, 200, 'web.fetch_url should return HTTP status 200');
    assert.equal(fetchResult.maxBytes, 96, 'web.fetch_url should honor an in-limit maxBytes setting');
    assert.equal(fetchResult.timeoutMs, 1000, 'web.fetch_url should honor an in-limit timeout setting');
    assert.ok(Number(fetchResult.bytesRead) <= 96, 'web.fetch_url should stay within requested configured limits');
    assert.equal(fetchResult.title, 'Smoke Home', 'web.fetch_url should parse HTML title metadata');

    const crawlResult = await executeRegisteredTool('web.crawl_site', { url: `${baseUrl}/`, maxPages: 2, maxDepth: 1, maxBytes: 128, timeoutMs: 1000 }, context);
    assert.ok(isRecord(crawlResult), 'web.crawl_site should return a structured result');
    assert.equal(crawlResult.ok, true, 'web.crawl_site should crawl an allowed site');
    assert.equal(crawlResult.status, 'completed', 'web.crawl_site should complete within configured limits');
    assert.equal(crawlResult.maxPages, 2, 'web.crawl_site should honor an in-limit page cap');
    assert.equal(crawlResult.maxDepth, 1, 'web.crawl_site should honor an in-limit depth cap');
    assert.equal(crawlResult.maxBytesPerPage, 128, 'web.crawl_site should report the enforced per-page byte cap');
    assert.ok(Number(crawlResult.pagesFetched) <= 2, 'web.crawl_site should stay within requested page limits');
    assert.ok(Number(crawlResult.totalBytesRead) <= 256, 'web.crawl_site should stay within requested per-page byte limits across fetched pages');

    const overLimitFetch = await executeRegisteredTool('web.fetch_url', { url: `${baseUrl}/`, maxBytes: runtimeConfig.webFetchMaxBytes + 10_000, timeoutMs: runtimeConfig.webFetchTimeoutMs + 10_000 }, context);
    assert.ok(isRecord(overLimitFetch), 'over-limit web.fetch_url should return a governed result');
    assert.equal(overLimitFetch.maxBytes, runtimeConfig.webFetchMaxBytes, 'over-limit web.fetch_url should be capped by configured governance');
    assert.equal(overLimitFetch.timeoutMs, runtimeConfig.webFetchTimeoutMs, 'over-limit web.fetch_url timeout should be capped by configured governance');
    assert.ok(Number(overLimitFetch.bytesRead) <= runtimeConfig.webFetchMaxBytes, 'over-limit web.fetch_url should not exceed configured byte cap');

    const overLimitCrawl = await executeRegisteredTool('web.crawl_site', { url: `${baseUrl}/`, maxPages: runtimeConfig.webCrawlMaxPages + 10, maxDepth: runtimeConfig.webCrawlMaxDepth + 10 }, context);
    assert.ok(isRecord(overLimitCrawl), 'over-limit web.crawl_site should return a governed result');
    assert.equal(overLimitCrawl.maxPages, runtimeConfig.webCrawlMaxPages, 'over-limit web.crawl_site should be capped by configured page governance');
    assert.equal(overLimitCrawl.maxDepth, runtimeConfig.webCrawlMaxDepth, 'over-limit web.crawl_site should be capped by configured depth governance');
    assert.equal(overLimitCrawl.maxBytesPerPage, runtimeConfig.webFetchMaxBytes, 'over-limit web.crawl_site should cap per-page bytes by configured governance');
    assert.ok(Number(overLimitCrawl.pagesFetched) <= runtimeConfig.webCrawlMaxPages, 'over-limit web.crawl_site should not exceed configured page cap');

    const { listExecutionRecords } = await import('../src/executions.js');
    const records = await listExecutionRecords({ sessionId, limit: 10 });
    assert.ok(records.some((record) => record.action === 'web.fetch_url' && record.status === 'completed' && record.receipt?.summary === 'web.fetch_url completed'), 'successful web.fetch_url execution should produce a receipt');
    assert.ok(records.some((record) => record.action === 'web.crawl_site' && record.status === 'completed' && record.receipt?.summary === 'web.crawl_site completed'), 'successful web.crawl_site execution should produce a receipt');

    const auditPath = path.join(runtimeConfig.dataDir, 'audit', 'tool-audit.jsonl');
    const auditEntries = await readJsonl(auditPath);
    assert.ok(auditEntries.some((entry) => entry.sessionId === sessionId && entry.tool === 'web.fetch_url' && entry.event === 'tool.web.fetch_url.completed'), 'successful web.fetch_url execution should write an audit record');
    assert.ok(auditEntries.some((entry) => entry.sessionId === sessionId && entry.tool === 'web.crawl_site' && entry.event === 'tool.web.crawl_site.completed'), 'successful web.crawl_site execution should write an audit record');

    console.log(JSON.stringify({ ok: true, sessionId, dataDir: runtimeConfig.dataDir, records: records.length, auditEntries: auditEntries.length }, null, 2));
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
