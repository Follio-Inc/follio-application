/**
 * Drift scan, signal 2: test attribution via the import graph
 * (PLATFORM_TODO item 5).
 *
 * Two layers of assertion:
 * - `extractModuleReferences` against synthetic source, proving each of the five
 *   import forms this repo actually contains is picked up
 * - `scanTestAttribution` against the real tree and against synthetic features,
 *   proving attribution, the drift classes, and determinism
 *
 * Synthetic features matter here: asserting only against the real map would
 * make these tests re-break every time someone edits `unitTests`.
 */

import { describe, expect, it } from 'vitest';

import { COVERAGE_MAP, REACHABILITY } from '@/_admin-panel/platform/coverage-map';
import type { PlatformFeature } from '@/_admin-panel/platform/coverage-map';
import {
  barrelTargets,
  createReferenceReader,
  discoverTestFiles,
  extractModuleReferences,
  resolveModuleFile,
  scanTestAttribution,
  toModuleKey,
} from '@/_admin-panel/platform/scan';

function feature(overrides: Partial<PlatformFeature>): PlatformFeature {
  return {
    id: 'stub',
    name: 'Stub',
    userDescription: 'A stub feature used to exercise attribution in isolation.',
    codeLocations: ['lib/utils.ts'],
    category: 'Builder',
    status: 'shipped',
    unitTests: [],
    pathways: [],
    ...overrides,
  };
}

describe('extractModuleReferences — the five import forms', () => {
  it('picks up a multiline static import', () => {
    const references = extractModuleReferences(
      `import {
         alpha,
         beta,
       } from '@/lib/visibility';`,
      '__tests__/x.test.ts'
    );

    expect(references).toEqual([{ specifier: '@/lib/visibility', kind: 'static-import' }]);
  });

  it('picks up a relative specifier', () => {
    const references = extractModuleReferences(
      `import { merge } from '../services/multi-source-merger.service';`,
      '__tests__/x.test.ts'
    );

    expect(references).toEqual([
      { specifier: '../services/multi-source-merger.service', kind: 'static-import' },
    ]);
  });

  it('picks up a dynamic import', () => {
    const references = extractModuleReferences(
      `it('x', async () => { const m = await import('@/lib/reserved-usernames'); });`,
      '__tests__/x.test.ts'
    );

    expect(references).toEqual([{ specifier: '@/lib/reserved-usernames', kind: 'dynamic-import' }]);
  });

  it('picks up a vi.mock target', () => {
    const references = extractModuleReferences(
      `vi.mock('@/lib/db', () => ({ db: {} }));`,
      '__tests__/x.test.ts'
    );

    expect(references).toEqual([{ specifier: '@/lib/db', kind: 'vi-mock' }]);
  });

  it('picks up a source-text read with a literal path', () => {
    const references = extractModuleReferences(
      `const src = readFileSync(resolve(process.cwd(), 'app/onboarding/build/page.tsx'), 'utf8');`,
      '__tests__/x.test.ts'
    );

    expect(references).toEqual([
      { specifier: 'app/onboarding/build/page.tsx', kind: 'source-text' },
    ]);
  });

  it('picks up an export-from, which is how barrels re-export', () => {
    const references = extractModuleReferences(
      `export { thing } from './resume.service';
       export * from './types';`,
      'services/import/index.ts'
    );

    expect(references).toEqual([
      { specifier: './resume.service', kind: 'export-from' },
      { specifier: './types', kind: 'export-from' },
    ]);
  });

  it('ignores a readFileSync whose path is a variable', () => {
    // The platform's own tests read files they discovered. Labelling those
    // `source-text` would wrongly mark them as asserting on source.
    const references = extractModuleReferences(
      `const src = readFileSync(resolve(process.cwd(), file), 'utf8');`,
      '__tests__/x.test.ts'
    );

    expect(references).toEqual([]);
  });

  it('ignores bare package specifiers', () => {
    const references = extractModuleReferences(
      `import { describe } from 'vitest';
       import ts from 'typescript';`,
      '__tests__/x.test.ts'
    );

    expect(references.map((reference) => reference.specifier)).toEqual(['typescript', 'vitest']);
    // They are found, but resolve to nothing in this repo's graph.
    for (const reference of references) {
      expect(toModuleKey(reference.specifier, '__tests__/x.test.ts')).toBeNull();
    }
  });

  it('returns references deterministically', () => {
    const source = `import { a } from '@/lib/zeta';\nimport { b } from '@/lib/alpha';`;
    expect(extractModuleReferences(source, 'x.ts')).toEqual(
      extractModuleReferences(source, 'x.ts')
    );
  });
});

describe('module resolution', () => {
  it('resolves an alias specifier to a real file', () => {
    expect(toModuleKey('@/lib/visibility', '__tests__/x.test.ts')).toBe('lib/visibility');
    expect(resolveModuleFile('lib/visibility', process.cwd())).toBe('lib/visibility.ts');
  });

  it('resolves a relative specifier against the importing file', () => {
    expect(toModuleKey('../services/multi-source-merger.service', '__tests__/x.test.ts')).toBe(
      'services/multi-source-merger.service'
    );
    expect(resolveModuleFile('services/multi-source-merger.service', process.cwd())).toBe(
      'services/multi-source-merger.service.ts'
    );
  });

  it('resolves a directory specifier through its index file', () => {
    expect(resolveModuleFile('lib/resume-parser', process.cwd())).toBe(
      'lib/resume-parser/index.ts'
    );
  });

  it('returns null for a specifier with nothing on disk', () => {
    expect(resolveModuleFile('lib/does-not-exist', process.cwd())).toBeNull();
  });

  it('follows a barrel one hop to the modules it re-exports', () => {
    const targets = barrelTargets('services/import/index.ts', createReferenceReader());

    expect(targets).toContain('services/import/resume.service.ts');
    expect(targets).toContain('services/import/links.service.ts');
    expect(targets).toEqual([...targets].sort());
  });
});

describe('scanTestAttribution on the real tree', () => {
  const report = scanTestAttribution();

  it('resolves every test file to at least one existing path', () => {
    // Item 5's done condition. The count moved 97 → 99 when items 1 and 4 added
    // their own test files, so this asserts the property, not the number.
    expect(report.summary.total).toBe(discoverTestFiles().length);
    expect(report.summary.unresolvable, 'every test must reach some repo path').toBe(0);

    for (const finding of report.tests) {
      expect(finding.directTargets.length, `${finding.path} resolved nothing`).toBeGreaterThan(0);
      expect(finding.unresolved, `${finding.path} has dangling specifiers`).toEqual([]);
    }
  });

  it('labels exactly the source-text tests', () => {
    const sourceText = report.tests
      .filter((finding) => finding.assertion === 'source-text')
      .map((finding) => finding.path);

    expect(sourceText).toEqual([
      '__tests__/dashboard-follio-card.test.ts',
      '__tests__/landing-page-oauth-visibility.test.ts',
      '__tests__/onboarding-hard-gate.test.ts',
      '__tests__/onboarding-no-review.test.ts',
      '__tests__/onboarding-resume-start-choice.test.ts',
      '__tests__/onboarding-summary-overwrite.test.ts',
    ]);
    expect(report.summary.sourceText).toBe(6);
  });

  it('classifies every test exactly once', () => {
    const buckets = [
      ...report.mapped,
      ...report.unlisted,
      ...report.misattributed,
      ...report.uncategorized,
      ...report.deadCode,
    ];

    expect(buckets).toHaveLength(report.summary.total);
    expect(new Set(buckets.map((finding) => finding.path)).size).toBe(report.summary.total);
  });

  it('counts each class correctly', () => {
    const { summary } = report;
    expect(
      summary.mapped +
        summary.unlisted +
        summary.misattributed +
        summary.uncategorized +
        summary.deadCode
    ).toBe(summary.total);
    expect(summary.mapped).toBe(report.mapped.length);
    expect(summary.misattributed).toBe(report.misattributed.length);
    expect(summary.uncategorized).toBe(report.uncategorized.length);
    expect(summary.deadCode).toBe(report.deadCode.length);
  });

  it('keeps the dead resume-parser cluster off the shipped import feature', () => {
    const deadCode = report.deadCode.map((finding) => finding.path);

    // Every one of these covers lib/resume-parser, which reachability records as
    // an orphan. None may be attributed to a shipped feature.
    expect(deadCode).toContain('__tests__/resume-parser-helpers.test.ts');
    expect(deadCode).toContain('__tests__/extract-profile.test.ts');
    expect(deadCode).toContain('__tests__/feature-scoring-system.test.ts');
    expect(deadCode).toHaveLength(8);

    for (const finding of report.deadCode) {
      expect(finding.inferredFeatures, `${finding.path} must reach no feature`).toEqual([]);
      expect(
        finding.declaredFeatures,
        `${finding.path} must not be listed under any feature`
      ).toEqual([]);
      expect(finding.directTargets.some((target) => target.startsWith('lib/resume-parser/'))).toBe(
        true
      );
    }

    // And the shipped feature does not list any of them.
    const importFeature = COVERAGE_MAP.find((entry) => entry.id === 'resume-import-ai');
    for (const deadTest of deadCode) {
      expect(importFeature?.unitTests).not.toContain(deadTest);
    }
  });

  it('sorts every list by path', () => {
    for (const list of [
      report.tests,
      report.mapped,
      report.unlisted,
      report.misattributed,
      report.uncategorized,
      report.deadCode,
    ]) {
      const paths = list.map((finding) => finding.path);
      expect(paths).toEqual([...paths].sort((a, b) => a.localeCompare(b)));
    }

    const staleKeys = report.stale.map((entry) => `${entry.featureId}:${entry.testPath}`);
    expect(staleKeys).toEqual([...staleKeys].sort());
  });

  it('produces an identical report on a second run', () => {
    expect(scanTestAttribution()).toEqual(report);
  });

  it('reports stale unitTests entries against the real map', () => {
    // The map's `unitTests` are hand-written; this signal exists to find the
    // ones the graph cannot support. Asserting the shape, not the count, so
    // fixing the map does not break the test that found the problem.
    for (const entry of report.stale) {
      expect(['missing-file', 'no-import-link']).toContain(entry.reason);
      expect(COVERAGE_MAP.map((f) => f.id)).toContain(entry.featureId);

      const finding = report.tests.find((test) => test.path === entry.testPath);
      if (entry.reason === 'no-import-link') {
        expect(finding?.inferredFeatures).not.toContain(entry.featureId);
        expect(finding?.declaredFeatures).toContain(entry.featureId);
      }
    }
  });
});

describe('scanTestAttribution on synthetic features', () => {
  const resumeParserTest = '__tests__/resume-parser-helpers.test.ts';
  const visibilityTest = '__tests__/visibility.test.ts';

  it('attributes a test to the feature owning the code it imports', () => {
    const report = scanTestAttribution({
      testFiles: [visibilityTest],
      features: [feature({ id: 'sharing', codeLocations: ['lib/visibility.ts'] })],
    });

    expect(report.tests[0].inferredFeatures).toEqual(['sharing']);
    expect(report.tests[0].directTargets).toContain('lib/visibility.ts');
  });

  it('reports mapped when the map and the graph agree', () => {
    const report = scanTestAttribution({
      testFiles: [visibilityTest],
      features: [
        feature({
          id: 'sharing',
          codeLocations: ['lib/visibility.ts'],
          unitTests: [visibilityTest],
        }),
      ],
    });

    expect(report.tests[0].classification).toBe('mapped');
    expect(report.stale).toEqual([]);
  });

  it('reports unlisted when the graph finds a feature the map omits', () => {
    const report = scanTestAttribution({
      testFiles: [visibilityTest],
      features: [feature({ id: 'sharing', codeLocations: ['lib/visibility.ts'] })],
    });

    expect(report.tests[0].classification).toBe('unlisted');
    expect(report.summary.unlisted).toBe(1);
  });

  it('reports misattributed and a stale reference when the map claims the wrong feature', () => {
    const report = scanTestAttribution({
      testFiles: [visibilityTest],
      features: [
        feature({ id: 'sharing', codeLocations: ['lib/visibility.ts'] }),
        feature({
          id: 'export',
          codeLocations: ['lib/document-download'],
          unitTests: [visibilityTest],
        }),
      ],
    });

    expect(report.tests[0].classification).toBe('misattributed');
    expect(report.tests[0].inferredFeatures).toEqual(['sharing']);
    expect(report.tests[0].declaredFeatures).toEqual(['export']);
    expect(report.stale).toEqual([
      { featureId: 'export', testPath: visibilityTest, reason: 'no-import-link' },
    ]);
  });

  it('reports uncategorized when the graph reaches no feature code', () => {
    const report = scanTestAttribution({
      testFiles: [visibilityTest],
      features: [feature({ id: 'elsewhere', codeLocations: ['lib/document-download'] })],
    });

    expect(report.tests[0].classification).toBe('uncategorized');
    expect(report.summary.uncategorized).toBe(1);
  });

  it('flags a missing-file reference', () => {
    const report = scanTestAttribution({
      testFiles: [visibilityTest],
      features: [
        feature({
          id: 'sharing',
          codeLocations: ['lib/visibility.ts'],
          unitTests: [visibilityTest, '__tests__/gone.test.ts'],
        }),
      ],
    });

    expect(report.stale).toEqual([
      { featureId: 'sharing', testPath: '__tests__/gone.test.ts', reason: 'missing-file' },
    ]);
  });

  it('attributes through a barrel when only the re-exported module is claimed', () => {
    // `app/api/import/links/route.ts` imports the `services/import` barrel,
    // which re-exports `./resume.service`. A feature claiming only the
    // re-exported file must still own that importer — the transitive hop item 5
    // asks for. Any file can be fed in as a scan subject; it need not be a test.
    const report = scanTestAttribution({
      testFiles: ['app/api/import/links/route.ts'],
      features: [feature({ id: 'importer', codeLocations: ['services/import/resume.service.ts'] })],
    });

    expect(report.tests[0].barrelTargets).toContain('services/import/resume.service.ts');
    expect(report.tests[0].inferredFeatures).toEqual(['importer']);
  });

  it('prefers dead-code over uncategorized for orphan-only tests', () => {
    const report = scanTestAttribution({
      testFiles: [resumeParserTest],
      features: [feature({ id: 'unrelated', codeLocations: ['lib/document-download'] })],
      reachability: REACHABILITY,
    });

    expect(report.tests[0].classification).toBe('dead-code');
  });

  it('does not call a test dead when it also reaches live code', () => {
    const report = scanTestAttribution({
      testFiles: [resumeParserTest],
      features: [feature({ id: 'parser-owner', codeLocations: ['lib/resume-parser'] })],
    });

    // Once a feature claims the parser, the test is no longer orphan-only
    // reach — it covers something the map says is owned.
    expect(report.tests[0].classification).not.toBe('dead-code');
    expect(report.tests[0].inferredFeatures).toEqual(['parser-owner']);
  });

  it('is order-independent', () => {
    const forward = scanTestAttribution({
      testFiles: [visibilityTest, resumeParserTest],
      features: [feature({ id: 'sharing', codeLocations: ['lib/visibility.ts'] })],
    });
    const reversed = scanTestAttribution({
      testFiles: [resumeParserTest, visibilityTest],
      features: [feature({ id: 'sharing', codeLocations: ['lib/visibility.ts'] })],
    });

    expect(reversed).toEqual(forward);
  });
});
