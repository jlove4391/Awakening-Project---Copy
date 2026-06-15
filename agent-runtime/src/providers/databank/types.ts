export type DatabankProviderStatus = 'configured' | 'not_configured' | 'unavailable' | 'error';

export type DatabaseEngine =
  | 'postgres'
  | 'mysql'
  | 'sqlite'
  | 'mssql'
  | 'mongodb'
  | 'redis'
  | 'unknown';

export type DatabaseInspectionCapability =
  | 'status'
  | 'connection_summary'
  | 'schema_summary'
  | 'read_only_query_plan'
  | 'read_only_query';

export interface DatabaseConnectionSummary {
  id: string;
  name?: string;
  provider: string;
  engine: DatabaseEngine;
  status: DatabankProviderStatus;
  host?: string;
  port?: number;
  database?: string;
  region?: string;
  version?: string;
  sslEnabled?: boolean;
  readOnly: true;
  capabilities: DatabaseInspectionCapability[];
  lastCheckedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface DatabaseSchemaColumnSummary {
  name: string;
  dataType: string;
  nullable?: boolean;
  defaultValue?: string | null;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  references?: {
    table: string;
    column: string;
  };
  metadata?: Record<string, unknown>;
}

export interface DatabaseSchemaTableSummary {
  name: string;
  schema?: string;
  type?: 'table' | 'view' | 'materialized_view' | 'collection' | 'unknown';
  columns: DatabaseSchemaColumnSummary[];
  estimatedRowCount?: number;
  indexes?: Array<{
    name: string;
    columns: string[];
    unique?: boolean;
  }>;
  metadata?: Record<string, unknown>;
}

export interface DatabaseSchemaSummary {
  connectionId: string;
  provider: string;
  engine: DatabaseEngine;
  generatedAt: string;
  readOnly: true;
  schemas?: string[];
  tables: DatabaseSchemaTableSummary[];
  warnings?: string[];
  metadata?: Record<string, unknown>;
}

export interface DatabaseMigrationPlan {
  id: string;
  connectionId: string;
  provider: string;
  engine: DatabaseEngine;
  createdAt: string;
  status: 'draft' | 'requires_review' | 'approved' | 'rejected';
  readOnlyInspectionComplete: boolean;
  summary: string;
  steps: Array<{
    id: string;
    description: string;
    sql?: string;
    risk: 'low' | 'medium' | 'high';
    reversible?: boolean;
    rollbackSql?: string;
  }>;
  approvalRequired: true;
  approvedBy?: string;
  approvedAt?: string;
  warnings?: string[];
  metadata?: Record<string, unknown>;
}

export interface DatabaseQueryPlan {
  id: string;
  connectionId: string;
  provider: string;
  engine: DatabaseEngine;
  createdAt: string;
  operation: 'inspect' | 'select' | 'explain';
  readOnly: true;
  sql?: string;
  parameters?: unknown[];
  expectedResultShape?: Record<string, string>;
  estimatedCost?: string;
  limit?: number;
  warnings?: string[];
  metadata?: Record<string, unknown>;
}

export interface DatabaseMutationReceipt {
  id: string;
  connectionId: string;
  provider: string;
  engine: DatabaseEngine;
  requestedAt: string;
  operation: 'migration' | 'insert' | 'update' | 'delete' | 'ddl' | 'unknown';
  status: 'not_executed' | 'approval_required' | 'rejected' | 'planned';
  readOnlyMode: true;
  migrationPlanId?: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface DatabankProvider {
  key: string;
  getStatus(): Promise<DatabaseConnectionSummary>;
  summarizeConnections(): Promise<DatabaseConnectionSummary[]>;
  summarizeSchema(connectionId: string): Promise<DatabaseSchemaSummary>;
  planReadOnlyQuery(input: {
    connectionId: string;
    purpose: string;
    sql?: string;
    parameters?: unknown[];
    limit?: number;
  }): Promise<DatabaseQueryPlan>;
  runReadOnlyQuery?(plan: DatabaseQueryPlan): Promise<{
    planId: string;
    connectionId: string;
    provider: string;
    readOnly: true;
    rows: unknown[];
    rowCount: number;
    executedAt: string;
    metadata?: Record<string, unknown>;
  }>;
  planMigration?(input: {
    connectionId: string;
    summary: string;
    proposedSql?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<DatabaseMigrationPlan>;
}
