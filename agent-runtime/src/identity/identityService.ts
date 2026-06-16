import { identityStore } from './identityStore.js';
import type { IdentityKind, Permission } from './identityTypes.js';

export class IdentityService {
  listIdentities(kind?: IdentityKind) {
    const identities = identityStore.listIdentities();
    return kind ? identities.filter((identity) => identity.kind === kind) : identities;
  }

  getIdentity(id: string) {
    return identityStore.getIdentity(id);
  }

  getIdentityByHandle(handle: string) {
    return identityStore.getIdentityByHandle(handle);
  }

  listRoles() {
    return identityStore.listRoles();
  }

  listProjects() {
    return identityStore.listProjects();
  }

  hasPermission(identityId: string, permission: Permission) {
    const identity = identityStore.getIdentity(identityId);
    if (!identity) return false;
    return identity.permissions.includes('admin:all') || identity.permissions.includes(permission);
  }
}

export const identityService = new IdentityService();
export type { IdentityKind, Permission } from './identityTypes.js';
