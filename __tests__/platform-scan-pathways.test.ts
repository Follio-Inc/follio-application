/**
 * Drift scan, signal 3: Live QA pathways vs the coverage map
 * (PLATFORM_TODO item 6).
 *
 * Inventory only — nothing here launches Playwright. The real catalog is
 * asserted against disk, and the drift classes are exercised with synthetic
 * catalogs so the tests do not re-break whenever a pathway is added.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { LIVE_QA_PATHWAYS } from '@/_admin-panel/modules/developer/live-qa/catalog';
import type { LiveQaPathway } from '@/_admin-panel/modules/developer/live-qa/types';
import { COVERAGE_MAP } from '@/_admin-panel/platform/coverage-map';
import type { PlatformFeature } from '@/_admin-panel/platform/coverage-map';
import {
  discoverPathwaySpecs,
  runDriftScan,
  scanLiveQaPathways,
  scanProductSurface,
  scanTestAttribution,
  specPathFor,
} from '@/_admin-panel/platform/scan';

function feature(overrides: Partial<PlatformFeature>): PlatformFeature {
  return {
    id: 'stub',
    name: 'Stub',
    userDescription: 'A stub feature used to exercise pathway attribution in isolation.',
    codeLocations: ['lib/utils.ts'],
    category: 'Builder',
    status: 'shipped',
    unitTests: [],
    pathways: [],
    ...overrides,
  };
}

function pathway(overrides: Partial<LiveQaPathway>): LiveQaPathway {
  return {
    id: 'stub.pathway',
    title: 'Stub pathway',
    description: 'A stub pathway.',
    area: 'Public',
    spec: 'pathways/public-landing.spec.ts',
    requiresAuth: false,
    fixtureKind: 'none',
    stability: 'stable',
    intents: ['Open `/`'],
    tags: ['smoke'],
    ...overrides,
  };
}

describe('pathway spec discovery', () => {
  it('finds every spec file under pathways/, excluding helpers', () => {
    const specs = discoverPathwaySpecs();

    expect(specs.length).toBeGreaterThanOrEqual(LIVE_QA_PATHWAYS.length);
    for (const spec of specs) {
      expect(spec).toMatch(/\.spec\.ts$/);
      expect(spec).not.toMatch(/helpers\.ts$/);
      expect(existsSync(path.join(process.cwd(), spec))).toBe(true);
    }
    expect(specs).toEqual([...specs].sort());
  });

  it('discovers deterministically', () => {
    expect(discoverPathwaySpecs()).toEqual(discoverPathwaySpecs());
  });

  it('resolves a catalog spec to a repo-relative path', () => {
    expect(specPathFor('pathways/public-landing.spec.ts')).toBe(
      '_admin-panel/modules/developer/live-qa/pathways/public-landing.spec.ts'
    );
  });
});

describe('scanLiveQaPathways on the real catalog', () => {
  const report = scanLiveQaPathways();

  it('discovers every catalog pathway', () => {
    expect(report.summary.total).toBe(LIVE_QA_PATHWAYS.length);
    expect(report.pathways.map((finding) => finding.id).sort()).toEqual(
      LIVE_QA_PATHWAYS.map((entry) => entry.id).sort()
    );
  });

  it('resolves every pathway spec to a file on disk', () => {
    // Item 6's done condition: all pathways resolve.
    expect(report.summary.missingSpec).toBe(0);
    for (const finding of report.pathways) {
      expect(finding.specPath, `${finding.id} has no spec on disk`).not.toBeNull();
      expect(existsSync(path.join(process.cwd(), finding.specPath!))).toBe(true);
    }
  });

  it('reports no orphan specs and no stale references', () => {
    expect(report.orphanSpecs).toEqual([]);
    expect(report.stale).toEqual([]);
  });

  it('resolves mapped pathway ids to the features that claim them', () => {
    const featureIds = new Set(COVERAGE_MAP.map((entry) => entry.id));

    for (const finding of report.mapped) {
      expect(finding.claimedBy.length).toBeGreaterThan(0);
      for (const id of finding.claimedBy) {
        expect(featureIds).toContain(id);
        // The claim must actually be in that feature's pathways list.
        expect(COVERAGE_MAP.find((entry) => entry.id === id)?.pathways).toContain(finding.id);
      }
    }
  });

  it('classifies every pathway exactly once', () => {
    const buckets = [...report.mapped, ...report.unmapped];

    expect(buckets).toHaveLength(report.summary.total);
    expect(new Set(buckets.map((finding) => finding.id)).size).toBe(report.summary.total);
    expect(report.summary.mapped + report.summary.unmapped).toBe(report.summary.total);
  });

  it('names every feature with no pathway', () => {
    // Item 6's done condition. These are recorded gaps, not drift.
    const expected = COVERAGE_MAP.filter((entry) => entry.pathways.length === 0)
      .map((entry) => entry.id)
      .sort();

    expect(report.featuresWithoutPathway).toEqual(expected);
    expect(report.summary.featuresWithoutPathway).toBe(expected.length);
    expect(report.summary.featuresWithPathway + report.summary.featuresWithoutPathway).toBe(
      COVERAGE_MAP.length
    );
  });

  it('sorts every list', () => {
    expect(report.pathways.map((f) => f.id)).toEqual(
      [...report.pathways.map((f) => f.id)].sort((a, b) => a.localeCompare(b))
    );
    expect(report.featuresWithoutPathway).toEqual([...report.featuresWithoutPathway].sort());
    expect(report.orphanSpecs).toEqual([...report.orphanSpecs].sort());
  });

  it('produces an identical report on a second run', () => {
    expect(scanLiveQaPathways()).toEqual(report);
  });
});

describe('scanLiveQaPathways on synthetic catalogs', () => {
  it('reports a catalogued pathway no feature claims', () => {
    const report = scanLiveQaPathways({
      pathways: [pathway({ id: 'a.one' }), pathway({ id: 'b.two' })],
      features: [feature({ id: 'owner', pathways: ['a.one'] })],
      specFiles: [],
    });

    expect(report.unmapped.map((finding) => finding.id)).toEqual(['b.two']);
    expect(report.mapped.map((finding) => finding.id)).toEqual(['a.one']);
    expect(report.mapped[0].claimedBy).toEqual(['owner']);
    expect(report.summary).toMatchObject({ total: 2, mapped: 1, unmapped: 1 });
  });

  it('reports a stale coverage-map pathway reference', () => {
    const report = scanLiveQaPathways({
      pathways: [pathway({ id: 'a.one' })],
      features: [feature({ id: 'owner', pathways: ['a.one', 'gone.missing'] })],
      specFiles: [],
    });

    expect(report.stale).toEqual([
      { featureId: 'owner', pathwayId: 'gone.missing', reason: 'unknown-pathway' },
    ]);
  });

  it('reports a catalog entry whose spec file is absent', () => {
    const report = scanLiveQaPathways({
      pathways: [pathway({ id: 'a.one', spec: 'pathways/not-a-real-spec.spec.ts' })],
      features: [feature({ id: 'owner', pathways: ['a.one'] })],
      specFiles: [],
    });

    expect(report.missingSpec.map((finding) => finding.id)).toEqual(['a.one']);
    expect(report.missingSpec[0].specPath).toBeNull();
    expect(report.summary.missingSpec).toBe(1);
  });

  it('reports a spec file the catalog never mentions', () => {
    const report = scanLiveQaPathways({
      pathways: [pathway({ id: 'a.one', spec: 'pathways/public-landing.spec.ts' })],
      features: [feature({ id: 'owner', pathways: ['a.one'] })],
      specFiles: [
        '_admin-panel/modules/developer/live-qa/pathways/public-landing.spec.ts',
        '_admin-panel/modules/developer/live-qa/pathways/stray.spec.ts',
      ],
    });

    expect(report.orphanSpecs).toEqual([
      '_admin-panel/modules/developer/live-qa/pathways/stray.spec.ts',
    ]);
    expect(report.summary.orphanSpecs).toBe(1);
  });

  it('records every feature claiming a shared pathway, deterministically', () => {
    const features = [
      feature({ id: 'zulu', pathways: ['a.one'] }),
      feature({ id: 'alpha', pathways: ['a.one'] }),
    ];

    const forward = scanLiveQaPathways({
      pathways: [pathway({ id: 'a.one' })],
      features,
      specFiles: [],
    });
    const reversed = scanLiveQaPathways({
      pathways: [pathway({ id: 'a.one' })],
      features: [...features].reverse(),
      specFiles: [],
    });

    // Shared ownership is allowed and must not pick a winner, and the order of
    // `claimedBy` must not depend on feature order in the map.
    expect(forward.mapped[0].claimedBy).toEqual(['alpha', 'zulu']);
    expect(reversed.mapped[0].claimedBy).toEqual(['alpha', 'zulu']);
    expect(reversed.summary).toEqual(forward.summary);
  });

  it('is order-independent across the catalog', () => {
    const pathways = [pathway({ id: 'b.two' }), pathway({ id: 'a.one' })];
    const features = [feature({ id: 'owner', pathways: ['a.one'] })];

    const forward = scanLiveQaPathways({ pathways, features, specFiles: [] });
    const reversed = scanLiveQaPathways({
      pathways: [...pathways].reverse(),
      features,
      specFiles: [],
    });

    expect(reversed).toEqual(forward);
  });

  it('names features with no pathway even when the catalog is empty', () => {
    const report = scanLiveQaPathways({
      pathways: [],
      features: [feature({ id: 'zulu' }), feature({ id: 'alpha' })],
      specFiles: [],
    });

    expect(report.featuresWithoutPathway).toEqual(['alpha', 'zulu']);
    expect(report.summary).toMatchObject({ total: 0, featuresWithPathway: 0 });
  });
});

// Each of these runs the whole drift scan, which since item 8 parses the
// ~670-file source tree to classify reachability. The first call in a worker
// takes a couple of seconds, so the suite gets room beyond the 5s default; the
// assertions are unchanged.
describe('drift report integration', { timeout: 30_000 }, () => {
  it('carries the pathway signal alongside the existing two', () => {
    const report = runDriftScan();

    // The first three in order; item 7 appended its own signals after them,
    // which is the point of the discriminated union.
    expect(report.signals.slice(0, 3).map((signal) => signal.signal)).toEqual([
      'product-surface',
      'test-attribution',
      'live-qa-pathways',
    ]);
  });

  it('leaves the surface and test-attribution signals unchanged', () => {
    const report = runDriftScan();
    const surface = report.signals.find((signal) => signal.signal === 'product-surface');
    const tests = report.signals.find((signal) => signal.signal === 'test-attribution');

    // Adding a signal must not perturb the two already landed.
    expect(surface).toEqual(scanProductSurface());
    expect(tests).toEqual(scanTestAttribution());
  });
});

/**
 * Whether a pathway contradiction fails the scan (PLATFORM_TODO item 17a).
 *
 * Every other signal is given nothing to complain about, so `report.ok` can
 * only be answering the question this block asks. The previous two tests here
 * did not do that: they overrode `pathways` and left the real coverage map in
 * place, so the real features' nine pathway claims became stale against a
 * one-entry synthetic catalog, and `ok` was decided by something other than the
 * case under test. One of them passed for that reason while
 * `pathways.stale`, `pathways.missingSpec` and `pathways.orphanSpecs` were
 * missing from the `ok` expression altogether — which is the bug item 17a
 * fixed.
 */
describe('pathway contradictions and the overall verdict', { timeout: 30_000 }, () => {
  /** Every signal but this one, given nothing to report. */
  const NEUTRAL: NonNullable<Parameters<typeof runDriftScan>[0]> = {
    surfaces: [],
    testFiles: [],
    features: [],
    excluded: [],
    sources: {},
    files: [],
    records: [],
  };

  const scan = (options: Parameters<typeof runDriftScan>[0]) =>
    runDriftScan({ ...NEUTRAL, ...options });

  const pathwaySignal = (report: ReturnType<typeof runDriftScan>) => {
    const signal = report.signals.find((entry) => entry.signal === 'live-qa-pathways');
    if (signal?.signal !== 'live-qa-pathways') throw new Error('no pathway signal in the report');
    return signal;
  };

  /**
   * The lists that decide `report.ok`, by signal.
   *
   * Written out so each test can say not only that the verdict flipped but
   * which finding flipped it — the thing the old test could not distinguish.
   * The inventory lists beside them (`stages`, `references`, `pathways`) are
   * full catalogues and are populated in any scan, neutral or not.
   */
  const CONTRADICTION_FIELDS: Record<string, string[]> = {
    'product-surface': ['unmapped'],
    'test-attribution': ['stale', 'misattributed'],
    'live-qa-pathways': ['stale', 'missingSpec', 'orphanSpecs'],
    'ai-stages': ['stale'],
    'feature-flags': ['stale'],
    'prisma-models': ['stale'],
    reachability: ['disagreements'],
    'map-references': ['missing'],
    'category-health': [],
  };

  /** Every populated contradiction list in a report, as `signal.field: count`. */
  const contradictionsIn = (report: ReturnType<typeof runDriftScan>) => {
    const found: Record<string, number> = {};

    for (const signal of report.signals) {
      for (const field of CONTRADICTION_FIELDS[signal.signal] ?? []) {
        const list = (signal as unknown as Record<string, unknown>)[field];
        if (Array.isArray(list) && list.length > 0) {
          found[`${signal.signal}.${field}`] = list.length;
        }
      }
    }

    return found;
  };

  /** The spec every synthetic catalog entry points at, which is really there. */
  const REAL_SPEC = specPathFor(pathway({}).spec);

  it('is really the only signal with anything to say', () => {
    // The isolation itself, asserted — so a later change that breaks it fails
    // here rather than making every test below pass for the wrong reason.
    const report = scan({ pathways: [], specFiles: [] });

    expect(contradictionsIn(report)).toEqual({});
    expect(report.ok).toBe(true);
    // All nine signals really did run; they simply have nothing to report.
    expect(report.signals).toHaveLength(Object.keys(CONTRADICTION_FIELDS).length);
  });

  it('stays healthy when the pathway signal is clean', () => {
    const report = scan({
      pathways: [pathway({ id: 'zebra.one' })],
      specFiles: [REAL_SPEC],
      features: [feature({ id: 'owner', pathways: ['zebra.one'] })],
    });
    const signal = pathwaySignal(report);

    expect(signal.summary).toMatchObject({ total: 1, mapped: 1, missingSpec: 0, orphanSpecs: 0 });
    expect(contradictionsIn(report)).toEqual({});
    expect(report.ok).toBe(true);
  });

  it('fails the scan for a stale pathway reference, and for that reason', () => {
    const report = scan({
      pathways: [],
      specFiles: [],
      features: [feature({ id: 'owner', pathways: ['gone.missing'] })],
    });
    const signal = pathwaySignal(report);

    // The finding is still reported in its own field, unchanged.
    expect(signal.stale).toEqual([
      { featureId: 'owner', pathwayId: 'gone.missing', reason: 'unknown-pathway' },
    ]);
    // Nothing else in the whole report is complaining, so the verdict can only
    // be answering for this one list.
    expect(contradictionsIn(report)).toEqual({ 'live-qa-pathways.stale': 1 });
    expect(report.ok).toBe(false);
  });

  it('fails the scan for a catalogued pathway with no spec file, and for that reason', () => {
    const report = scan({
      pathways: [pathway({ id: 'zebra.one', spec: 'pathways/not-on-disk.spec.ts' })],
      specFiles: [],
    });
    const signal = pathwaySignal(report);

    expect(signal.missingSpec.map((finding) => finding.id)).toEqual(['zebra.one']);
    expect(signal.missingSpec[0].specPath).toBeNull();
    expect(contradictionsIn(report)).toEqual({ 'live-qa-pathways.missingSpec': 1 });
    expect(report.ok).toBe(false);
  });

  it('fails the scan for a spec file the catalog does not name, and for that reason', () => {
    const stray = `${path.posix.dirname(REAL_SPEC)}/stray.spec.ts`;
    const report = scan({ pathways: [], specFiles: [stray] });
    const signal = pathwaySignal(report);

    expect(signal.orphanSpecs).toEqual([stray]);
    expect(contradictionsIn(report)).toEqual({ 'live-qa-pathways.orphanSpecs': 1 });
    expect(report.ok).toBe(false);
  });

  it('stays healthy for a catalogued pathway nobody claims', () => {
    const report = scan({ pathways: [pathway({ id: 'zebra.one' })], specFiles: [REAL_SPEC] });
    const signal = pathwaySignal(report);

    // A gap: the pathway runs, and no feature has written down that it owns it.
    expect(signal.unmapped.map((finding) => finding.id)).toEqual(['zebra.one']);
    expect(contradictionsIn(report)).toEqual({});
    expect(report.ok).toBe(true);
  });

  it('stays healthy for features with no pathway at all', () => {
    const report = scan({
      pathways: [],
      specFiles: [],
      features: [feature({ id: 'one' }), feature({ id: 'two' })],
    });
    const signal = pathwaySignal(report);

    expect(signal.featuresWithoutPathway).toEqual(['one', 'two']);
    expect(signal.summary.featuresWithoutPathway).toBe(2);
    expect(contradictionsIn(report)).toEqual({});
    expect(report.ok).toBe(true);
  });

  it('fails once for each contradiction, and not for the gaps beside them', () => {
    const stray = `${path.posix.dirname(REAL_SPEC)}/stray.spec.ts`;
    const report = scan({
      pathways: [pathway({ id: 'zebra.one', spec: 'pathways/not-on-disk.spec.ts' })],
      specFiles: [stray],
      features: [feature({ id: 'owner', pathways: ['gone.missing'] })],
    });
    const signal = pathwaySignal(report);

    expect(contradictionsIn(report)).toEqual({
      'live-qa-pathways.stale': 1,
      'live-qa-pathways.missingSpec': 1,
      'live-qa-pathways.orphanSpecs': 1,
    });
    // The gap beside them is still reported, and still not a contradiction.
    expect(signal.unmapped).toHaveLength(1);
    expect(report.ok).toBe(false);
  });

  // The `ok` expression is not read as text here. Each contradiction above
  // proves its own term decides the verdict — remove one from the expression
  // and that test fails — which is better evidence than a string match, and it
  // keeps this file asserting on behaviour rather than on source. The literal
  // expression is cross-checked once, in `platform-drift-page.test.tsx`, where
  // the Drift page's severities are pinned to it.

  it('leaves the real repository scanning clean', () => {
    const report = runDriftScan();
    const signal = pathwaySignal(report);

    expect(signal.stale).toEqual([]);
    expect(signal.missingSpec).toEqual([]);
    expect(signal.orphanSpecs).toEqual([]);
    expect(contradictionsIn(report)).toEqual({});
    expect(report.ok).toBe(true);
  });
});
