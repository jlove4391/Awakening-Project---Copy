import { digitalOceanApiRequest } from './auth.js';
import type { DigitalOceanAppsResponse, DigitalOceanListInput } from './types.js';

export async function listDigitalOceanApps(input: DigitalOceanListInput = {}) {
  const params = new URLSearchParams({
    per_page: String(input.perPage || 20),
    page: String(input.page || 1),
  });
  const response = await digitalOceanApiRequest<DigitalOceanAppsResponse>(`/v2/apps?${params}`);

  return {
    ok: true,
    provider: 'digitalocean',
    apps: response.apps || [],
    links: response.links || null,
    meta: response.meta || null,
  };
}
