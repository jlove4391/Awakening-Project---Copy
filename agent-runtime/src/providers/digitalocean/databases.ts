import { digitalOceanApiRequest } from './auth.js';
import type { DigitalOceanDatabaseCreateResponse, DigitalOceanDatabasesResponse, DigitalOceanListInput } from './types.js';

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


export async function createDigitalOceanDatabase(spec: Record<string, unknown>) {
  const response = await digitalOceanApiRequest<DigitalOceanDatabaseCreateResponse>('/v2/databases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(spec),
  });

  return {
    ok: true,
    provider: 'digitalocean',
    database: response.database || null,
    resourceId: response.database?.id || null,
    responseSummary: {
      id: response.database?.id || null,
      name: response.database?.name || null,
      engine: response.database?.engine || null,
      version: response.database?.version || null,
      region: response.database?.region || null,
      size: response.database?.size || null,
      numNodes: response.database?.num_nodes || null,
      status: response.database?.status || null,
      createdAt: response.database?.created_at || null,
    },
  };
}
