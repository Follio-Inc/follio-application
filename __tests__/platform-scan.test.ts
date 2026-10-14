/**
 * Drift scan, signal 1 (PLATFORM_TODO item 4).
 *
 * Two kinds of assertion here, and they serve different purposes:
 * - against the real tree, that nothing is currently unmapped
 * - against injected fake trees, that the classifier reports what it should
 *
 * The fake-tree tests matter most: a scan that reports zero drift is only
 * trustworthy if we have watched it report drift when drift exists.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { COVERAGE_MAP, EXCLUDED } from '@/_admin-panel/platform/coverage-map';
import {
  covers,
  discoverProductSurface,
  formatDriftReport,
  runDriftScan,
  scanProductSurface,
  type DiscoveredSurface,
} from '@/_admin-panel/platform/scan';

/** A minimal fake tree: one claimed page, one excluded route, one orphan route. */
const FAKE_SURFACES: DiscoveredSurface[] = [
  { path: 'app/(dashboard)/builder/page.tsx', kind: 'page' },
  { path: 'app/api/admin/stats/route.ts', kind: 'route' },
  { path: 'app/api/brand-new-thing/route.ts', kind: 'route' },
];

/**
 * Every file of a given name under `app/`, re-derived here.
 *
 * Deliberately a second implementation, the way the item-3 reachability test
 * re-derives `importedBy`: it knows only the framework convention and nothing
 * about which subdirectories exist, so comparing the scanner against it proves
 * discovery follows the convention rather than a list of places to look. Item
 * 8a exists because the scanner used to look for `route.ts` under `app/api`
 * alone and missed three handlers under `app/.well-known/`.
 */
function everyFileNamed(basename: string, root = 'app'): string[] {
  const found: string[] = [];

  const walk = (relativeDir: string): void => {
    for (const entry of readdirSync(path.join(process.cwd(), relativeDir), {
      withFileTypes: true,
    })) {
      const relativePath = `${relativeDir}/${entry.name}`;
      if (entry.isDirectory()) walk(relativePath);
      else if (entry.name === basename) found.push(relativePath);
    }
  };

  walk(root);
  return found.sort();
}

describe('product surface discovery', () => {
  it('finds the real pages and routes', () => {
    const discovered = discoverProductSurface();
    const pages = discovered.filter((surface) => surface.kind === 'page');
    const routes = discovered.filter((surface) => surface.kind === 'route');

    // Guards the walker: without this, a classifier over an empty list would
    // report a clean scan and every other assertion here would be vacuous.
    expect(pages.length).toBeGreaterThan(40);
    expect(routes.length).toBeGreaterThan(95);

    for (const surface of discovered) {
      expect(surface.path).toMatch(surface.kind === 'page' ? /\/page\.tsx$/ : /\/route\.ts$/);
      expect(surface.path, 'paths must be repo-relative POSIX').not.toMatch(/^[./]|\\/);
    }
  });

  it('finds every route handler under app, not only those under app/api', () => {
    const discovered = discoverProductSurface()
      .filter((surface) => surface.kind === 'route')
      .map((surface) => surface.path);

    // The convention is `route.ts` anywhere under `app/`; `app/api` is this
    // codebase's habit, not the framework's rule.
    expect(discovered).toEqual(everyFileNamed('route.ts'));
    expect(discovered.filter((route) => !route.startsWith('app/api/')).length).toBeGreaterThan(0);
    // And the ordinary case still works.
    expect(discovered.filter((route) => route.startsWith('app/api/')).length).toBeGreaterThan(95);
  });

  it('finds the handlers outside app/api that signal 1 used to miss', () => {
    // Named here, not in the scanner: the assertion above is what proves the
    // rule is general, and this one pins the regression item 8a fixed.
    const discovered = discoverProductSurface().map((surface) => surface.path);

    for (const route of [
      'app/.well-known/oauth-authorization-server/route.ts',
      'app/.well-known/oauth-protected-resource/route.ts',
      'app/.well-known/oauth-protected-resource/api/mcp/route.ts',
    ]) {
      expect(discovered, `${route} is a real route handler and must be discovered`).toContain(
        route
      );
    }
  });

  it('finds every page under app, unchanged', () => {
    const discovered = discoverProductSurface()
      .filter((surface) => surface.kind === 'page')
      .map((surface) => surface.path);

    expect(discovered).toEqual(everyFileNamed('page.tsx'));
  });

  it('discovers deterministically', () => {
    expect(discoverProductSurface()).toEqual(discoverProductSurface());
  });
});

describe('covers', () => {
  it('treats a directory as claiming its subtree and nothing else', () => {
    expect(covers('app/me', 'app/me/page.tsx')).toBe(true);
    expect(covers('app/me/page.tsx', 'app/me/page.tsx')).toBe(true);
    // The separator matters: `app/me` must not claim `app/menu`.
    expect(covers('app/me', 'app/menu/page.tsx')).toBe(false);
    expect(covers('app/api/profile', 'app/api/profiles/route.ts')).toBe(false);
  });
});

describe('scanProductSurface on the real tree', () => {
  const report = scanProductSurface();

  it('classifies every discovered page and route exactly once', () => {
    const discovered = discoverProductSurface();
    const classified = [...report.mapped, ...report.excluded, ...report.unmapped];

    expect(classified).toHaveLength(discovered.length);
    expect(new Set(classified.map((finding) => finding.path)).size).toBe(discovered.length);
    expect(classified.map((finding) => finding.path).sort()).toEqual(
      discovered.map((surface) => surface.path).sort()
    );
  });

  it('reports zero unmapped paths', () => {
    expect(
      report.unmapped.map((finding) => finding.path),
      'unmapped paths need a feature codeLocation or an EXCLUDED entry'
    ).toEqual([]);
  });

  it('counts each class correctly', () => {
    expect(report.summary.total).toBe(
      report.summary.mapped + report.summary.excluded + report.summary.unmapped
    );
    expect(report.summary.mapped).toBe(report.mapped.length);
    expect(report.summary.excluded).toBe(report.excluded.length);
    expect(report.summary.unmapped).toBe(report.unmapped.length);
    expect(report.summary.pages + report.summary.routes).toBe(report.summary.total);
  });

  it('traces every classification back to a real map entry', () => {
    const locations = new Set(COVERAGE_MAP.flatMap((feature) => feature.codeLocations));
    const exclusions = new Set(EXCLUDED.map((entry) => entry.path));
    const featureIds = new Set(COVERAGE_MAP.map((feature) => feature.id));

    for (const finding of report.mapped) {
      expect(locations, `${finding.path}: matchedBy is not a codeLocation`).toContain(
        finding.matchedBy
      );
      expect(finding.claimedBy.length).toBeGreaterThan(0);
      for (const id of finding.claimedBy) expect(featureIds).toContain(id);
    }

    for (const finding of report.excluded) {
      expect(exclusions, `${finding.path}: matchedBy is not an EXCLUDED path`).toContain(
        finding.matchedBy
      );
      // An excluded path is not claimed by anything — the two classes are
      // mutually exclusive, not a precedence accident.
      expect(finding.claimedBy).toEqual([]);
    }
  });

  it('keeps excluded paths out of the mapped list', () => {
    const mapped = new Set(report.mapped.map((finding) => finding.path));
    for (const finding of report.excluded) {
      expect(mapped, `${finding.path} is both mapped and excluded`).not.toContain(finding.path);
    }
  });

  it('sorts every list by path', () => {
    for (const list of [report.mapped, report.excluded, report.unmapped]) {
      const paths = list.map((finding) => finding.path);
      expect(paths).toEqual([...paths].sort((a, b) => a.localeCompare(b)));
    }
  });

  // Two full scans, and since item 7 each one parses the product source tree.
  // The default 5s timeout is not enough for that under a loaded worker pool;
  // the assertion is unchanged.
  it('produces an identical report on a second run', () => {
    expect(scanProductSurface()).toEqual(report);
    expect(formatDriftReport(runDriftScan())).toBe(formatDriftReport(runDriftScan()));
  }, 30_000);
});

describe('scanProductSurface on an injected tree', () => {
  it('reports a route that no feature claims and no exclusion covers', () => {
    const report = scanProductSurface({ surfaces: FAKE_SURFACES });

    expect(report.unmapped.map((finding) => finding.path)).toEqual([
      'app/api/brand-new-thing/route.ts',
    ]);
    expect(report.unmapped[0]).toMatchObject({
      kind: 'route',
      classification: 'unmapped',
      claimedBy: [],
    });
    // An unmapped finding has nothing to trace back to.
    expect(report.unmapped[0].matchedBy).toBeUndefined();
  });

  it('splits the injected tree across all three classes with correct counts', () => {
    const report = scanProductSurface({ surfaces: FAKE_SURFACES });

    expect(report.summary).toEqual({
      total: 3,
      mapped: 1,
      excluded: 1,
      unmapped: 1,
      pages: 1,
      routes: 2,
    });
    expect(report.mapped.map((finding) => finding.path)).toEqual([
      'app/(dashboard)/builder/page.tsx',
    ]);
    expect(report.mapped[0].claimedBy).toContain('resume-builder');
    expect(report.excluded.map((finding) => finding.path)).toEqual([
      'app/api/admin/stats/route.ts',
    ]);
    expect(report.excluded[0].matchedBy).toBe('app/api/admin');
  });

  it('puts a route outside app/api through the same three classes', () => {
    // No special case for where a handler sits: ownership comes from the map,
    // the same way it does for `app/api`.
    const report = scanProductSurface({
      surfaces: [
        { path: 'app/.well-known/oauth-authorization-server/route.ts', kind: 'route' },
        { path: 'app/.well-known/something-else/route.ts', kind: 'route' },
        { path: 'app/lab/well-known-ish/route.ts', kind: 'route' },
      ],
    });

    expect(report.mapped.map((finding) => finding.path)).toEqual([
      'app/.well-known/oauth-authorization-server/route.ts',
    ]);
    expect(report.mapped[0].claimedBy).toEqual(['ai-connector-mcp']);
    // A different well-known endpoint is not claimed by proximity.
    expect(report.unmapped.map((finding) => finding.path)).toEqual([
      'app/.well-known/something-else/route.ts',
    ]);
    // And an exclusion still wins where one covers the path.
    expect(report.excluded.map((finding) => finding.path)).toEqual([
      'app/lab/well-known-ish/route.ts',
    ]);
    expect(report.excluded[0].matchedBy).toBe('app/lab');
  });

  it('records every feature that claims a shared path', () => {
    const report = scanProductSurface({
      surfaces: [{ path: 'app/onboarding/import/page.tsx', kind: 'page' }],
    });

    // Overlapping ownership is intentional, so the report must not pick a winner.
    expect(report.mapped[0].claimedBy).toEqual(['onboarding', 'resume-import-ai']);
  });

  it('sorts injected findings by path regardless of input order', () => {
    const forward = scanProductSurface({ surfaces: FAKE_SURFACES });
    const reversed = scanProductSurface({ surfaces: [...FAKE_SURFACES].reverse() });

    expect(reversed).toEqual(forward);
  });

  it('classifies everything as unmapped against an empty map', () => {
    const report = scanProductSurface({
      surfaces: FAKE_SURFACES,
      features: [],
      excluded: [],
    });

    expect(report.summary.unmapped).toBe(3);
    expect(report.summary.mapped).toBe(0);
    expect(report.summary.excluded).toBe(0);
  });
});

// Each of these runs the whole drift scan, which since item 8 parses the
// ~670-file source tree to classify reachability. The first call in a worker
// takes a couple of seconds, so the suite gets room beyond the 5s default; the
// assertions are unchanged.
describe('drift report', { timeout: 30_000 }, () => {
  /**
   * `ok` covers every signal, so it is not a statement about the product
   * surface alone. These assertions stay scoped to this signal; the aggregate
   * is the test-attribution signal's business (see platform-scan-tests).
   */
  it('finds no product-surface drift on the real tree', () => {
    const surface = runDriftScan().signals.find((signal) => signal.signal === 'product-surface');

    expect(surface?.unmapped).toEqual([]);
  });

  it('is not ok when a signal finds drift', () => {
    expect(runDriftScan({ surfaces: FAKE_SURFACES }).ok).toBe(false);
  });

  it('names every unmapped path in the rendered text', () => {
    const text = formatDriftReport(runDriftScan({ surfaces: FAKE_SURFACES }));

    expect(text).toContain('app/api/brand-new-thing/route.ts');
    expect(text).toContain('Drift found');
    expect(text).not.toContain('No drift found');
  });

  it('renders a diffable report with no timestamps or absolute paths', () => {
    const text = formatDriftReport(runDriftScan());

    expect(text).toContain('Signal: product surface vs coverage map');
    expect(text).toContain('unmapped    0');
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(text).not.toContain(process.cwd());
  });

  it('says so plainly when nothing drifts', () => {
    // A synthetic tree with a map that accounts for everything — the only way
    // to assert the clean-report wording now that more than one signal runs.
    const text = formatDriftReport(
      runDriftScan({
        surfaces: [{ path: 'app/api/admin/stats/route.ts', kind: 'route' }],
        testFiles: ['__tests__/visibility.test.ts'],
        features: [],
      })
    );

    expect(text).toContain('No drift found');
  });
});

/**
 * The drift scan gates the build (PLATFORM_TODO item 30).
 *
 * Two halves, and both are needed. The scanner half pins what `ok` means, so
 * that "blocking" cannot quietly widen into failing on gaps. The workflow half
 * pins that CI trusts that verdict — strict mode, no `continue-on-error`, and
 * no shell logic of its own deciding pass from fail.
 *
 * `.github/workflows/ci.yml` is read as text rather than parsed: the only YAML
 * parser installed here is a transitive dependency, and a test that breaks when
 * an unrelated package reshuffles its tree is a test nobody trusts. The file
 * was parsed with that package during development to confirm these readings.
 */
describe('CI gates the build on drift (item 30)', { timeout: 30_000 }, () => {
  const ci = readFileSync(path.join(process.cwd(), '.github/workflows/ci.yml'), 'utf8');

  /**
   * Full-line `#` comments removed.
   *
   * Not cosmetic. The drift job's comment explains the mechanism, so it names
   * `--strict`, `continue-on-error` and the exit code in prose — every string
   * these assertions look for. Without stripping, most of them would pass
   * against the explanation of the setting rather than the setting, which is
   * the trap that let mutations survive in items 27, 28 and 29.
   *
   * Line-based because ci.yml has no trailing inline comments; its only `#` on
   * a line with other content is inside the `"## Developer Platform drift
   * scan"` string, which no assertion here reads.
   */
  const settings = ci
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');

  /** The `drift:` job, up to the next job at the same indentation. */
  function driftJob(source: string): string {
    const start = source.indexOf('\n  drift:\n');
    expect(start, 'ci.yml must still have a drift job').toBeGreaterThan(-1);
    const rest = source.slice(start + 1);
    const end = rest.slice(1).search(/\n {2}[a-z-]+:\n/);
    return end === -1 ? rest : rest.slice(0, end + 1);
  }

  describe('what the scanner calls drift', () => {
    it('is not ok when the map contradicts the repository', () => {
      // An unmapped route is a contradiction, and the fake tree has one.
      expect(runDriftScan({ surfaces: FAKE_SURFACES }).ok).toBe(false);
    });

    it('is ok on the real tree, which has recorded gaps', () => {
      const report = runDriftScan();

      // The guarantee item 30 rests on: this tree carries real gaps — an
      // unclaimed AI stage, an unclaimed Prisma model, dead-code-covering
      // tests, reachable-but-unused exports, and twelve categories with no
      // lab — and still passes. If `ok` ever starts counting them, CI starts
      // failing on product gaps, and the pressure becomes to write a pathway
      // to quiet a number. These counts are read from the report, not fixed
      // here, so the test survives the gaps being closed.
      const signal = (name: string) => report.signals.find((s) => s.signal === name) as never;
      const gaps =
        (signal('ai-stages') as { unclaimed: unknown[] }).unclaimed.length +
        (signal('prisma-models') as { unclaimed: unknown[] }).unclaimed.length +
        (signal('test-attribution') as { deadCode: unknown[] }).deadCode.length;

      expect(
        gaps,
        'this tree should still have gaps for the test to mean anything'
      ).toBeGreaterThan(0);
      expect(report.ok).toBe(true);
    });

    it('never fails on category health', () => {
      // Category health reports product gaps only. It contributes no term to
      // `ok`, which is why a category with no lab cannot block a build.
      const report = runDriftScan();
      const category = report.signals.find((s) => s.signal === 'category-health');

      expect(category).toBeDefined();
      const okExpression = readFileSync(
        path.join(process.cwd(), '_admin-panel/platform/scan/report.ts'),
        'utf8'
      );
      const expression = /\n    ok:\n([\s\S]*?),\n  \};/.exec(okExpression)?.[1] ?? '';
      expect(expression, 'the ok expression should be readable').not.toBe('');
      expect(expression).not.toContain('categoryHealth');
    });

    it('counts only contradiction terms in ok', () => {
      const report = readFileSync(
        path.join(process.cwd(), '_admin-panel/platform/scan/report.ts'),
        'utf8'
      );
      const expression = /\n    ok:\n([\s\S]*?),\n  \};/.exec(report)?.[1] ?? '';
      const terms = expression.match(/\w+\.\w+\.length === 0/g) ?? [];

      // Each term names a contradiction: unmapped surface, a stale or
      // misattributed unitTests entry, the three pathway findings, a stale
      // stage, flag or model, a reachability disagreement, and a missing map
      // reference. Item 17a settled this list; item 30 makes it the gate.
      expect(terms).toEqual([
        'surface.unmapped.length === 0',
        'tests.stale.length === 0',
        'tests.misattributed.length === 0',
        'pathways.stale.length === 0',
        'pathways.missingSpec.length === 0',
        'pathways.orphanSpecs.length === 0',
        'aiStages.stale.length === 0',
        'flags.stale.length === 0',
        'prismaModels.stale.length === 0',
        'reachability.disagreements.length === 0',
        'mapReferences.missing.length === 0',
      ]);
      // No gap field sneaks in.
      expect(expression).not.toMatch(/unclaimed|unused|deadCode|partiallyGated|orphans\b/);
    });
  });

  describe('the CLI exit contract CI depends on', () => {
    const cli = readFileSync(
      path.join(process.cwd(), '_admin-panel/platform/scan/cli.ts'),
      'utf8'
    ).replace(/\/\*[\s\S]*?\*\//g, '');

    it('exits 1 under --strict only when the report is not ok', () => {
      expect(cli).toContain("const strict = process.argv.includes('--strict')");
      expect(cli).toContain('process.exitCode = !report.ok && strict ? 1 : 0');
    });

    it('still exits 0 without the flag, so nothing else that calls it changes', () => {
      // The default is item 4's and stays item 4's: the Drift page, the watch
      // job and a local run all call the scanner without `--strict`.
      const match = /process\.exitCode = (.*);/.exec(cli)?.[1];
      expect(match).toBe('!report.ok && strict ? 1 : 0');
    });
  });

  describe('the workflow', () => {
    const job = driftJob(settings);

    it('still has all five jobs, and changed only the drift one', () => {
      for (const name of ['  lint:', '  test:', '  build:', '  security:', '  drift:']) {
        expect(ci, `${name} must still exist`).toContain(name);
      }
      // `needs:` would change when the gate runs, which item 30 does not ask
      // for. The drift job still runs beside the others.
      expect(job).not.toContain('needs:');
    });

    it('does not let the drift job swallow its own result', () => {
      expect(job).not.toContain('continue-on-error');
      // And no job anywhere in the file is advisory as a whole.
      expect(settings.match(/^ {4}continue-on-error: true$/gm)).toBeNull();
    });

    it('leaves the two pre-existing step-level advisory markers alone', () => {
      // The coverage upload and `npm audit`. Both are steps, both predate the
      // Developer Platform, and item 30 has no business touching either.
      expect(settings.match(/^ {8}continue-on-error: true$/gm)).toHaveLength(2);
      expect(ci).toMatch(/uses: codecov\/codecov-action@v4[\s\S]*?continue-on-error: true/);
      expect(ci).toMatch(/npm audit --audit-level=high\n\s+continue-on-error: true/);
    });

    it('runs the scan in strict mode', () => {
      expect(job).toContain('npm run platform:scan -- --strict');
    });

    it("runs one scanner, and the repository's own", () => {
      expect(job.match(/platform:scan/g)).toHaveLength(1);
      expect(job).not.toMatch(/tsx .*scan|runDriftScan|curl|wget/);
    });

    it('lets the exit code decide, and reads no report text to reach a verdict', () => {
      // The whole point of the item. The old advisory job grepped for
      // `^No drift found` to pick its wording; a blocking job that decided
      // pass from fail that way would be a second, weaker definition of drift
      // living in shell.
      expect(job).not.toContain('grep');
      expect(job).not.toMatch(/set \+e/);
      expect(job).not.toMatch(/\$\?/);
      expect(job).not.toMatch(/exit "?\$/);
      // The summary's wording comes from GitHub's record of the exit code.
      expect(job).toContain('SCAN_OUTCOME: ${{ steps.scan.outcome }}');
      expect(job).toContain('id: scan');
    });

    it('still publishes the report, whatever the outcome', () => {
      expect(job).toContain('$GITHUB_STEP_SUMMARY');
      expect(job).toContain('if: always()');
      expect(job).toContain('<details><summary>Full report</summary>');
      // Written whether the scan passed, found drift or failed to run.
      expect(job).toContain('[ "$SCAN_OUTCOME" = \'success\' ]');
    });

    it('keeps least privilege: no write scope, no token, no secret', () => {
      expect(job).not.toMatch(/contents: write|packages: write|issues: write/);
      expect(job).not.toMatch(/pull-requests:|id-token:|secrets\./);
      expect(job).not.toMatch(/GITHUB_TOKEN|gh (pr|issue)/);
      // The file still declares no `permissions:` block anywhere, as before.
      expect(settings).not.toContain('permissions:');
    });

    it('needs no generated Prisma client', () => {
      // Unchanged from item 9: a Prisma problem must not look like drift.
      expect(job).not.toContain('prisma generate');
    });

    it('leaves the scheduled watch workflow advisory', () => {
      // Item 26's job stays non-blocking and still runs no scan of its own.
      const watch = readFileSync(
        path.join(process.cwd(), '.github/workflows/platform-watch.yml'),
        'utf8'
      );

      expect(watch).toMatch(/^\s{4}continue-on-error: true$/m);
      expect(watch).not.toContain('platform:scan');
    });

    it('adds no script and changes none', () => {
      const pkg = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
        scripts: Record<string, string>;
      };

      // Strict mode is passed at the call site, not baked into a new script:
      // one script, one scanner, and the default stays item 4's.
      expect(pkg.scripts['platform:scan']).toBe('npx tsx _admin-panel/platform/scan/cli.ts');
      expect(Object.keys(pkg.scripts).filter((k) => k.includes('scan'))).toEqual(['platform:scan']);
    });
  });
});
