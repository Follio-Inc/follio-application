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

describe('drift report integration', () => {
  it('carries the pathway signal alongside the existing two', () => {
    const report = runDriftScan();

    expect(report.signals.map((signal) => signal.signal)).toEqual([
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

  it('does not fail the scan for unmapped pathways or features without one', () => {
    const report = runDriftScan({
      pathways: [pathway({ id: 'nobody.claims-me' })],
      specFiles: [],
    });
    const signal = report.signals.find((entry) => entry.signal === 'live-qa-pathways');

    expect(signal?.signal === 'live-qa-pathways' && signal.unmapped.length).toBe(1);
    // Gaps are reported, not treated as drift.
    expect(report.ok).toBe(true);
  });

  it('fails the scan for a stale pathway reference', () => {
    const report = runDriftScan({
      features: [feature({ id: 'owner', pathways: ['gone.missing'] })],
      specFiles: [],
    });

    expect(report.ok).toBe(false);
  });
});
