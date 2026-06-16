import { permissionsForRoles, roles } from './roles.js';
import type { IdentityRecord, OrganizationIdentity, PersonaIdentity, ProjectIdentity, Role, UserIdentity } from './identityTypes.js';

const seedTimestamp = '2026-06-16T00:00:00.000Z';

const jordan: UserIdentity = {
  id: 'user_jordan_love',
  kind: 'user',
  displayName: 'Jordan Love',
  handle: 'jordan',
  title: 'Sovereign / Founder / Owner',
  roleIds: ['role_sovereign_owner'],
  permissions: permissionsForRoles(['role_sovereign_owner']),
  metadata: { seeded: true, internal: true },
  createdAt: seedTimestamp,
  updatedAt: seedTimestamp,
};

const elora: PersonaIdentity = {
  id: 'persona_elora',
  kind: 'persona',
  personaType: 'ai',
  displayName: 'Elora',
  handle: 'elora',
  title: 'Executive Routing and Memory Persona',
  roleIds: ['role_elora_executive_persona'],
  permissions: permissionsForRoles(['role_elora_executive_persona']),
  metadata: { seeded: true, internal: true, runtimeAgentName: 'elora' },
  createdAt: seedTimestamp,
  updatedAt: seedTimestamp,
};

const nexora: PersonaIdentity = {
  id: 'persona_nexora',
  kind: 'persona',
  personaType: 'ai',
  displayName: 'Nexora',
  handle: 'nexora',
  title: 'Technical Execution and Work-Order Persona',
  roleIds: ['role_nexora_technical_persona'],
  permissions: permissionsForRoles(['role_nexora_technical_persona']),
  metadata: { seeded: true, internal: true, runtimeAgentName: 'nexora' },
  createdAt: seedTimestamp,
  updatedAt: seedTimestamp,
};

const vireonCoreProject: ProjectIdentity = {
  id: 'project_core',
  name: 'CORE',
  ownerUserId: jordan.id,
  roleAssignments: [
    { identityId: jordan.id, roleId: 'role_sovereign_owner' },
    { identityId: elora.id, roleId: 'role_elora_executive_persona' },
    { identityId: nexora.id, roleId: 'role_nexora_technical_persona' },
  ],
  metadata: { seeded: true, internal: true, system: 'Awakening Project CORE' },
  createdAt: seedTimestamp,
  updatedAt: seedTimestamp,
};

export class IdentityStore {
  private identities = new Map<string, IdentityRecord>([jordan, elora, nexora].map((identity) => [identity.id, identity]));
  private projects = new Map<string, ProjectIdentity>([[vireonCoreProject.id, vireonCoreProject]]);
  private organizations = new Map<string, OrganizationIdentity>();
  private roleRecords = new Map<string, Role>(roles.map((role) => [role.id, role]));

  listIdentities() {
    return [...this.identities.values()];
  }

  getIdentity(id: string) {
    return this.identities.get(id);
  }

  getIdentityByHandle(handle: string) {
    return [...this.identities.values()].find((identity) => identity.handle === handle);
  }

  listRoles() {
    return [...this.roleRecords.values()];
  }

  getRole(id: string) {
    return this.roleRecords.get(id);
  }

  listProjects() {
    return [...this.projects.values()];
  }

  getProject(id: string) {
    return this.projects.get(id);
  }

  listOrganizations() {
    return [...this.organizations.values()];
  }
}

export const identityStore = new IdentityStore();
