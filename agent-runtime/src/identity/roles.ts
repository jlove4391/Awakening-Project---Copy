import type { Permission, Role } from './identityTypes.js';

export const allPermissions: Permission[] = [
  'memory:read',
  'memory:write',
  'memory:approve',
  'project:read',
  'project:write',
  'workflow:create',
  'workflow:approve',
  'execution:request',
  'execution:execute',
  'receipt:write',
  'admin:all',
];

export const roles: Role[] = [
  {
    id: 'role_sovereign_owner',
    name: 'Sovereign / Founder / Owner',
    description: 'Full internal authority for Vireon-owned CORE operations.',
    permissions: allPermissions,
  },
  {
    id: 'role_elora_executive_persona',
    name: 'Elora Executive AI Persona',
    description: 'Executive routing, memory, approval coordination, and receipt-aware orchestration.',
    permissions: ['memory:read', 'memory:write', 'memory:approve', 'project:read', 'workflow:create', 'workflow:approve', 'execution:request', 'receipt:write'],
  },
  {
    id: 'role_nexora_technical_persona',
    name: 'Nexora Technical AI Persona',
    description: 'Technical execution, work-order handling, project reads/writes, execution, and receipts.',
    permissions: ['memory:read', 'memory:write', 'project:read', 'project:write', 'workflow:create', 'execution:request', 'execution:execute', 'receipt:write'],
  },
];

export function permissionsForRoles(roleIds: string[]) {
  return [...new Set(roleIds.flatMap((roleId) => roles.find((role) => role.id === roleId)?.permissions || []))];
}
