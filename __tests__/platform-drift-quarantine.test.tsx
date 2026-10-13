/**
 * Drift actions: quarantine, then delete with approval and an audit record
 * (PLATFORM_TODO item 19).
 *
 * Item 19 has no `_Done when_` clause; its line is the requirement, and the
 * order in it is the design — a finding never reaches a delete. So these
 * assertions are about four things: that only files the scan *proves*
 * unreachable are eligible, that no client-supplied path can reach the
 * filesystem, that a delete needs approval checked on the server, and that
 * every attempt leaves a trail.
 *
 * **Nothing here touches a real repository file.** Every destructive test runs
 * against a temporary directory that plays the part of a repository: a fixture
 * tree, a synthetic report naming it, and a quarantine and audit store of its
 * own. The one place the real repository is used is read-only — the candidate
 * list from the real scan, to check what it does and does not offer.
 */

import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  appendAuditEvent,
  buildQuarantineView,
  deleteQuarantined,
  ELIGIBLE_GROUPS,
  isProtectedPath,
  listQuarantine,
  quarantineCandidate,
  quarantineCandidates,
  QUARANTINE_FORMAT_VERSION,
  readAuditLog,
  restoreQuarantined,
} from '@/_admin-panel/platform/drift';
import type {
  ActionResult,
  AuditEvent,
  QuarantineRecord,
  QuarantineView,
} from '@/_admin-panel/platform/drift';
import { runDriftScan } from '@/_admin-panel/platform/scan';
import type { DriftReport } from '@/_admin-panel/platform/scan';
import { DriftQuarantinePanel } from '@/_admin-panel/platform/ui';

const QUARANTINE = '_admin-panel/platform/drift/quarantine.ts';
const AUDIT = '_admin-panel/platform/drift/audit.ts';
const PANEL = '_admin-panel/platform/ui/drift-quarantine-panel.tsx';
const DRIFT_PAGE = 'app/admin/(dashboard)/platform/drift/page.tsx';
const ROUTES = [
  'app/api/admin/platform/drift/quarantine/route.ts',
  'app/api/admin/platform/drift/delete/route.ts',
  'app/api/admin/platform/drift/restore/route.ts',
];

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&rsquo;|&#8217;/g, '’')
    .replace(/\s+/g, ' ');
}

const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

/* ------------------------------------------------------------------ *
 * A throwaway repository: a tree, a report that names it, and stores. *
 * ------------------------------------------------------------------ */

const roots: string[] = [];
let repo = '';

/** The files every fixture starts with. Bystanders included, on purpose. */
const FIXTURE_FILES: Record<string, string> = {
  'lib/orphan.ts': 'export const orphan = 1;\n',
  'lib/dead-end.ts': 'export const deadEnd = 2;\n',
  'lib/also-dead.ts': "import { deadEnd } from './dead-end';\nexport const x = deadEnd;\n",
  'lib/live.ts': 'export const live = 3;\n',
  '__tests__/dead.test.ts': "import './x';\n",
  'package.json': '{ "name": "fixture" }\n',
  '.env.local': 'SECRET=should-never-move\n',
  '_admin-panel/platform/coverage-map/map.ts': 'export const COVERAGE_MAP = [];\n',
};

beforeEach(() => {
  repo = mkdtempSync(path.join(tmpdir(), 'follio-item19-'));
  roots.push(repo);

  for (const [relative, contents] of Object.entries(FIXTURE_FILES)) {
    const absolute = path.join(repo, relative);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents, 'utf8');
  }
});

afterEach(() => {
  // The real repository must be untouched by every test in this file.
  expect(existsSync(path.join(process.cwd(), '_admin-panel/platform/coverage-map/map.ts'))).toBe(
    true
  );
});

afterAll(() => {
  for (const directory of roots) rmSync(directory, { recursive: true, force: true });
});

function options(extra: Record<string, unknown> = {}) {
  return {
    repoRoot: repo,
    root: path.join(repo, '.quarantine'),
    auditRoot: path.join(repo, '.audit'),
    canRun: true,
    actorId: 'admin_fixture_1',
    report: fixtureReport(),
    ...extra,
  };
}

/** A report whose unreachable lists name the fixture's files. */
function fixtureReport(overrides: Record<string, unknown> = {}): DriftReport {
  const reachability = {
    signal: 'reachability',
    summary: {
      modules: 4,
      entryPoints: 1,
      live: 1,
      moduleReachableCallUnused: 1,
      orphan: 2,
      records: 0,
      recordsInAgreement: 0,
      unrecordedOrphans: 1,
      unrecordedCallUnused: 1,
    },
    entryPoints: ['app/page.tsx'],
    records: [],
    disagreements: [],
    unrecordedOrphans: ['lib/orphan.ts'],
    unrecordedCallUnused: ['lib/live.ts'],
    deadEnds: [{ path: 'lib/dead-end.ts', importedBy: ['lib/also-dead.ts'] }],
    ...((overrides.reachability as Record<string, unknown>) ?? {}),
  };

  const tests = {
    signal: 'test-attribution',
    summary: {
      total: 1,
      mapped: 0,
      unlisted: 0,
      misattributed: 0,
      uncategorized: 0,
      deadCode: 1,
      sourceText: 0,
      unresolvable: 0,
    },
    tests: [],
    mapped: [],
    unlisted: [],
    misattributed: [],
    uncategorized: [],
    deadCode: [
      {
        path: '__tests__/dead.test.ts',
        assertion: 'behavior',
        directTargets: ['lib/orphan.ts'],
        barrelTargets: [],
        unresolved: [],
        inferredFeatures: [],
        declaredFeatures: [],
        classification: 'dead-code',
      },
    ],
    stale: [],
    ...((overrides.tests as Record<string, unknown>) ?? {}),
  };

  const pathways = {
    signal: 'live-qa-pathways',
    summary: {
      total: 0,
      mapped: 0,
      unmapped: 0,
      missingSpec: 0,
      orphanSpecs: 0,
      featuresWithPathway: 0,
      featuresWithoutPathway: 0,
    },
    pathways: [],
    mapped: [],
    unmapped: [],
    missingSpec: [],
    orphanSpecs: [],
    stale: [],
    featuresWithoutPathway: [],
    ...((overrides.pathways as Record<string, unknown>) ?? {}),
  };

  return { signals: [reachability, tests, pathways], ok: false } as unknown as DriftReport;
}

const ORPHAN = 'reachability.unrecordedOrphans:lib/orphan.ts';

function quarantineOrphan(extra: Record<string, unknown> = {}): ActionResult {
  return quarantineCandidate(ORPHAN, options(extra));
}

/** Every fixture file and its bytes, for the bystander check. */
function snapshot(): Record<string, string> {
  const found: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.name === '.quarantine' || entry.name === '.audit') continue;
      if (entry.isDirectory()) walk(absolute);
      else
        found[path.relative(repo, absolute).replace(/\\/g, '/')] = sha256(readFileSync(absolute));
    }
  };
  walk(repo);

  return found;
}

describe('only files the scan proves unreachable are eligible', () => {
  it('offers the four lists item 19 allows, and nothing else', () => {
    expect([...ELIGIBLE_GROUPS].sort()).toEqual([
      'live-qa-pathways.orphanSpecs',
      'reachability.deadEnds',
      'reachability.unrecordedOrphans',
      'test-attribution.deadCode',
    ]);
  });

  it('derives candidates from the report, with the scan’s own evidence', () => {
    const candidates = quarantineCandidates(fixtureReport());

    expect(candidates.map((candidate) => candidate.path).sort()).toEqual([
      '__tests__/dead.test.ts',
      'lib/dead-end.ts',
      'lib/orphan.ts',
    ]);
    const orphan = candidates.find((candidate) => candidate.id === ORPHAN)!;
    expect(orphan.evidence.join(' ')).toContain('No shipped entry point reaches this module');
    expect(orphan.evidence.join(' ')).toContain('1 entry points over 4 modules');
    const deadEnd = candidates.find((candidate) => candidate.path === 'lib/dead-end.ts')!;
    expect(deadEnd.evidence.join(' ')).toContain('Imported by: lib/also-dead.ts');
  });

  it('never offers a module something imports, however unused', () => {
    // Item 8's warning, enforced: `module-reachable-call-unused` is reachable,
    // and a scan that cannot tell it from an orphan "is not safe to act on".
    const candidates = quarantineCandidates(fixtureReport());

    expect(candidates.map((candidate) => candidate.path)).not.toContain('lib/live.ts');
    expect(ELIGIBLE_GROUPS).not.toContain('reachability.unrecordedCallUnused');
  });

  it('refuses a candidate this scan no longer has', () => {
    const result = quarantineCandidate('reachability.unrecordedOrphans:lib/invented.ts', options());

    expect(result.outcome).toBe('stale-finding');
    expect(result.detail).toContain('Reload the drift page');
    // Refusals are recorded, which is how "what happened to that file" stays
    // answerable.
    expect(result.auditId).not.toBeNull();
    expect(readAuditLog({ root: path.join(repo, '.audit') })[0]).toMatchObject({
      action: 'quarantine',
      result: 'refused',
    });
  });

  it('revalidates against a fresh scan rather than the page’s view', () => {
    // The finding existed when the page rendered; by the time the request
    // arrives the file is gone and the scan no longer lists it.
    const gone = fixtureReport({
      reachability: { unrecordedOrphans: [], deadEnds: [] },
    });
    const result = quarantineCandidate(ORPHAN, options({ report: gone }));

    expect(result.outcome).toBe('stale-finding');
    expect(existsSync(path.join(repo, 'lib/orphan.ts'))).toBe(true);
    // And the real engine runs the scan itself when no report is injected.
    expect(read(QUARANTINE)).toContain('(options.scan ?? runDriftScan)({ repoRoot })');
  });
});

describe('no client-supplied path can reach the filesystem', () => {
  it('takes an id, never a path', () => {
    for (const route of ROUTES) {
      const source = read(route);

      expect(source).toMatch(/typeof body\.(candidateId|quarantineId) === 'string'/);
      for (const forbidden of [
        'body.path',
        'body.file',
        'body.destination',
        'body.target',
        'body.command',
        'body.contents',
      ]) {
        expect(source, `${forbidden} must not be read`).not.toContain(forbidden);
      }
    }
  });

  it('refuses a traversal dressed as a candidate id', () => {
    for (const nasty of [
      'reachability.unrecordedOrphans:../../../etc/passwd',
      'reachability.unrecordedOrphans:..\\..\\windows\\system32',
      'reachability.unrecordedOrphans:/etc/passwd',
      'reachability.unrecordedOrphans:C:\\Windows\\win.ini',
    ]) {
      const result = quarantineCandidate(nasty, options());

      // It never reaches a containment check: the id is not in the candidate
      // set, which is the first gate.
      expect(result.outcome, nasty).toBe('stale-finding');
    }
  });

  it('refuses a protected path even when a report claims it is an orphan', () => {
    // The second belt: a report that named one of these could only be wrong.
    const bad = fixtureReport({
      reachability: {
        unrecordedOrphans: [
          'package.json',
          '.env.local',
          '_admin-panel/platform/coverage-map/map.ts',
        ],
        deadEnds: [],
      },
    });

    // None of the three protected paths is offered. (The fixture's dead-code
    // test is still a legitimate candidate, which is why this checks for
    // absence rather than an empty list.)
    const offered = quarantineCandidates(bad).map((candidate) => candidate.path);
    expect(offered).not.toContain('package.json');
    expect(offered).not.toContain('.env.local');
    expect(offered).not.toContain('_admin-panel/platform/coverage-map/map.ts');
    for (const protectedPath of [
      'package.json',
      '.env.local',
      '.git/config',
      'prisma/schema.prisma',
      '_admin-panel/platform/coverage-map/map.ts',
      '_admin-panel/platform/.audit/audit-v1.jsonl',
      '_admin-panel/platform/.quarantine/x',
      '_admin-panel/platform/.runs/x.json',
      '_admin-panel/modules/developer/guard.ts',
      'node_modules/thing/index.js',
    ]) {
      expect(isProtectedPath(protectedPath), protectedPath).toBe(true);
    }
    expect(isProtectedPath('lib/orphan.ts')).toBe(false);

    // And the files are still there.
    expect(existsSync(path.join(repo, 'package.json'))).toBe(true);
    expect(readFileSync(path.join(repo, '.env.local'), 'utf8')).toContain('should-never-move');
  });

  it('refuses a symlink that points out of the repository', () => {
    const outside = mkdtempSync(path.join(tmpdir(), 'follio-item19-outside-'));
    roots.push(outside);
    const secret = path.join(outside, 'secret.txt');
    writeFileSync(secret, 'outside the repo\n', 'utf8');

    let linked = true;
    try {
      symlinkSync(secret, path.join(repo, 'lib/link.ts'));
    } catch {
      // Windows without developer mode refuses symlink creation; the
      // containment check is still asserted below through the real engine.
      linked = false;
    }

    if (linked) {
      const report = fixtureReport({
        reachability: { unrecordedOrphans: ['lib/link.ts'], deadEnds: [] },
      });
      const result = quarantineCandidate(
        'reachability.unrecordedOrphans:lib/link.ts',
        options({ report })
      );

      expect(result.outcome).toBe('outside-repository');
      expect(readFileSync(secret, 'utf8')).toContain('outside the repo');
    }

    // The check itself, present whether or not this machine allows symlinks.
    expect(read(QUARANTINE)).toContain('realpathSync');
    expect(read(QUARANTINE)).toContain('points outside the repository');
  });
});

describe('quarantine moves exactly one file', () => {
  it('moves it, preserves the bytes and records where it came from', () => {
    const before = readFileSync(path.join(repo, 'lib/orphan.ts'));
    const others = snapshot();

    const result = quarantineOrphan();

    expect(result.outcome).toBe('quarantined');
    const record = result.record!;
    expect(record.originalPath).toBe('lib/orphan.ts');
    expect(record.state).toBe('quarantined');
    expect(record.sha256).toBe(sha256(before));
    expect(record.bytes).toBe(before.length);
    expect(record.signal).toBe('reachability');
    expect(record.group).toBe('unrecordedOrphans');
    expect(record.actorId).toBe('admin_fixture_1');
    expect(record.approvalRequired).toContain('lib/orphan.ts');

    // The original is gone and the payload is byte-identical.
    expect(existsSync(path.join(repo, 'lib/orphan.ts'))).toBe(false);
    const payload = path.join(repo, '.quarantine', record.id, 'payload', 'lib/orphan.ts');
    expect(existsSync(payload)).toBe(true);
    expect(readFileSync(payload)).toEqual(before);

    // Every other file in the fixture is untouched, byte for byte.
    const after = snapshot();
    delete others['lib/orphan.ts'];
    expect(after).toEqual(others);
  });

  it('keeps the payload inside the quarantine root', () => {
    const record = quarantineOrphan().record!;
    const root = path.resolve(path.join(repo, '.quarantine'));

    expect(path.resolve(path.join(repo, record.payloadPath!))).toContain(path.basename(root));
    const payload = path.join(root, record.id, 'payload', 'lib/orphan.ts');
    expect(path.resolve(payload).startsWith(`${root}${path.sep}`)).toBe(true);
  });

  it('cannot collide, because every record owns a directory', () => {
    const first = quarantineOrphan().record!;
    // The same path again, from a report that still lists it — as if it had
    // been restored and re-quarantined.
    writeFileSync(path.join(repo, 'lib/orphan.ts'), FIXTURE_FILES['lib/orphan.ts'], 'utf8');
    const second = quarantineOrphan().record!;

    expect(second.id).not.toBe(first.id);
    for (const record of [first, second]) {
      expect(
        existsSync(path.join(repo, '.quarantine', record.id, 'payload', 'lib/orphan.ts'))
      ).toBe(true);
    }
    expect(listQuarantine(options())).toHaveLength(2);
  });

  it('writes an audit record', () => {
    const result = quarantineOrphan();
    const [event] = readAuditLog({ root: path.join(repo, '.audit') });

    expect(event.id).toBe(result.auditId);
    expect(event).toMatchObject({
      version: QUARANTINE_FORMAT_VERSION,
      action: 'quarantine',
      result: 'ok',
      path: 'lib/orphan.ts',
      quarantineId: result.record!.id,
      signal: 'reachability',
      group: 'unrecordedOrphans',
      actorId: 'admin_fixture_1',
      approval: null,
      reason: null,
    });
    expect(event.sha256Before).toBe(result.record!.sha256);
    expect(event.evidence.length).toBeGreaterThan(0);
  });

  it('refuses when the candidate has already left the disk', () => {
    rmSync(path.join(repo, 'lib/orphan.ts'));
    const result = quarantineOrphan();

    expect(result.outcome).toBe('missing-file');
  });

  it('leaves the tree coherent when the store cannot be written', () => {
    // The quarantine root is a *file*, so `mkdirSync` under it fails.
    const root = path.join(repo, '.blocked');
    writeFileSync(root, 'not a directory', 'utf8');
    const result = quarantineCandidate(ORPHAN, options({ root }));

    expect(result.outcome).toBe('failed');
    expect(result.detail).toContain('Nothing was changed');
    // The file is still where it was, with its contents.
    expect(readFileSync(path.join(repo, 'lib/orphan.ts'), 'utf8')).toBe(
      FIXTURE_FILES['lib/orphan.ts']
    );
  });
});

describe('deleting needs a quarantine and an approval', () => {
  it('has no path from a finding, only from a record', () => {
    // The signature is the guarantee: a candidate id is not a quarantine id,
    // so a file that was never quarantined cannot be an argument.
    const result = deleteQuarantined(ORPHAN, 'lib/orphan.ts', options());

    expect(result.outcome).toBe('unknown-record');
    expect(existsSync(path.join(repo, 'lib/orphan.ts'))).toBe(true);
  });

  it('refuses with no approval at all', () => {
    const record = quarantineOrphan().record!;
    const result = deleteQuarantined(record.id, '', options());

    expect(result.outcome).toBe('approval-missing');
    expect(existsSync(path.join(repo, '.quarantine', record.id, 'payload', 'lib/orphan.ts'))).toBe(
      true
    );
  });

  it('refuses the wrong approval', () => {
    const record = quarantineOrphan().record!;

    for (const wrong of ['lib/orphan.tsx', 'orphan.ts', 'yes', 'DELETE', ' lib/other.ts ']) {
      const result = deleteQuarantined(record.id, wrong, options());
      expect(result.outcome, wrong).toBe('approval-mismatch');
    }
    expect(existsSync(path.join(repo, '.quarantine', record.id, 'payload', 'lib/orphan.ts'))).toBe(
      true
    );
  });

  it('deletes with the original path, and only that artifact', () => {
    const others = snapshot();
    const record = quarantineOrphan().record!;
    const second = quarantineCandidate('reachability.deadEnds:lib/dead-end.ts', options()).record!;

    const result = deleteQuarantined(record.id, record.originalPath, options());

    expect(result.outcome).toBe('deleted');
    expect(result.record!.state).toBe('deleted');
    expect(result.record!.payloadPath).toBeNull();
    expect(result.record!.deletedAt).toBeTruthy();
    expect(existsSync(path.join(repo, '.quarantine', record.id, 'payload', 'lib/orphan.ts'))).toBe(
      false
    );

    // The other quarantined artifact is untouched, and so is everything else.
    expect(
      existsSync(path.join(repo, '.quarantine', second.id, 'payload', 'lib/dead-end.ts'))
    ).toBe(true);
    const after = snapshot();
    delete others['lib/orphan.ts'];
    delete others['lib/dead-end.ts'];
    expect(after).toEqual(others);
  });

  it('keeps the record and writes a second audit line', () => {
    const record = quarantineOrphan().record!;
    const result = deleteQuarantined(record.id, record.originalPath, options());
    const events = readAuditLog({ root: path.join(repo, '.audit') });

    expect(events.map((event) => `${event.action}:${event.result}`)).toEqual([
      'delete:ok',
      'quarantine:ok',
    ]);
    expect(events[0]).toMatchObject({
      path: 'lib/orphan.ts',
      quarantineId: record.id,
      // A label, never the value the caller typed.
      approval: 'original-path-confirmed',
      sha256After: null,
    });
    expect(events[0].id).toBe(result.auditId);
    // The record survives the artifact, as provenance.
    expect(listQuarantine(options())[0].state).toBe('deleted');
  });

  it('refuses a second deletion', () => {
    const record = quarantineOrphan().record!;
    deleteQuarantined(record.id, record.originalPath, options());
    const again = deleteQuarantined(record.id, record.originalPath, options());

    expect(again.outcome).toBe('already-deleted');
  });

  it('refuses when the quarantined bytes have changed', () => {
    const record = quarantineOrphan().record!;
    const payload = path.join(repo, '.quarantine', record.id, 'payload', 'lib/orphan.ts');
    writeFileSync(payload, 'tampered\n', 'utf8');

    const result = deleteQuarantined(record.id, record.originalPath, options());

    expect(result.outcome).toBe('payload-changed');
    expect(existsSync(payload)).toBe(true);
    expect(readAuditLog({ root: path.join(repo, '.audit') })[0]).toMatchObject({
      action: 'delete',
      result: 'refused',
    });
  });

  it('cascades into nothing', () => {
    const record = quarantineOrphan().record!;
    deleteQuarantined(record.id, record.originalPath, options());

    // The test that covered it, its importer and its directory all survive.
    for (const survivor of ['__tests__/dead.test.ts', 'lib/also-dead.ts', 'lib/live.ts']) {
      expect(existsSync(path.join(repo, survivor)), survivor).toBe(true);
    }
    expect(existsSync(path.join(repo, 'lib'))).toBe(true);
    expect(readFileSync(path.join(repo, '_admin-panel/platform/coverage-map/map.ts'), 'utf8')).toBe(
      FIXTURE_FILES['_admin-panel/platform/coverage-map/map.ts']
    );
  });
});

describe('restoring', () => {
  it('puts the file back byte for byte and audits it', () => {
    const before = readFileSync(path.join(repo, 'lib/orphan.ts'));
    const record = quarantineOrphan().record!;

    const result = restoreQuarantined(record.id, options());

    expect(result.outcome).toBe('restored');
    expect(result.record!.state).toBe('restored');
    expect(readFileSync(path.join(repo, 'lib/orphan.ts'))).toEqual(before);
    expect(readAuditLog({ root: path.join(repo, '.audit') })[0]).toMatchObject({
      action: 'restore',
      result: 'ok',
      path: 'lib/orphan.ts',
    });
  });

  it('refuses to overwrite a file that now occupies the path', () => {
    const record = quarantineOrphan().record!;
    writeFileSync(path.join(repo, 'lib/orphan.ts'), 'something new\n', 'utf8');

    const result = restoreQuarantined(record.id, options());

    expect(result.outcome).toBe('destination-occupied');
    expect(readFileSync(path.join(repo, 'lib/orphan.ts'), 'utf8')).toBe('something new\n');
  });

  it('cannot bring back a deleted artifact', () => {
    const record = quarantineOrphan().record!;
    deleteQuarantined(record.id, record.originalPath, options());

    const result = restoreQuarantined(record.id, options());

    expect(result.outcome).toBe('already-deleted');
    expect(result.detail).toContain('not reversible');
  });
});

describe('the audit trail', () => {
  it('survives a fresh reader and a restart', () => {
    const record = quarantineOrphan().record!;
    deleteQuarantined(record.id, record.originalPath, options());

    // Read straight off the disk with nothing in memory from the writes: the
    // module keeps no state, so any read is a fresh one.
    const file = path.join(repo, '.audit', `audit-v${QUARANTINE_FORMAT_VERSION}.jsonl`);
    const lines = readFileSync(file, 'utf8').trim().split('\n');

    expect(lines).toHaveLength(2);
    expect(lines.map((line) => (JSON.parse(line) as AuditEvent).action)).toEqual([
      'quarantine',
      'delete',
    ]);
    expect(readAuditLog({ root: path.join(repo, '.audit') })).toHaveLength(2);
    expect(read(AUDIT)).not.toMatch(/^(const|let) cache/m);
  });

  it('is append-only: the module can only append', () => {
    const source = read(AUDIT);

    expect(source).toContain('appendFileSync');
    // No overwrite and no removal of the trail, anywhere.
    for (const forbidden of ['writeFileSync', 'rmSync', 'unlink', 'truncate', 'renameSync']) {
      expect(source, `${forbidden} must not appear`).not.toContain(forbidden);
    }
    // And nothing in the client or the routes can edit it: the panel has no
    // setter for the trail and posts to no audit endpoint.
    expect(read(PANEL)).not.toMatch(/setAudit|deleteAudit|\/audit'/);
    for (const route of ROUTES) {
      expect(read(route)).not.toMatch(/appendAuditEvent|readAuditLog|\.audit/);
    }
  });

  it('records no secret, no token and no request body', () => {
    process.env.FOLLIO_ITEM19_CANARY = 'super-secret-canary';
    try {
      const record = quarantineOrphan().record!;
      deleteQuarantined(record.id, record.originalPath, options());
      restoreQuarantined(record.id, options());

      const raw = readFileSync(
        path.join(repo, '.audit', `audit-v${QUARANTINE_FORMAT_VERSION}.jsonl`),
        'utf8'
      );

      expect(raw).not.toContain('super-secret-canary');
      expect(raw).not.toContain('SECRET=');
      expect(raw).not.toMatch(/sk-|Bearer |user_[A-Za-z0-9]{10}|@[a-z]+\.(com|org)/i);
      expect(raw).not.toContain('clerkId');
      expect(raw).not.toContain('email');
      // The one identity it carries is the platform's own admin row id.
      expect(raw).toContain('admin_fixture_1');

      for (const line of raw.trim().split('\n')) {
        expect(Object.keys(JSON.parse(line) as AuditEvent).sort()).toEqual([
          'action',
          'actorId',
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
      }
    } finally {
      delete process.env.FOLLIO_ITEM19_CANARY;
    }
  });

  it('skips a line it cannot read and keeps the rest', () => {
    quarantineOrphan();
    const file = path.join(repo, '.audit', `audit-v${QUARANTINE_FORMAT_VERSION}.jsonl`);
    writeFileSync(file, `${readFileSync(file, 'utf8')}{ not json\n`, 'utf8');
    appendAuditEvent(
      {
        action: 'delete',
        result: 'ok',
        path: 'lib/other.ts',
        quarantineId: null,
        signal: null,
        group: null,
        evidence: [],
        sha256Before: null,
        sha256After: null,
        approval: null,
        actorId: null,
        reason: null,
      },
      { root: path.join(repo, '.audit') }
    );

    expect(readAuditLog({ root: path.join(repo, '.audit') })).toHaveLength(2);
  });

  it('is empty, not broken, before anything has happened', () => {
    expect(readAuditLog({ root: path.join(repo, '.nothing-here') })).toEqual([]);
    expect(listQuarantine(options({ root: path.join(repo, '.nothing-here') }))).toEqual([]);
  });
});

describe('the gates', () => {
  it('refuses every action when the local-only gate is closed', () => {
    const closed = options({ canRun: false });

    expect(quarantineCandidate(ORPHAN, closed).outcome).toBe('gate-closed');
    expect(deleteQuarantined(randomUUID(), 'lib/orphan.ts', closed).outcome).toBe('gate-closed');
    expect(restoreQuarantined(randomUUID(), closed).outcome).toBe('gate-closed');
    expect(existsSync(path.join(repo, 'lib/orphan.ts'))).toBe(true);
  });

  it('requires admin auth and the gate in every route, before anything else', () => {
    for (const route of ROUTES) {
      const source = read(route);
      const handler = source.slice(source.indexOf('export async function POST'));
      const action = handler.match(/(quarantineCandidate|deleteQuarantined|restoreQuarantined)\(/)!;

      expect(source).toMatch(/await requireAdmin\(\)/);
      expect(source).toContain('assertCanRunDeveloperSuites()');
      expect(handler.indexOf('requireAdmin')).toBeLessThan(handler.indexOf(action[1]));
      expect(handler.indexOf('assertCanRunDeveloperSuites')).toBeLessThan(
        handler.indexOf(action[1])
      );
      expect(handler.indexOf('assertCanRunDeveloperSuites')).toBeLessThan(
        handler.indexOf('request.json')
      );
      expect(source).toContain("from '@/_admin-panel/modules/developer/guard'");
      expect(source).toContain('DeveloperSuitesDisabledError');
      expect(source).toContain("runtime = 'nodejs'");
    }
  });

  it('records the admin row id as the actor, and nothing else about them', () => {
    for (const route of ROUTES) {
      const source = read(route);

      expect(source).toContain('actorId: admin.adminId');
      expect(source).not.toContain('admin.email');
      expect(source).not.toContain('admin.clerkId');
    }
  });
});

describe('no shell and no git', () => {
  it('moves and removes with Node, nothing else', () => {
    const source = read(QUARANTINE);

    expect(source).toContain('renameSync');
    expect(source).toContain('rmSync');
    // Matched against imports and calls: the module's own comment says it
    // spawns nothing, which is why the word appears at all.
    expect(source).not.toMatch(/from 'node:child_process'|require\('child_process'\)/);
    for (const forbidden of [
      'execSync',
      'spawnSync',
      'spawn(',
      'exec(',
      'powershell',
      'git clean',
      'git rm',
      'git checkout',
      'rimraf',
    ]) {
      expect(source, `${forbidden} must not appear`).not.toContain(forbidden);
    }
    for (const file of [AUDIT, PANEL, ...ROUTES]) {
      expect(read(file), `${file} must not shell out`).not.toMatch(
        /child_process|execSync|spawnSync|git /
      );
    }
  });

  it('removes one file and never a directory tree', () => {
    const source = read(QUARANTINE);

    // `rmSync` with `recursive` would turn one approved target into many.
    expect(source).toContain('rmSync(payloadInStore, { force: true })');
    expect(source).not.toMatch(/rmSync\([^)]*recursive/);
  });

  it('edits neither the coverage map nor an import', () => {
    const source = read(QUARANTINE);

    expect(source).not.toMatch(/COVERAGE_MAP\s*[.=]|coverage-map\/map/);
    expect(source).not.toMatch(/\bimport\b.*replace|rewriteImports/);
  });
});

describe('the panel', () => {
  function viewOf(extra: Partial<QuarantineView> = {}): QuarantineView {
    return {
      version: QUARANTINE_FORMAT_VERSION,
      quarantineRoot: '_admin-panel/platform/.quarantine',
      auditPath: '_admin-panel/platform/.audit/audit-v1.jsonl',
      canAct: true,
      gateReason: 'Local only.',
      candidates: quarantineCandidates(fixtureReport()),
      records: [],
      audit: [],
      ...extra,
    };
  }

  const held: QuarantineRecord = {
    version: QUARANTINE_FORMAT_VERSION,
    id: '11111111-2222-3333-4444-555555555555',
    originalPath: 'lib/orphan.ts',
    payloadPath: '_admin-panel/platform/.quarantine/11111111/payload/lib/orphan.ts',
    state: 'quarantined',
    sha256: 'a'.repeat(64),
    bytes: 24,
    signal: 'reachability',
    group: 'unrecordedOrphans',
    evidence: ['No shipped entry point reaches this module.'],
    quarantinedAt: '2026-10-11T09:00:00.000Z',
    actorId: 'admin_1',
    approvalRequired: 'To delete this, send its original path back exactly: lib/orphan.ts',
  };

  it('separates the destructive panel from the read-only report', () => {
    // Item 17's signal view and item 18's proposals stay server-rendered; this
    // is the only part of the page that ships JavaScript.
    expect(read(PANEL).startsWith("'use client'")).toBe(true);
    expect(read('_admin-panel/platform/ui/drift-report.tsx')).not.toContain("'use client'");
    expect(read('_admin-panel/platform/ui/drift-report.tsx')).not.toContain('<button');
    expect(read(DRIFT_PAGE)).toContain('quarantinePanel={<DriftQuarantinePanel');
  });

  it('shows the evidence and one quarantine control per candidate', () => {
    const html = renderToStaticMarkup(<DriftQuarantinePanel view={viewOf()} />);
    const text = textOf(html);

    expect(text).toContain('Eligible for quarantine (3)');
    expect(text).toContain('lib/orphan.ts');
    expect(text).toContain('No shipped entry point reaches this module');
    // Buttons, not the word: the panel's own copy explains what Quarantine
    // and Delete mean.
    expect(html.split('>Quarantine</button>').length - 1).toBe(3);
    expect(html).not.toContain('>Delete</button>');
    expect(text).toContain('Two stages, never one');
  });

  it('offers no delete until a review is opened, and then needs the path', () => {
    const html = renderToStaticMarkup(<DriftQuarantinePanel view={viewOf({ records: [held] })} />);
    const text = textOf(html);

    expect(text).toContain('In quarantine (1)');
    expect(text).toContain('To delete this, send its original path back exactly: lib/orphan.ts');
    expect(html).toContain('>Review deletion<');
    expect(html).toContain('>Restore<');
    // The confirmation input and the delete control appear only inside the
    // review, which this static render has not opened.
    expect(html).not.toContain('>Delete</button>');
    expect(html).not.toContain('<input');
  });

  it('says the server is what checks the approval', () => {
    const source = read(PANEL);

    // Asserted on what a person reads, since a comment can be reflowed.
    expect(source).toContain('The server checks this against the stored record');
    expect(source).toContain('the button being enabled');
    // The client's own comparison only gates the control.
    expect(source).toContain('disabled={!matches}');
    expect(source).not.toMatch(/window\.confirm|alert\(/);
  });

  it('renders the audit trail read-only', () => {
    const event: AuditEvent = {
      version: QUARANTINE_FORMAT_VERSION,
      id: 'audit-1',
      at: '2026-10-11T09:05:00.000Z',
      action: 'delete',
      result: 'refused',
      path: 'lib/orphan.ts',
      quarantineId: held.id,
      signal: 'reachability',
      group: 'unrecordedOrphans',
      evidence: [],
      sha256Before: null,
      sha256After: null,
      approval: null,
      actorId: 'admin_1',
      reason: 'approval-mismatch: The approval did not match.',
    };
    const html = renderToStaticMarkup(
      <DriftQuarantinePanel view={viewOf({ records: [held], audit: [event] })} />
    );
    const text = textOf(html);

    expect(text).toContain('Audit trail (1)');
    expect(text).toContain('delete · refused');
    expect(text).toContain('approval-mismatch');
    expect(text).toContain('append-only');
    expect(text).toContain('nothing here can be edited or removed from this page');
  });

  it('renders nothing actionable when the gate is closed', () => {
    const html = renderToStaticMarkup(
      <DriftQuarantinePanel view={viewOf({ canAct: false, records: [held] })} />
    );

    expect(html).not.toContain('<button');
    expect(html).not.toContain('<input');
    expect(textOf(html)).toContain('Retiring code is unavailable here');
    expect(textOf(html)).toContain('Local only.');
  });

  it('posts only ids and the typed approval', () => {
    const source = read(PANEL);

    expect(source).toMatch(/JSON\.stringify\(body\)/);
    expect(source).toContain('{ candidateId: candidate.id }');
    expect(source).toContain('{ quarantineId: record.id, confirmation }');
    expect(source).toContain('{ quarantineId: record.id }');
    // No path, no destination, no code.
    expect(source).not.toMatch(/path:\s*record\.originalPath\s*}/);
    expect(source).not.toMatch(/destination|contents:/);
  });
});

describe('the real repository is read, never written', () => {
  const report = runDriftScan();
  const candidates = quarantineCandidates(report);

  it('offers only proven-unreachable files from the real scan', () => {
    const reachability = report.signals.find((signal) => signal.signal === 'reachability');
    const groups = new Set(candidates.map((candidate) => `${candidate.signal}.${candidate.group}`));

    expect(candidates.length).toBeGreaterThan(0);
    for (const group of groups) expect(ELIGIBLE_GROUPS).toContain(group);

    // Nothing the scan calls reachable is in the list, and nothing protected.
    const callUnused =
      reachability?.signal === 'reachability' ? reachability.unrecordedCallUnused : [];
    for (const candidate of candidates) {
      expect(callUnused, candidate.path).not.toContain(candidate.path);
      expect(isProtectedPath(candidate.path), candidate.path).toBe(false);
      expect(candidate.evidence.length).toBeGreaterThan(0);
    }
  });

  it('builds the page’s view without touching anything', () => {
    const before = statSync(path.join(process.cwd(), '_admin-panel/platform/coverage-map/map.ts'));
    const view = buildQuarantineView({ auditLimit: 5 });
    const after = statSync(path.join(process.cwd(), '_admin-panel/platform/coverage-map/map.ts'));

    expect(view.candidates.length).toBe(candidates.length);
    expect(view.quarantineRoot).toBe('_admin-panel/platform/.quarantine');
    expect(view.auditPath).toBe('_admin-panel/platform/.audit/audit-v1.jsonl');
    expect(after.mtimeMs).toBe(before.mtimeMs);
    // Reading the view creates neither store: nothing destructive has happened.
    expect(existsSync(path.join(process.cwd(), '_admin-panel/platform/.quarantine'))).toBe(false);
  });

  it('keeps both stores out of git', () => {
    const gitignore = read('.gitignore');

    expect(gitignore).toContain('_admin-panel/platform/.quarantine/');
    expect(gitignore).toContain('_admin-panel/platform/.audit/');
  });

  it('leaves item 18 and the old developer surface alone', () => {
    expect(read('_admin-panel/platform/drift/proposals.ts')).not.toMatch(
      /from 'node:|rmSync|renameSync/
    );
    for (const file of [
      'app/admin/(dashboard)/developer/page.tsx',
      '_admin-panel/modules/developer/ui/DevtoolsPanel.tsx',
      '_admin-panel/platform/tests/runner.ts',
    ]) {
      expect(existsSync(path.join(process.cwd(), file)), file).toBe(true);
      expect(read(file), `${file} must not know about quarantine`).not.toMatch(
        /quarantine|deleteQuarantined/i
      );
    }
  });
}, 60_000);
