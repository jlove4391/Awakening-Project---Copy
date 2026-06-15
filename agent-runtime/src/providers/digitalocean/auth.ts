import type { DigitalOceanProviderStatus } from './types.js';

export const DIGITALOCEAN_API_BASE_URL = process.env.DIGITALOCEAN_API_BASE_URL || 'https://api.digitalocean.com';

export function getDigitalOceanApiToken() {
  return (process.env.DIGITALOCEAN_API_TOKEN || process.env.DO_API_TOKEN || '').trim();
}

export function digitalOceanProviderStatus(): DigitalOceanProviderStatus {
  const tokenPresent = Boolean(getDigitalOceanApiToken());
  return {
    provider: 'digitalocean',
    configured: tokenPresent,
    tokenPresent,
    apiBaseUrl: DIGITALOCEAN_API_BASE_URL,
  };
}

export function assertDigitalOceanConfigured() {
  if (!getDigitalOceanApiToken()) {
    throw new Error('DigitalOcean is not configured. Set DIGITALOCEAN_API_TOKEN or DO_API_TOKEN.');
  }
}

function resolveDigitalOceanUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${DIGITALOCEAN_API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function digitalOceanApiRequest<T>(path: string, init: RequestInit = {}) {
  const token = getDigitalOceanApiToken();
  if (!token) {
    throw new Error('DigitalOcean is not configured. Set DIGITALOCEAN_API_TOKEN or DO_API_TOKEN.');
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Accept', 'application/json');

  const response = await fetch(resolveDigitalOceanUrl(path), { ...init, headers });
  const text = await response.text();
  const data = (text ? JSON.parse(text) : {}) as T & { id?: string; message?: string };

  if (!response.ok) {
    const message = data.message || data.id || `DigitalOcean API request failed with ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}
