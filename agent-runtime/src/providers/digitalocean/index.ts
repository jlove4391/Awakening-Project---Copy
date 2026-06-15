import { digitalOceanApiRequest, digitalOceanProviderStatus } from './auth.js';
import type { DigitalOceanAccountResponse, DigitalOceanListInput, DigitalOceanProjectsResponse } from './types.js';

export { digitalOceanApiRequest, digitalOceanProviderStatus, getDigitalOceanApiToken } from './auth.js';
export { listDigitalOceanApps } from './apps.js';
export { listDigitalOceanDatabases } from './databases.js';
export type * from './types.js';

export function checkDigitalOceanProviderConfigured() {
  return digitalOceanProviderStatus();
}

export async function getDigitalOceanAccount() {
  const response = await digitalOceanApiRequest<DigitalOceanAccountResponse>('/v2/account');
  return {
    ok: true,
    provider: 'digitalocean',
    account: response.account || null,
  };
}

export async function listDigitalOceanProjects(input: DigitalOceanListInput = {}) {
  const params = new URLSearchParams({
    per_page: String(input.perPage || 20),
    page: String(input.page || 1),
  });
  const response = await digitalOceanApiRequest<DigitalOceanProjectsResponse>(`/v2/projects?${params}`);

  return {
    ok: true,
    provider: 'digitalocean',
    projects: response.projects || [],
    links: response.links || null,
    meta: response.meta || null,
  };
}

export async function getDigitalOceanAccountAndProjects(input: DigitalOceanListInput = {}) {
  if (!digitalOceanProviderStatus().configured) {
    return {
      ok: true,
      provider: 'digitalocean',
      configured: false,
      account: null,
      projects: [],
      message: 'DigitalOcean API token is not configured. Set DIGITALOCEAN_API_TOKEN or DO_API_TOKEN to enable account and project status reads.',
    };
  }

  const [accountResult, projectsResult] = await Promise.all([
    getDigitalOceanAccount(),
    listDigitalOceanProjects(input),
  ]);

  return {
    ok: true,
    provider: 'digitalocean',
    configured: true,
    account: accountResult.account,
    projects: projectsResult.projects,
    links: projectsResult.links,
    meta: projectsResult.meta,
  };
}
