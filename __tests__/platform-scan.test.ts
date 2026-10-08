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
