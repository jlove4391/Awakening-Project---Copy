import { digitalOceanApiRequest } from './auth.js';
import type { DigitalOceanDatabasesResponse, DigitalOceanListInput } from './types.js';

export async function listDigitalOceanDatabases(input: DigitalOceanListInput = {}) {
  const params = new URLSearchParams({
    per_page: String(input.perPage || 20),
    page: String(input.page || 1),
  });
  const response = await digitalOceanApiRequest<DigitalOceanDatabasesResponse>(`/v2/databases?${params}`);

  return {
    ok: true,
    provider: 'digitalocean',
    databases: response.databases || [],
    links: response.links || null,
    meta: response.meta || null,
  };
}
