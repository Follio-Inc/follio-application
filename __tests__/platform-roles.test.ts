/**
 * Developer Platform roles and the audit trail (PLATFORM_TODO item 28).
 *
 * Two things decide whether this item is real rather than decorative:
 * **the role comes from the database and nowhere else**, and **the server
 * refuses regardless of what the UI rendered**. A permission system whose
 * only enforcement is a hidden button is not one, so most of this file is
 * about the routes and the lookup rather than the matrix — the matrix is the
 * easy part.
 *
 * Seams throughout: no test reads a real `Admin` row, writes to the real
 * audit trail, or signs anyone in.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { appendAuditEvent, readAuditLog } from '@/_admin-panel/platform/drift/audit';
import {
  PLATFORM_PERMISSIONS,
  PLATFORM_PERMISSIONS_BY_ROLE,
  PLATFORM_ROLES,
  assignPlatformRole,
  auditPlatformAction,
  authorizePlatform,
  enforcePlatformAction,
  getPlatformRole,
  hasPlatformPermission,
  isPlatformRole,
  requirePlatformPermission,
} from '@/_admin-panel/platform/auth';
import type { PlatformPermission, PlatformRole } from '@/_admin-panel/platform/auth';

const AUTH_DIR = '_admin-panel/platform/auth';

const ROUTES = {
  'tests:run': 'app/api/admin/platform/tests/run/route.ts',
  'live-qa:run': 'app/api/admin/platform/tests/live-qa/run/route.ts',
  'tests:cancel': 'app/api/admin/platform/tests/cancel/route.ts',
  'labs:run': 'app/api/admin/platform/labs/resume-import-ai/run/route.ts',
  'labs:compare': 'app/api/admin/platform/labs/resume-import-ai/compare/route.ts',
  'drift:quarantine': 'app/api/admin/platform/drift/quarantine/route.ts',
  'drift:restore': 'app/api/admin/platform/drift/restore/route.ts',
  'drift:delete': 'app/api/admin/platform/drift/delete/route.ts',
  'roles:assign': 'app/api/admin/platform/roles/route.ts',
} as const satisfies Partial<Record<PlatformPermission, string>>;

/** Routes a viewer may call. */
const READ_ROUTES = [
  'app/api/admin/platform/drift/analyze/route.ts',
  'app/api/admin/platform/tests/active/route.ts',
  'app/api/admin/platform/tests/live-qa/artifact/route.ts',
];

const PAGES = [
  'app/admin/(dashboard)/platform/page.tsx',
  'app/admin/(dashboard)/platform/tests/page.tsx',
  'app/admin/(dashboard)/platform/drift/page.tsx',
  'app/admin/(dashboard)/platform/labs/page.tsx',
  'app/admin/(dashboard)/platform/labs/resume-import-ai/page.tsx',
];

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function codeOf(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'platform-roles-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A role lookup that answers with whatever the test says. */
const lookupOf = (value: unknown) => async () => value;

/** Reads the audit trail this test wrote. */
function trail() {
  return readAuditLog({ repoRoot: dir });
}

describe('the roles themselves', () => {
  it('are exactly viewer, runner and maintainer', () => {
    expect([...PLATFORM_ROLES]).toEqual(['viewer', 'runner', 'maintainer']);
    expect(Object.keys(PLATFORM_PERMISSIONS_BY_ROLE).sort()).toEqual([
      'maintainer',
      'runner',
      'viewer',
    ]);
  });

  it('match the Prisma enum exactly', () => {
    // The database is the source, so a role the schema allows and this union
    // does not would be stored and then denied forever.
    const schema = read('prisma/schema.prisma');
    const block = schema.slice(schema.indexOf('enum PlatformRole'), schema.indexOf('model Admin'));
    const values = [...block.matchAll(/^\s{2}(\w+)$/gm)].map((match) => match[1]);

    expect(values).toEqual([...PLATFORM_ROLES]);
  });

  it('is non-null in the schema and defaults to maintainer', () => {
    const schema = read('prisma/schema.prisma');

    expect(schema).toMatch(/platformRole\s+PlatformRole\s+@default\(maintainer\)/);
    // Not optional: `PlatformRole?` would reintroduce the nullable semantics
    // the decision ruled out.
    expect(schema).not.toMatch(/platformRole\s+PlatformRole\?/);
  });

  it('recognises only those three strings', () => {
    for (const role of PLATFORM_ROLES) expect(isPlatformRole(role)).toBe(true);
    for (const value of ['admin', 'owner', 'MAINTAINER', '', null, undefined, 1, {}]) {
      expect(isPlatformRole(value), String(value)).toBe(false);
    }
  });
});

describe('the permission matrix', () => {
  it('lives in one place', () => {
    // A role compared anywhere else is how a matrix stops being the matrix.
    for (const route of [...Object.values(ROUTES), ...READ_ROUTES, ...PAGES]) {
      const source = codeOf(read(route));
      expect(source, `${route} must not compare a role itself`).not.toMatch(
        /===\s*''(viewer|runner|maintainer)|role ===|platformRole ===/
      );
    }
    for (const file of ['guard.ts', 'enforce.ts', 'roles.ts']) {
      const source = codeOf(read(`${AUTH_DIR}/${file}`));
      expect(source, `${file} must not hardcode a role comparison`).not.toMatch(
        /=== ''maintainer''|=== ''runner''|=== ''viewer''/
      );
    }
  });

  it('gives a viewer read access and nothing else', () => {
    expect([...PLATFORM_PERMISSIONS_BY_ROLE.viewer]).toEqual(['platform:read']);

    for (const permission of PLATFORM_PERMISSIONS) {
      const expected = permission === 'platform:read';
      expect(hasPlatformPermission('viewer', permission), permission).toBe(expected);
    }
  });

  it('gives a runner execution but nothing destructive', () => {
    for (const permission of [
      'platform:read',
      'tests:run',
      'live-qa:run',
      'tests:cancel',
      'labs:run',
      'labs:compare',
    ] as const) {
      expect(hasPlatformPermission('runner', permission), permission).toBe(true);
    }
    for (const permission of [
      'drift:quarantine',
      'drift:restore',
      'drift:delete',
      'roles:assign',
    ] as const) {
      expect(hasPlatformPermission('runner', permission), permission).toBe(false);
    }
  });

  it('gives a maintainer everything', () => {
    for (const permission of PLATFORM_PERMISSIONS) {
      expect(hasPlatformPermission('maintainer', permission), permission).toBe(true);
    }
  });

  it('is cumulative, so no role is missing something a lesser one has', () => {
    for (const permission of PLATFORM_PERMISSIONS_BY_ROLE.viewer) {
      expect(hasPlatformPermission('runner', permission)).toBe(true);
    }
    for (const permission of PLATFORM_PERMISSIONS_BY_ROLE.runner) {
      expect(hasPlatformPermission('maintainer', permission)).toBe(true);
    }
  });
});

describe('where the role comes from', () => {
  it('reads it from the admin row and nothing else', () => {
    const guard = read(`${AUTH_DIR}/guard.ts`);

    expect(guard).toContain('db.admin.findUnique');
    expect(guard).toContain('platformRole: true');
    // Never from the caller.
    const code = codeOf(guard);
    expect(code).not.toMatch(/request|body|searchParams|headers|cookies/);
    expect(code).not.toMatch(/process\.env/);
  });

  it('never infers a role from an email or a domain', () => {
    // Executable text: `guard.ts` explains in prose that it never does this,
    // and `roles.ts` says its listing carries no email.
    for (const file of ['guard.ts', 'enforce.ts', 'roles.ts', 'types.ts']) {
      const source = codeOf(read(`${AUTH_DIR}/${file}`));
      expect(source, file).not.toMatch(/email|@[a-z]+\.(com|org|io|me)|endsWith\(/i);
    }
  });

  it('hardcodes nobody', () => {
    for (const file of ['guard.ts', 'enforce.ts', 'roles.ts', 'types.ts']) {
      const source = read(`${AUTH_DIR}/${file}`);
      expect(source, file).not.toMatch(/padma|pmohanty|dons\.usfca|clerk_|user_[0-9a-z]{8}/i);
    }
  });

  it('fails closed on a role it does not recognise', async () => {
    // The Prisma enum makes this unreachable through normal writes, but a
    // hand-edited row or a future migration could still produce one, and the
    // honest answer to "I do not know this role" is no.
    for (const stored of ['admin', 'owner', 'MAINTAINER', '', null, undefined, 7]) {
      const authz = await authorizePlatform('a1', 'platform:read', lookupOf(stored));
      expect(authz.allowed, String(stored)).toBe(false);
      expect(authz.role).toBeNull();
    }
  });

  it('distinguishes why it said no', async () => {
    expect((await authorizePlatform('a1', 'tests:run', lookupOf(undefined))).allowed).toBe(false);
    expect(
      (await authorizePlatform('a1', 'tests:run', lookupOf(undefined))) as { reason: string }
    ).toMatchObject({ reason: 'unknown-admin' });
    expect(
      (await authorizePlatform('a1', 'tests:run', lookupOf('nonsense'))) as { reason: string }
    ).toMatchObject({ reason: 'invalid-role' });
    expect(
      (await authorizePlatform('a1', 'tests:run', lookupOf('viewer'))) as { reason: string }
    ).toMatchObject({ reason: 'insufficient-role' });
  });

  it('fails closed when the lookup throws', async () => {
    const authz = await authorizePlatform('a1', 'platform:read', async () => {
      throw new Error('database unreachable');
    });

    expect(authz.allowed).toBe(false);
    expect(authz).toMatchObject({ reason: 'lookup-failed' });
    expect(
      await getPlatformRole('a1', async () => {
        throw new Error('nope');
      })
    ).toBeNull();
  });

  it('throws a 403 from the require form', async () => {
    await expect(
      requirePlatformPermission('a1', 'drift:delete', lookupOf('runner'))
    ).rejects.toMatchObject({ status: 403, name: 'PlatformPermissionError' });
    await expect(
      requirePlatformPermission('a1', 'drift:delete', lookupOf('maintainer'))
    ).resolves.toBe('maintainer');
  });
});

describe('the routes enforce it themselves', () => {
  it.each(Object.entries(ROUTES))('%s is gated in %s', (permission, route) => {
    const source = read(route);
    const handler = source.slice(source.indexOf('export async function POST'));

    expect(source).toContain("from '@/_admin-panel/platform/auth'");
    expect(handler).toContain(`permission: '${permission}'`);
    // Identity first, then the role, before anything else happens.
    expect(handler.indexOf('requireAdmin')).toBeLessThan(
      handler.indexOf(
        permission === 'roles:assign' ? 'enforcePlatformAction' : 'enforcePlatformAction'
      )
    );
  });

  it('refuses before running anything, on every executing route', () => {
    for (const [permission, route] of Object.entries(ROUTES)) {
      if (permission === 'roles:assign') continue;
      const source = read(route);
      const handler = source.slice(source.indexOf('export async function POST'));

      // The role check precedes the local-only guard, so a viewer is told
      // their role is insufficient rather than that devtools are disabled.
      expect(handler.indexOf('enforcePlatformAction'), route).toBeLessThan(
        handler.indexOf('assertCanRunDeveloperSuites')
      );
      // And every item-12 gate survives.
      expect(source, route).toContain('assertCanRunDeveloperSuites()');
    }
  });

  it('never takes the acting role from the request', () => {
    for (const [permission, route] of Object.entries(ROUTES)) {
      // The assignment route reads a role from the body on purpose — it is
      // the value to *give* someone, not the caller's own. Asserted below.
      if (permission === 'roles:assign') continue;
      const source = codeOf(read(route));

      expect(source, route).not.toMatch(/body\.(role|platformRole|actorRole)/);
      expect(source, route).not.toMatch(/searchParams\.get\(''role/);
      expect(source, route).not.toMatch(/headers\(\)[\s\S]{0,40}role/);
    }
    // The one route that reads a role from the body reads it as the *target*
    // value to assign, and still resolves the caller's own role from the
    // database.
    const roles = read(ROUTES['roles:assign']);
    expect(roles).toContain('body.role');
    expect(roles).toContain("permission: 'roles:assign'");
    expect(roles).toContain('adminId: admin.adminId');
  });

  it('leaves the read routes open to a viewer', () => {
    for (const route of READ_ROUTES) {
      expect(read(route), route).not.toContain('enforcePlatformAction');
      // Still admin-only, though.
      expect(read(route), route).toMatch(/requireAdmin\(\)/);
    }
  });

  it('keeps every Platform page readable by all three roles', () => {
    for (const page of PAGES) {
      const source = read(page);
      expect(source, page).toMatch(/requireAdmin\(\)/);
      // No page refuses on a role: a viewer must be able to inspect.
      expect(codeOf(source), page).not.toMatch(/redirect\(|notFound\(|throw new/);
    }
  });
});

describe('hiding a control is not authorization', () => {
  it('hides controls by permission in the pages', () => {
    expect(read('app/admin/(dashboard)/platform/tests/page.tsx')).toContain(
      "canRunDeveloperSuites() && may('tests:run')"
    );
    expect(read('app/admin/(dashboard)/platform/drift/page.tsx')).toContain('mayMaintain');
    expect(read('app/admin/(dashboard)/platform/labs/resume-import-ai/page.tsx')).toContain(
      "hasPlatformPermission(role, 'labs:run')"
    );
  });

  it('still enforces on the route when the control is hidden', async () => {
    // The pair that matters: the page would render no button for a viewer,
    // and the route refuses a viewer who posts anyway.
    for (const permission of ['tests:run', 'labs:run', 'drift:delete'] as const) {
      const denied = await enforcePlatformAction({
        adminId: 'a1',
        permission,
        action: permission === 'drift:delete' ? 'delete' : 'tests:run',
        lookup: lookupOf('viewer'),
        audit: { repoRoot: dir },
      });
      expect(denied.allowed, permission).toBe(false);
    }
  });

  it('shows the role in the shell', () => {
    const shell = read('_admin-panel/platform/ui/platform-shell.tsx');

    expect(shell).toContain('ROLE_SUMMARY');
    expect(shell).toContain('role ?? ');
    // And the layout reads it on the server rather than trusting the client.
    const layout = read('app/admin/(dashboard)/platform/layout.tsx');
    expect(layout).toContain('getPlatformRole(admin.adminId)');
    expect(layout).toMatch(/requireAdmin\(\)/);
  });
});

describe('the audit trail', () => {
  /**
   * The gate, then the permitted-attempt line a route writes after its
   * guards and its parse. Two calls, because the gate deliberately records
   * nothing for a caller it is about to let through — see `enforce.ts`.
   */
  const enforce = async (role: unknown, permission: PlatformPermission, action: string) => {
    const authz = await enforcePlatformAction({
      adminId: 'admin-1',
      permission,
      action: action as never,
      lookup: lookupOf(role),
      audit: { repoRoot: dir },
    });

    if (authz.allowed) {
      auditPlatformAction({
        adminId: 'admin-1',
        role: authz.role,
        action: action as never,
        target: 'Builder',
        audit: { repoRoot: dir },
      });
    }

    return authz;
  };

  it('records a denied attempt', async () => {
    await enforce('viewer', 'tests:run', 'tests:run');
    const events = trail();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'tests:run',
      result: 'denied-role',
      actorId: 'admin-1',
      actorRole: 'viewer',
      reason: 'insufficient-role',
      // The action, not a category: a denial is raised before anything is
      // parsed, so there is no concrete target to name.
      path: 'tests:run',
    });
  });

  it('records an allowed attempt', async () => {
    await enforce('runner', 'tests:run', 'tests:run');
    const events = trail();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ result: 'ok', actorRole: 'runner' });
  });

  it('records the actor’s role on every entry', async () => {
    await enforce('viewer', 'drift:delete', 'delete');
    await enforce('maintainer', 'drift:delete', 'delete');

    const roles = trail().map((event) => event.actorRole);
    expect(new Set(roles)).toEqual(new Set(['viewer', 'maintainer']));
  });

  it('records a denial even when the role could not be read', async () => {
    await enforce(undefined, 'tests:run', 'tests:run');

    expect(trail()[0]).toMatchObject({ result: 'denied-role', reason: 'unknown-admin' });
    // Null, not a guessed role.
    expect(trail()[0].actorRole).toBeNull();
  });

  it('stays append-only', async () => {
    await enforce('runner', 'tests:run', 'tests:run');
    await enforce('viewer', 'tests:run', 'tests:run');
    expect(trail()).toHaveLength(2);

    // The writer has exactly one filesystem call and it appends.
    const audit = read('_admin-panel/platform/drift/audit.ts');
    expect(audit).toContain('appendFileSync');
    expect(codeOf(audit)).not.toMatch(/writeFileSync|rmSync|unlink|truncate|renameSync/);
  });

  it('keeps item 19’s records readable', () => {
    // A line with no `actorRole`, exactly as item 19 wrote it.
    const legacy = {
      version: 1,
      id: 'legacy-1',
      at: '2026-10-01T00:00:00.000Z',
      action: 'quarantine',
      result: 'ok',
      path: 'lib/dead.ts',
      quarantineId: 'q1',
      signal: 'reachability',
      group: 'unrecordedOrphans',
      evidence: ['nothing reaches it'],
      sha256Before: 'abc',
      sha256After: 'abc',
      approval: null,
      actorId: 'admin-0',
      reason: null,
    };
    const file = path.join(dir, '_admin-panel', 'platform', '.audit', 'audit-v1.jsonl');
    // Append first: that call creates the directory. Then the legacy line is
    // prepended, so the trail holds one of each format.
    appendAuditEvent(
      {
        action: 'tests:run',
        result: 'ok',
        path: 'Builder',
        quarantineId: null,
        signal: null,
        group: null,
        evidence: [],
        sha256Before: null,
        sha256After: null,
        approval: null,
        actorId: 'admin-1',
        actorRole: 'runner',
        reason: null,
      },
      { repoRoot: dir }
    );
    writeFileSync(file, `${JSON.stringify(legacy)}\n${readFileSync(file, 'utf8')}`, 'utf8');

    const events = trail();
    expect(events).toHaveLength(2);
    const legacyEvent = events.find((event) => event.id === 'legacy-1');
    expect(legacyEvent).toBeDefined();
    // Read, and its missing role is null rather than a guess.
    expect(legacyEvent?.actorRole ?? null).toBeNull();
  });

  it('skips a record it cannot read without losing the rest', async () => {
    await enforce('runner', 'tests:run', 'tests:run');
    const file = path.join(dir, '_admin-panel', 'platform', '.audit', 'audit-v1.jsonl');
    writeFileSync(
      file,
      `not json\n{"version":99,"action":"quarantine"}\n{"version":1,"action":"invented"}\n${readFileSync(file, 'utf8')}`,
      'utf8'
    );

    const events = trail();
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('tests:run');
  });

  it('records every privileged action the platform has', () => {
    const types = read('_admin-panel/platform/drift/quarantine-types.ts');

    for (const action of [
      'quarantine',
      'delete',
      'restore',
      'tests:run',
      'live-qa:run',
      'tests:cancel',
      'labs:run',
      'labs:compare',
      'roles:assign',
    ]) {
      expect(types, action).toContain(`'${action}'`);
    }
    // And the reader validates against that list rather than its own copy.
    expect(read('_admin-panel/platform/drift/audit.ts')).toContain('AUDIT_ACTIONS');
  });

  it('carries no secret, email, token or resume text', async () => {
    const secret = 'sk-canary-not-a-real-key';
    process.env.PLATFORM_ROLES_CANARY = secret;
    try {
      await enforce('runner', 'labs:run', 'labs:run');
      await enforce('viewer', 'drift:delete', 'delete');

      const file = path.join(dir, '_admin-panel', 'platform', '.audit', 'audit-v1.jsonl');
      const raw = readFileSync(file, 'utf8');

      expect(raw).not.toContain(secret);
      expect(raw).not.toMatch(/@[a-z]+\.(com|org|io|me)/i);
      expect(raw).not.toMatch(/OPENAI_API_KEY|DATABASE_URL|Bearer |clerk_|user_2/i);
      expect(raw).not.toMatch(/ {4}at .*\(/);

      // The key set is deliberate.
      expect(Object.keys(trail()[0]).sort()).toEqual([
        'action',
        'actorId',
        'actorRole',
        'approval',
        'at',
        'evidence',
        'group',
        'id',
        'path',
        'quarantineId',
        'reason',
        'result',
        'sha256After',
        'sha256Before',
        'signal',
        'version',
      ]);
    } finally {
      delete process.env.PLATFORM_ROLES_CANARY;
    }
  });
});

describe('role assignment', () => {
  const actor = { adminId: 'admin-1', role: 'maintainer' as PlatformRole };

  /**
   * A stand-in for the atomic seam, backed by a mutable store.
   *
   * The real one runs a transaction with the maintainer rows locked; this
   * models it, and the store is shared so a test can observe what was
   * written. One seam rather than the three it replaced, because separate
   * calls are what let two demotions race.
   */
  function store(initial: Record<string, PlatformRole>) {
    const rows = { ...initial };
    const exclusive = async (
      targetAdminId: string,
      apply: (current: { targetRole: string | null; maintainers: number }) => Promise<{
        write: PlatformRole | null;
      }>
    ) => {
      const { write } = await apply({
        targetRole: rows[targetAdminId] ?? null,
        maintainers: Object.values(rows).filter((role) => role === 'maintainer').length,
      });
      if (write !== null) rows[targetAdminId] = write;
    };
    return { rows, exclusive };
  }

  const options = (overrides: Record<string, unknown> = {}) => ({
    audit: { repoRoot: dir },
    exclusive: store({ 'admin-1': 'maintainer', 'admin-2': 'runner', 'admin-3': 'maintainer' })
      .exclusive,
    ...overrides,
  });

  it('refuses an acting role that cannot assign, even called directly', async () => {
    // Defense in depth. The route gates this and is the only caller, but a
    // function that changes authorization should not rely on its callers.
    for (const role of ['viewer', 'runner'] as PlatformRole[]) {
      const result = await assignPlatformRole(
        { adminId: 'admin-1', role },
        'admin-2',
        'maintainer',
        options()
      );

      expect(result.ok, role).toBe(false);
      expect(result, role).toMatchObject({ reason: 'insufficient-role' });
    }

    // And the refusal is audited, like every other attempt.
    expect(trail().map((event) => event.result)).toEqual(['refused', 'refused']);
    expect(trail()[0].action).toBe('roles:assign');
  });

  it('accepts only the three roles', async () => {
    for (const bad of ['admin', 'owner', '', null, 7, {}]) {
      const result = await assignPlatformRole(actor, 'admin-2', bad, options());
      expect(result.ok, String(bad)).toBe(false);
      expect(result).toMatchObject({ reason: 'invalid-role' });
    }

    const good = await assignPlatformRole(actor, 'admin-2', 'viewer', options());
    expect(good.ok).toBe(true);
  });

  it('writes only the role column', async () => {
    const roles = read(`${AUTH_DIR}/roles.ts`);

    expect(roles).toContain('data: { platformRole: write }');
    // No membership change: creating or deleting an admin is a different
    // concept with its own route.
    expect(codeOf(roles)).not.toMatch(/admin\.create|admin\.delete|admin\.deleteMany/);
  });

  it('refuses to leave zero maintainers', async () => {
    const result = await assignPlatformRole(
      actor,
      'admin-1',
      'viewer',
      options({ exclusive: store({ 'admin-1': 'maintainer' }).exclusive })
    );

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ reason: 'last-maintainer' });
    // And the refusal is on the record.
    expect(trail()[0]).toMatchObject({
      action: 'roles:assign',
      result: 'refused',
      reason: 'last-maintainer',
    });
  });

  it('allows the demotion when another maintainer remains', async () => {
    const result = await assignPlatformRole(
      actor,
      'admin-1',
      'runner',
      options({
        exclusive: store({ 'admin-1': 'maintainer', 'admin-3': 'maintainer' }).exclusive,
      })
    );

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ from: 'maintainer', to: 'runner' });
  });

  it('counts maintainers live rather than trusting the caller', () => {
    const roles = codeOf(read(`${AUTH_DIR}/roles.ts`));

    expect(roles).toContain('maintainers');
    expect(roles).not.toMatch(/body\.|request\./);
  });

  it('audits every attempt, including the refusals', async () => {
    await assignPlatformRole(actor, 'admin-2', 'nonsense', options());
    await assignPlatformRole(actor, 'admin-2', 'viewer', options());
    await assignPlatformRole(
      actor,
      'admin-9',
      'viewer',
      options({ exclusive: store({}).exclusive })
    );

    const events = trail();
    expect(events).toHaveLength(3);
    expect(events.map((event) => event.action)).toEqual([
      'roles:assign',
      'roles:assign',
      'roles:assign',
    ]);
    expect(new Set(events.map((event) => event.result))).toEqual(new Set(['refused', 'ok']));
    for (const event of events) expect(event.actorRole).toBe('maintainer');
  });

  it('is maintainer-only at the route', () => {
    const route = read(ROUTES['roles:assign']);

    expect(route).toContain("permission: 'roles:assign'");
    expect(route).toContain('authorizePlatform(admin.adminId, ');
    // The listing is behind the same permission.
    expect(route).toContain('export async function GET');
    expect(hasPlatformPermission('runner', 'roles:assign')).toBe(false);
    expect(hasPlatformPermission('viewer', 'roles:assign')).toBe(false);
  });

  it('reports no email in its listing', () => {
    const roles = read(`${AUTH_DIR}/roles.ts`);
    const listing = codeOf(roles.slice(roles.indexOf('export async function listPlatformAdmins')));

    expect(listing).toContain('id: true');
    expect(listing).toContain('platformRole: true');
    // Executable text: the doc comment above it names what it leaves out.
    expect(listing).not.toContain('email');
    expect(listing).not.toContain('clerkId');
  });
});

describe('the last-maintainer floor is race-safe', () => {
  const actor = { adminId: 'admin-1', role: 'maintainer' as PlatformRole };

  /** A seam that serializes, as `FOR UPDATE` does. */
  function serializedStore(initial: Record<string, PlatformRole>) {
    const rows = { ...initial };
    let queue: Promise<unknown> = Promise.resolve();

    const exclusive = (
      targetAdminId: string,
      apply: (current: { targetRole: string | null; maintainers: number }) => Promise<{
        write: PlatformRole | null;
      }>
    ) => {
      const run = queue.then(async () => {
        const { write } = await apply({
          targetRole: rows[targetAdminId] ?? null,
          maintainers: Object.values(rows).filter((role) => role === 'maintainer').length,
        });
        if (write !== null) rows[targetAdminId] = write;
      });
      queue = run.catch(() => undefined);
      return run;
    };

    return { rows, exclusive };
  }

  /** A seam that does not — what two separate statements amount to. */
  function racyStore(initial: Record<string, PlatformRole>) {
    const rows = { ...initial };

    const exclusive = async (
      targetAdminId: string,
      apply: (current: { targetRole: string | null; maintainers: number }) => Promise<{
        write: PlatformRole | null;
      }>
    ) => {
      const maintainers = Object.values(rows).filter((role) => role === 'maintainer').length;
      const targetRole = rows[targetAdminId] ?? null;
      // A tick between the read and the write, as two independently
      // committed statements would have.
      await Promise.resolve();
      const { write } = await apply({ targetRole, maintainers });
      if (write !== null) rows[targetAdminId] = write;
    };

    return { rows, exclusive };
  }

  it('does the count and the write in one transaction, with the rows locked', () => {
    const roles = read(`${AUTH_DIR}/roles.ts`);

    // Comments stripped, strings kept: the doc comment above the query
    // explains what `FOR UPDATE` is for, so searching the raw file finds the
    // explanation and passes even if the SQL keyword is deleted. A mutation
    // proved exactly that.
    const executable = roles.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    expect(executable).toContain('db.$transaction');
    // The rows being counted are locked, which is what serializes two
    // concurrent demotions: without it they touch different rows, so neither
    // blocks the other and both read the pre-change count. A conditional
    // UPDATE would not have fixed it either.
    expect(executable).toContain('FOR UPDATE');
    expect(executable).toMatch(/SELECT[\s\S]*"Admin"[\s\S]*platformRole[\s\S]*FOR UPDATE/);

    // And the racy shape is gone: no separate count-then-write seams.
    const code = codeOf(roles);
    expect(code).not.toContain('countMaintainers');
    expect(code).not.toContain('writeRole');
    expect(code).not.toContain('admin.count');
  });

  it('never leaves zero maintainers when two demotions interleave', async () => {
    const { rows, exclusive } = serializedStore({
      'admin-1': 'maintainer',
      'admin-2': 'maintainer',
    });

    const [first, second] = await Promise.all([
      assignPlatformRole(actor, 'admin-1', 'viewer', { audit: { repoRoot: dir }, exclusive }),
      assignPlatformRole(actor, 'admin-2', 'viewer', { audit: { repoRoot: dir }, exclusive }),
    ]);

    // The invariant: one succeeded, one was refused, a maintainer remains.
    expect(Object.values(rows).filter((role) => role === 'maintainer')).toHaveLength(1);
    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
    expect([first, second].find((result) => !result.ok)).toMatchObject({
      reason: 'last-maintainer',
    });
    expect(trail().some((event) => event.reason === 'last-maintainer')).toBe(true);
  });

  it('would reach zero without the lock, which is why it is there', async () => {
    // The same two demotions through a seam that does not serialize. Both
    // read the pre-change count, both succeed, and nobody is left — the
    // anomaly the transaction exists to prevent, asserted so the fix cannot
    // be quietly reverted to two statements.
    const { rows } = racyStore({ 'admin-1': 'maintainer', 'admin-2': 'maintainer' });
    const racy = racyStore({ 'admin-1': 'maintainer', 'admin-2': 'maintainer' });

    await Promise.all([
      assignPlatformRole(actor, 'admin-1', 'viewer', {
        audit: { repoRoot: dir },
        exclusive: racy.exclusive,
      }),
      assignPlatformRole(actor, 'admin-2', 'viewer', {
        audit: { repoRoot: dir },
        exclusive: racy.exclusive,
      }),
    ]);

    expect(Object.values(racy.rows).filter((role) => role === 'maintainer')).toHaveLength(0);
    // The serialized store above, given the same input, keeps one.
    expect(Object.values(rows).filter((role) => role === 'maintainer')).toHaveLength(2);
  });
});

describe('guards run before any payload is parsed', () => {
  const PAYLOAD_ROUTES = Object.entries(ROUTES);

  /**
   * The handler with comments stripped.
   *
   * These routes name `request.formData()` in a comment explaining that it
   * is kept behind the guards — and that comment sits above them, so a raw
   * `indexOf` finds the explanation and reports the opposite of the truth.
   */
  const handlerOf = (route: string) => {
    const source = read(route);
    return codeOf(source.slice(source.indexOf('export async function POST')));
  };

  const parseIndex = (handler: string) =>
    Math.min(
      ...[handler.indexOf('request.json'), handler.indexOf('request.formData')].filter(
        (index) => index !== -1
      )
    );

  it.each(PAYLOAD_ROUTES)('%s checks the role before reading the request', (_permission, route) => {
    const handler = handlerOf(route);

    const gate = handler.indexOf('enforcePlatformAction');
    const parse = parseIndex(handler);

    expect(gate).toBeGreaterThan(-1);
    expect(Number.isFinite(parse)).toBe(true);
    // A refused caller's payload is never parsed.
    expect(gate, route).toBeLessThan(parse);
  });

  it('runs the local-only guard before any payload too', () => {
    for (const [permission, route] of PAYLOAD_ROUTES) {
      if (permission === 'roles:assign') continue; // no execution guard here
      const handler = handlerOf(route);

      expect(handler.indexOf('assertCanRunDeveloperSuites'), route).toBeLessThan(
        parseIndex(handler)
      );
    }
  });

  it('never buffers a multipart upload for a caller it is about to refuse', () => {
    // The worst case: `request.formData()` buffers and parses up to 5 MB. A
    // viewer, or a production deployment, must not pay for that so an audit
    // line can name a fixture.
    for (const route of [
      'app/api/admin/platform/labs/resume-import-ai/run/route.ts',
      'app/api/admin/platform/labs/resume-import-ai/compare/route.ts',
    ]) {
      const handler = handlerOf(route);

      expect(handler.indexOf('enforcePlatformAction'), route).toBeLessThan(
        handler.indexOf('request.formData')
      );
      expect(handler.indexOf('assertCanRunDeveloperSuites'), route).toBeLessThan(
        handler.indexOf('request.formData')
      );
    }
  });

  it('audits a denial against the action when no target is known yet', async () => {
    await enforcePlatformAction({
      adminId: 'admin-1',
      permission: 'labs:run',
      action: 'labs:run',
      lookup: lookupOf('viewer'),
      audit: { repoRoot: dir },
    });

    expect(trail()[0]).toMatchObject({
      action: 'labs:run',
      result: 'denied-role',
      path: 'labs:run',
      actorRole: 'viewer',
    });
  });

  it('records nothing for a permitted caller until the target is known', async () => {
    const authz = await enforcePlatformAction({
      adminId: 'admin-1',
      permission: 'tests:run',
      action: 'tests:run',
      lookup: lookupOf('runner'),
      audit: { repoRoot: dir },
    });

    expect(authz.allowed).toBe(true);
    expect(trail()).toHaveLength(0);

    auditPlatformAction({
      adminId: 'admin-1',
      role: 'runner',
      action: 'tests:run',
      target: 'Builder',
      audit: { repoRoot: dir },
    });
    expect(trail()[0]).toMatchObject({ result: 'ok', path: 'Builder', actorRole: 'runner' });
  });

  it('records the concrete target once it is safely available', () => {
    for (const [permission, route] of PAYLOAD_ROUTES) {
      if (permission === 'roles:assign') continue; // audited inside assignPlatformRole
      const handler = handlerOf(route);

      expect(handler, route).toContain('auditPlatformAction({');

      // The **permitted-attempt** call, which is the one with no `result:`.
      // Item 29 added a second call ahead of the parse — a cost refusal,
      // which is audited before any PDF work precisely so none happens — so
      // taking the first index would now find that one.
      const permitted = [...handler.matchAll(/auditPlatformAction\(\{[\s\S]*?\}\)/g)].find(
        (match) => !match[0].includes('result:')
      );
      expect(permitted, route).toBeDefined();
      expect(permitted!.index, route).toBeGreaterThan(parseIndex(handler));
    }
  });
});

describe('nothing else moved', () => {
  it('leaves requireAdmin and product authorization alone', () => {
    const admin = read('lib/admin.ts');

    // Item 28 added a second lookup rather than widening the context every
    // product admin route depends on.
    expect(admin).not.toContain('platformRole');
    expect(admin).not.toContain('PlatformRole');
    // And the product's own admin-promotion route is untouched.
    expect(read('app/api/admin/users/[id]/role/route.ts')).not.toContain('platformRole');
  });

  it('keeps the local-only guard and the production ban', async () => {
    const { canRunDeveloperSuites } = await import('@/_admin-panel/modules/developer/guard');

    expect(canRunDeveloperSuites({ nodeEnv: 'production', enabledFlag: 'true' })).toBe(false);
    for (const route of Object.values(ROUTES)) {
      if (route.endsWith('roles/route.ts')) continue;
      expect(read(route), route).toContain('assertCanRunDeveloperSuites()');
    }
  });

  it('keeps item 19’s destructive safety', () => {
    const quarantine = read('_admin-panel/platform/drift/quarantine.ts');

    expect(quarantine).toContain('PROTECTED_PREFIXES');
    expect(quarantine).toContain('realpathSync');
    expect(read(ROUTES['drift:delete'])).toContain('confirmation');
  });

  it('keeps the old developer route a redirect', () => {
    expect(read('app/admin/(dashboard)/developer/page.tsx')).toContain(
      "redirect('/admin/platform')"
    );
  });

  it('adds no dependency', () => {
    const specifiers = new Set<string>();
    for (const file of ['types.ts', 'guard.ts', 'enforce.ts', 'roles.ts', 'index.ts']) {
      for (const match of read(`${AUTH_DIR}/${file}`).matchAll(/from '([^']+)'/g)) {
        if (!match[1].startsWith('.')) specifiers.add(match[1]);
      }
    }

    expect([...specifiers].sort()).toEqual(['@/lib/db']);
  });

  it('touched exactly one model in the schema', () => {
    const migration = read('prisma/migrations/20261014120000_add_platform_role/migration.sql');

    expect(migration).toContain('CREATE TYPE "PlatformRole"');
    expect(migration).toContain('ALTER TABLE "Admin" ADD COLUMN');
    expect(migration).toContain("DEFAULT 'maintainer'");
    // Additive only — no drop of any kind.
    expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN|DROP CONSTRAINT/);
    expect(migration.match(/ALTER TABLE/g)).toHaveLength(1);
  });
});
