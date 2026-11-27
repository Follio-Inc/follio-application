/**
 * Developer Platform authorization (PLATFORM_TODO item 28).
 *
 * `types.ts` is client-safe — the role union and the permission map, so the
 * UI asks the same question the routes ask. `guard.ts` and `enforce.ts` are
 * server-only: the first reads `Admin.platformRole`, the second authorizes
 * and audits in one step.
 */

export {
  PLATFORM_PERMISSIONS,
  PLATFORM_PERMISSIONS_BY_ROLE,
  PLATFORM_ROLES,
  hasPlatformPermission,
  isPlatformRole,
} from './types';
export type { PlatformPermission, PlatformRole } from './types';
export {
  PlatformPermissionError,
  authorizePlatform,
  getPlatformRole,
  requirePlatformPermission,
} from './guard';
export type { PlatformAuthz, PlatformDenialReason, RoleLookup } from './guard';
export { auditPlatformAction, deniedBody, enforcePlatformAction } from './enforce';
export { assignPlatformRole, listPlatformAdmins } from './roles';
export type { AssignRoleOptions, AssignRoleResult } from './roles';
export type { AuditAttemptInput, EnforceInput, EnforceResult } from './enforce';
