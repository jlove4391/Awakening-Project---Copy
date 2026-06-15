import { digitalOceanApiRequest } from './auth.js';
import type { DigitalOceanAppCreateResponse, DigitalOceanAppsResponse, DigitalOceanListInput } from './types.js';

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


export async function createDigitalOceanApp(spec: Record<string, unknown>) {
  const response = await digitalOceanApiRequest<DigitalOceanAppCreateResponse>('/v2/apps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spec }),
  });

  return {
    ok: true,
    provider: 'digitalocean',
    app: response.app || null,
    resourceId: response.app?.id || null,
    responseSummary: {
      id: response.app?.id || null,
      name: typeof response.app?.spec?.name === 'string' ? response.app.spec.name : null,
      defaultIngress: response.app?.default_ingress || null,
      liveUrl: response.app?.live_url || null,
      createdAt: response.app?.created_at || null,
      updatedAt: response.app?.updated_at || null,
    },
  };
}
