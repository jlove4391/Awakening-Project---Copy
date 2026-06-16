export type IdentityKind = 'user' | 'persona' | 'system';

export type Permission =
  | 'memory:read'
  | 'memory:write'
  | 'memory:approve'
  | 'project:read'
  | 'project:write'
  | 'workflow:create'
  | 'workflow:approve'
  | 'execution:request'
  | 'execution:execute'
  | 'receipt:write'
  | 'admin:all';

export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: Permission[];
}

export interface IdentityRecord {
  id: string;
  kind: IdentityKind;
  displayName: string;
  handle?: string;
  title?: string;
  roleIds: string[];
  permissions: Permission[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface UserIdentity extends IdentityRecord {
  kind: 'user';
}

export interface PersonaIdentity extends IdentityRecord {
  kind: 'persona';
  personaType: 'ai' | 'human_delegate';
}

export interface ProjectIdentity {
  id: string;
  name: string;
  ownerUserId: string;
  organizationId?: string;
  roleAssignments: Array<{ identityId: string; roleId: string }>;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationIdentity {
  id: string;
  name: string;
  ownerUserId: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
