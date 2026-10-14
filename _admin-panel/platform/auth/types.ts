/**
 * Developer Platform authorization (PLATFORM_TODO item 28).
 *
 * Client-safe: types and the permission map, no database and no `node:`.
 * The map is data so the UI can ask the same question the routes ask, rather
 * than keeping a second opinion about who may do what.
 *
 * `requireAdmin()` remains the identity boundary — it decides *whether* a
 * caller is an admin. This decides *what that admin may do inside the
 * Platform*, and nothing else. It has no bearing on product users.
 */

/**
 * The three roles, and nothing else.
 *
 * Mirrors the `PlatformRole` enum in `prisma/schema.prisma`, so the database
 * refuses a value this union does not contain. A test pins the two together.
 */
export const PLATFORM_ROLES = ['viewer', 'runner', 'maintainer'] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];

/**
 * One thing a role may or may not do.
 *
 * Named for the action rather than the route, so a second route for the same
 * action cannot arrive with different permissions by accident.
 */
export const PLATFORM_PERMISSIONS = [
  /** Open the Platform pages and read everything they show. */
  'platform:read',
  /** Start a Vitest category run. */
  'tests:run',
  /** Start a Live QA pathway run. */
  'live-qa:run',
  /** Cancel whatever run is in flight. */
  'tests:cancel',
  /** Run the Resume Lab against a fixture or an upload. */
  'labs:run',
  /** Run the AI-vs-OpenResume comparison. */
  'labs:compare',
  /** Move a file the drift scan proves is unreachable out of the tree. */
  'drift:quarantine',
  /** Put a quarantined file back. */
  'drift:restore',
  /** Delete a quarantined artifact, with approval. */
  'drift:delete',
  /** Change another admin's Platform role. */
  'roles:assign',
] as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

/**
 * Who may do what.
 *
 * Cumulative by construction: `runner` is viewer's set plus execution, and
 * `maintainer` is runner's set plus the destructive actions and role
 * assignment. Spelled out as spreads rather than as a "level" number,
 * because a numeric rank invites `role >= 2` comparisons scattered through
 * routes and then nobody can answer "what can a runner do?" by reading one
 * place.
 */
const VIEWER: PlatformPermission[] = ['platform:read'];

const RUNNER: PlatformPermission[] = [
  ...VIEWER,
  'tests:run',
  'live-qa:run',
  'tests:cancel',
  'labs:run',
  'labs:compare',
];

const MAINTAINER: PlatformPermission[] = [
  ...RUNNER,
  'drift:quarantine',
  'drift:restore',
  'drift:delete',
  'roles:assign',
];

export const PLATFORM_PERMISSIONS_BY_ROLE: Readonly<
  Record<PlatformRole, readonly PlatformPermission[]>
> = {
  viewer: VIEWER,
  runner: RUNNER,
  maintainer: MAINTAINER,
};

/**
 * Whether a role carries a permission.
 *
 * The only place a role is compared with anything. Routes ask for a
 * permission; none of them names a role, so adding a fourth role would be a
 * change to this file rather than a hunt through ten handlers.
 */
export function hasPlatformPermission(role: PlatformRole, permission: PlatformPermission): boolean {
  return PLATFORM_PERMISSIONS_BY_ROLE[role].includes(permission);
}

/** Whether a persisted string is one of the three roles. */
export function isPlatformRole(value: unknown): value is PlatformRole {
  return typeof value === 'string' && (PLATFORM_ROLES as readonly string[]).includes(value);
}
