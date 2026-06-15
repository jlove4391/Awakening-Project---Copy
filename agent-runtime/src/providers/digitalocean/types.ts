export interface DigitalOceanProviderStatus {
  provider: 'digitalocean';
  configured: boolean;
  tokenPresent: boolean;
  apiBaseUrl: string;
}

export interface DigitalOceanListInput {
  perPage?: number;
  page?: number;
}

export interface DigitalOceanAccount {
  droplet_limit?: number;
  floating_ip_limit?: number;
  email?: string;
  uuid?: string;
  email_verified?: boolean;
  status?: string;
  status_message?: string;
  team?: {
    uuid?: string;
    name?: string;
  };
  [key: string]: unknown;
}

export interface DigitalOceanProject {
  id: string;
  owner_uuid?: string;
  owner_id?: number;
  name: string;
  description?: string;
  purpose?: string;
  environment?: string;
  is_default?: boolean;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface DigitalOceanApp {
  id: string;
  owner_uuid?: string;
  spec?: Record<string, unknown>;
  default_ingress?: string;
  live_url?: string;
  live_url_base?: string;
  active_deployment?: Record<string, unknown>;
  in_progress_deployment?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface DigitalOceanDatabaseCluster {
  id: string;
  name: string;
  engine?: string;
  version?: string;
  connection?: Record<string, unknown>;
  private_connection?: Record<string, unknown>;
  users?: Array<Record<string, unknown>>;
  db_names?: string[];
  num_nodes?: number;
  region?: string;
  status?: string;
  created_at?: string;
  maintenance_window?: Record<string, unknown>;
  size?: string;
  tags?: string[];
  project_id?: string;
  [key: string]: unknown;
}

export interface DigitalOceanPagedLinks {
  pages?: {
    first?: string;
    prev?: string;
    next?: string;
    last?: string;
  };
  [key: string]: unknown;
}

export interface DigitalOceanMeta {
  total?: number;
  [key: string]: unknown;
}

export interface DigitalOceanPagedResponse<TItemKey extends string, TItem> {
  [key: string]: unknown;
  links?: DigitalOceanPagedLinks;
  meta?: DigitalOceanMeta;
}

export type DigitalOceanAccountResponse = {
  account?: DigitalOceanAccount;
};

export type DigitalOceanProjectsResponse = DigitalOceanPagedResponse<'projects', DigitalOceanProject> & {
  projects?: DigitalOceanProject[];
};

export type DigitalOceanAppsResponse = DigitalOceanPagedResponse<'apps', DigitalOceanApp> & {
  apps?: DigitalOceanApp[];
};

export type DigitalOceanDatabasesResponse = DigitalOceanPagedResponse<'databases', DigitalOceanDatabaseCluster> & {
  databases?: DigitalOceanDatabaseCluster[];
};


export interface DigitalOceanAppCreateResponse {
  app?: DigitalOceanApp;
  [key: string]: unknown;
}

export interface DigitalOceanDatabaseCreateResponse {
  database?: DigitalOceanDatabaseCluster;
  [key: string]: unknown;
}
