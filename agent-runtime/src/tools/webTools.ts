import { createHash } from 'node:crypto';
import { runtimeConfig } from '../config.js';

export interface WebFetchUrlInput {
  url: string;
  timeoutMs?: number;
  maxBytes?: number;
}

export interface WebCrawlSiteInput extends WebFetchUrlInput {
  maxPages?: number;
  maxDepth?: number;
}

function limitNumber(value: unknown, configuredLimit: number, fallback: number, minimum = 1) {
  const requested = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.max(minimum, Math.min(requested, configuredLimit));
}

function normalizeHttpUrl(rawUrl: string) {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https URLs are supported.');
  }
  parsed.hash = '';
  return parsed;
}

function sha256(text: string | Buffer) {
  return createHash('sha256').update(text).digest('hex');
}

async function fetchLimited(url: URL, input: WebFetchUrlInput) {
  const maxBytes = limitNumber(input.maxBytes, runtimeConfig.webFetchMaxBytes, runtimeConfig.webFetchMaxBytes);
  const timeoutMs = limitNumber(input.timeoutMs, runtimeConfig.webFetchTimeoutMs, runtimeConfig.webFetchTimeoutMs, 250);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'AwakeningProjectCORE/1.0 (+web.fetch_url)' },
    });
    const contentType = response.headers.get('content-type') || '';
    const finalUrl = normalizeHttpUrl(response.url || url.toString());
    const reader = response.body?.getReader();
    if (!reader) {
      return { response, finalUrl, contentType, body: '', bytesRead: 0, truncated: false, maxBytes, timeoutMs };
    }

    const chunks: Uint8Array[] = [];
    let bytesRead = 0;
    let truncated = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const remaining = maxBytes - bytesRead;
      if (value.byteLength > remaining) {
        if (remaining > 0) chunks.push(value.slice(0, remaining));
        bytesRead = maxBytes;
        truncated = true;
        await reader.cancel();
        break;
      }
      chunks.push(value);
      bytesRead += value.byteLength;
    }
    const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), bytesRead);
    return { response, finalUrl, contentType, body: buffer.toString('utf8'), bytesRead, truncated, maxBytes, timeoutMs };
  } finally {
    clearTimeout(timeout);
  }
}

function titleFromHtml(html: string) {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() || '';
}

function textFromHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function linksFromHtml(html: string, baseUrl: URL) {
  const links = new Set<string>();
  for (const match of html.matchAll(/<a\s+[^>]*href=["']([^"'#]+)["'][^>]*>/gi)) {
    try {
      const next = normalizeHttpUrl(new URL(match[1], baseUrl).toString());
      if (next.origin === baseUrl.origin) links.add(next.toString());
    } catch (_error) {
      // Ignore malformed or unsupported hrefs.
    }
  }
  return [...links];
}

export async function webFetchUrl(input: WebFetchUrlInput) {
  const url = normalizeHttpUrl(input.url);
  const fetched = await fetchLimited(url, input);
  const text = fetched.contentType.includes('text/html') ? textFromHtml(fetched.body) : fetched.body;
  return {
    ok: fetched.response.ok,
    status: fetched.response.status,
    statusText: fetched.response.statusText,
    url: url.toString(),
    finalUrl: fetched.finalUrl.toString(),
    contentType: fetched.contentType,
    bytesRead: fetched.bytesRead,
    maxBytes: fetched.maxBytes,
    timeoutMs: fetched.timeoutMs,
    truncated: fetched.truncated,
    sha256: sha256(fetched.body),
    title: fetched.contentType.includes('text/html') ? titleFromHtml(fetched.body) : '',
    text,
  };
}

export async function webCrawlSite(input: WebCrawlSiteInput) {
  const startUrl = normalizeHttpUrl(input.url);
  const maxPages = limitNumber(input.maxPages, runtimeConfig.webCrawlMaxPages, runtimeConfig.webCrawlMaxPages);
  const maxDepth = limitNumber(input.maxDepth, runtimeConfig.webCrawlMaxDepth, runtimeConfig.webCrawlMaxDepth, 0);
  const queue: Array<{ url: URL; depth: number }> = [{ url: startUrl, depth: 0 }];
  const seen = new Set<string>();
  const pages: unknown[] = [];
  let totalBytesRead = 0;

  while (queue.length && pages.length < maxPages) {
    const current = queue.shift()!;
    if (seen.has(current.url.toString()) || current.depth > maxDepth) continue;
    seen.add(current.url.toString());
    const fetched = await fetchLimited(current.url, input);
    const isHtml = fetched.contentType.includes('text/html');
    totalBytesRead += fetched.bytesRead;
    const page = {
      ok: fetched.response.ok,
      status: fetched.response.status,
      url: current.url.toString(),
      finalUrl: fetched.finalUrl.toString(),
      depth: current.depth,
      contentType: fetched.contentType,
      bytesRead: fetched.bytesRead,
      maxBytes: fetched.maxBytes,
      timeoutMs: fetched.timeoutMs,
      truncated: fetched.truncated,
      sha256: sha256(fetched.body),
      title: isHtml ? titleFromHtml(fetched.body) : '',
      text: isHtml ? textFromHtml(fetched.body) : fetched.body,
    };
    pages.push(page);
    if (isHtml && current.depth < maxDepth) {
      for (const href of linksFromHtml(fetched.body, fetched.finalUrl)) {
        if (!seen.has(href) && queue.length + pages.length < maxPages) queue.push({ url: new URL(href), depth: current.depth + 1 });
      }
    }
  }

  return {
    ok: true,
    status: 'completed',
    startUrl: startUrl.toString(),
    origin: startUrl.origin,
    pagesFetched: pages.length,
    maxPages,
    maxDepth,
    maxBytesPerPage: limitNumber(input.maxBytes, runtimeConfig.webFetchMaxBytes, runtimeConfig.webFetchMaxBytes),
    totalBytesRead,
    pages,
  };
}
