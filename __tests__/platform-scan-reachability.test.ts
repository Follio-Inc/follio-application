/**
 * Drift scan, signals 7–9: reachability classes, map references and category
 * health (PLATFORM_TODO item 8).
 *
 * Item 8's done condition is "run against the current tree with **nothing
 * hardcoded**", so the classification is proved twice. Once against the real
 * repository, where the three near-identically named services must land in
 * three different classes and the `lib/resume-parser/` dead end must be
 * rediscovered. And once against a synthetic repository built out of invented
 * module names with the same shape — a barrel that re-exports two modules of
 * which only one is asked for, and a pair of modules that import each other
 * into a dead end. A scanner carrying the real answers would get the synthetic
 * one wrong.
 *
 * The three classes are also kept apart deliberately: collapsing them is the
 * failure mode item 19 would act on by quarantining live code.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  COVERAGE_MAP,
  EXCLUDED,
  FEATURE_CATEGORIES,
  REACHABILITY,
} from '@/_admin-panel/platform/coverage-map';
import type {
  FeatureCategory,
  PlatformFeature,
  ReachabilityRecord,
} from '@/_admin-panel/platform/coverage-map';
import {
  analyzeModuleSource,
  buildModuleGraph,
  discoverEntryPoints,
  entryPointsAmong,
  importersOf,
  modulesUnder,
  moveCandidatesFor,
  runDriftScan,
  scanAiStages,
  scanCategoryHealth,
  scanFeatureFlags,
  scanLiveQaPathways,
  scanMapReferences,
  scanPrismaModels,
  scanProductSurface,
  scanReachability,
  scanTestAttribution,
} from '@/_admin-panel/platform/scan';

/**
 * The three paths item 8 names, and the class each must come out as.
 *
 * Written here because the done condition is written here. The scanner itself
 * contains no module name — the synthetic-repository tests below are what prove
 * that, since a scanner holding these answers could not classify `lib/lion.ts`.
 */
const REQUIRED_CLASSES = {
  'services/import/resume-openresume.service.ts': 'orphan',
  'services/import/resume.service.ts': 'module-reachable-call-unused',
  'services/resume-parser.service.ts': 'live',
} as const;

function feature(overrides: Partial<PlatformFeature>): PlatformFeature {
  return {
    id: 'stub',
    name: 'Stub',
    userDescription: 'A stub feature used to exercise item-8 attribution in isolation.',
    codeLocations: ['lib/utils.ts'],
    category: 'Builder',
    status: 'shipped',
    unitTests: [],
    pathways: [],
    ...overrides,
  };
}

function record(overrides: Partial<ReachabilityRecord>): ReachabilityRecord {
  return {
    path: 'services/resume-parser.service.ts',
    reachability: 'live',
    importedBy: [],
    entryChain: [],
    evidence: 'A stub record long enough to pass the coverage-map evidence check in item 3.',
    ...overrides,
  };
}

/**
 * A whole repository in six modules, none of whose names appear in the tree.
 *
 * Deliberately the same shape as the real thing: `zebra-barrel` re-exports two
 * modules and the page asks for one of them, so the other is reachable with
 * nothing using it; `okapi` imports `gnu` and nothing imports `okapi`, so both
 * are dead but only one of them is unimported.
 */
const SYNTHETIC_SOURCES: Record<string, string> = {
  'app/zebra/page.tsx': [
    "import { giraffe } from '@/lib/zebra-barrel';",
    "import type { Stripe } from '@/lib/zebra-types';",
    'export default function Page() {',
    '  const stripe: Stripe = giraffe();',
    '  return stripe;',
    '}',
  ].join('\n'),
  'lib/zebra-barrel.ts': [
    "export { giraffe } from './giraffe';",
    "export { lion } from './lion';",
  ].join('\n'),
  'lib/giraffe.ts': "export function giraffe() { return 'giraffe'; }",
  'lib/lion.ts': "export function lion() { return 'lion'; }",
  'lib/zebra-types.ts': 'export type Stripe = string;',
  'lib/okapi.ts': [
    "import { gnu } from './gnu';",
    'export function okapi() { return gnu(); }',
  ].join('\n'),
  'lib/gnu.ts': "export function gnu() { return 'gnu'; }",
};

const syntheticGraph = () =>
  buildModuleGraph({
    files: Object.keys(SYNTHETIC_SOURCES),
    sources: SYNTHETIC_SOURCES,
  });

describe('module analysis', () => {
  it('separates what a module uses from what it only passes on', () => {
    const analysis = analyzeModuleSource(
      [
        "import defaultExport, { used, renamed as local } from './a';",
        "import * as everything from './b';",
        "import './c';",
        "import type { OnlyAType } from './d';",
        "export { passedOn } from './e';",
        "export * from './f';",
        'export const own = 1;',
        'export function alsoOwn() {}',
        'export default own;',
      ].join('\n'),
      'lib/example.ts'
    );

    expect(analysis.ownExports).toEqual(['alsoOwn', 'default', 'own']);

    const edge = (specifier: string) =>
      analysis.imports.find((entry) => entry.specifier === specifier);

    // The exported name is what links a caller to a module, not the local alias.
    expect(edge('./a')?.names).toEqual(['default', 'renamed', 'used']);
    expect(edge('./b')?.namespace).toBe(true);
    expect(edge('./c')?.names).toEqual([]);
    expect(edge('./d')?.typeOnly).toBe(true);

    // A re-export is a reference, never a use.
    expect(analysis.reexports.map((entry) => entry.specifier).sort()).toEqual(['./e', './f']);
    expect(analysis.reexports.find((entry) => entry.specifier === './f')?.star).toBe(true);
  });
});

describe('entry point discovery', () => {
  it('finds the framework conventions and nothing else', () => {
    expect(
      entryPointsAmong([
        'app/page.tsx',
        'app/u/[handle]/layout.tsx',
        'app/api/thing/route.ts',
        'app/u/[handle]/opengraph-image.tsx',
        'middleware.ts',
        'app/u/[handle]/views/resume-view.tsx',
        'lib/utils.ts',
        'components/ui/button.tsx',
        'types/index.d.ts',
      ])
    ).toEqual([
      'app/api/thing/route.ts',
      'app/page.tsx',
      'app/u/[handle]/layout.tsx',
      'app/u/[handle]/opengraph-image.tsx',
      'middleware.ts',
    ]);
  });

  it('discovers the real entry points from disk, deterministically', () => {
    const entryPoints = discoverEntryPoints();

    expect(entryPoints.length).toBeGreaterThan(100);
    expect(entryPoints).toEqual([...entryPoints].sort());
    expect(entryPoints).toContain('middleware.ts');
    for (const entry of entryPoints) {
      expect(existsSync(path.join(process.cwd(), entry)), entry).toBe(true);
    }
    expect(discoverEntryPoints()).toEqual(entryPoints);
  });

  it('includes route handlers outside app/api', () => {
    // These are real route handlers and real entry points, and the graph needs
    // them or everything they import looks dead. Signal 1 missed them until
    // item 8a widened its route rule from `app/api` to all of `app/`; the two
    // discoveries now agree about what a route handler is.
    expect(discoverEntryPoints()).toContain('app/.well-known/oauth-authorization-server/route.ts');
  });
});

describe('module graph on a synthetic repository', () => {
  const graph = syntheticGraph();
  const classOf = (modulePath: string) => graph.modules.get(modulePath)?.reachability;

  it('walks from the synthetic entry point alone', () => {
    expect(graph.entryPoints).toEqual(['app/zebra/page.tsx']);
    expect(graph.paths).toHaveLength(Object.keys(SYNTHETIC_SOURCES).length);
  });

  it('classifies all three classes from invented module names', () => {
    expect(classOf('app/zebra/page.tsx')).toBe('live');
    expect(classOf('lib/zebra-barrel.ts')).toBe('live');
    // The barrel passed the request through to the module that answers it.
    expect(classOf('lib/giraffe.ts')).toBe('live');
    // Re-exported and never asked for: reachable, nothing uses it.
    expect(classOf('lib/lion.ts')).toBe('module-reachable-call-unused');
    // Nothing imports okapi, and gnu is imported only by okapi.
    expect(classOf('lib/okapi.ts')).toBe('orphan');
    expect(classOf('lib/gnu.ts')).toBe('orphan');
  });

  it('counts a type-only reference as a use', () => {
    // Erased at runtime, but deleting it breaks the build, which is the
    // question this scan answers.
    expect(classOf('lib/zebra-types.ts')).toBe('live');
    expect(graph.modules.get('lib/zebra-types.ts')?.usedExports).toEqual(['Stripe']);
  });

  it('keeps an unimported orphan apart from a transitively dead one', () => {
    expect(graph.modules.get('lib/okapi.ts')?.importedBy).toEqual([]);
    expect(graph.modules.get('lib/gnu.ts')?.importedBy).toEqual(['lib/okapi.ts']);
    // Neither has a chain; that is what makes them orphans rather than the
    // middle class.
    expect(graph.modules.get('lib/gnu.ts')?.entryChain).toEqual([]);
  });

  it('records the chain that made a module reachable', () => {
    expect(graph.modules.get('lib/lion.ts')?.entryChain).toEqual([
      'app/zebra/page.tsx',
      'lib/zebra-barrel.ts',
      'lib/lion.ts',
    ]);
  });

  it('builds the same graph on a second run', () => {
    expect(syntheticGraph()).toEqual(graph);
  });
});

describe('module graph on the real tree', () => {
  const graph = buildModuleGraph();

  it('classifies every module exactly once', () => {
    expect(graph.paths.length).toBeGreaterThan(500);
    expect(graph.paths).toEqual([...graph.paths].sort());

    for (const modulePath of graph.paths) {
      const module = graph.modules.get(modulePath);
      expect(module, modulePath).toBeDefined();
      expect(['live', 'module-reachable-call-unused', 'orphan']).toContain(module!.reachability);
      // No declaration files: they are type artifacts, never evaluated.
      expect(modulePath.endsWith('.d.ts')).toBe(false);
    }
  });

  it('keeps all three classes populated', () => {
    const classes = new Set([...graph.modules.values()].map((module) => module.reachability));
    expect([...classes].sort()).toEqual(['live', 'module-reachable-call-unused', 'orphan']);
  });

  it('gives the three near-identical services three different classes', () => {
    for (const [modulePath, expected] of Object.entries(REQUIRED_CLASSES)) {
      expect(graph.modules.get(modulePath)?.reachability, modulePath).toBe(expected);
    }

    // The point of the trio: they must not collapse into one bucket.
    expect(new Set(Object.values(REQUIRED_CLASSES)).size).toBe(3);
  });

  it('shows why the barrel-reachable service is not an orphan', () => {
    const module = graph.modules.get('services/import/resume.service.ts')!;

    expect(module.importedBy).toEqual(['services/import/index.ts']);
    expect(module.usedExports).toEqual([]);
    expect(module.entryChain[0]).toMatch(/^app\//);
    expect(module.entryChain.at(-1)).toBe('services/import/resume.service.ts');
  });

  it('shows why the live parser service is live', () => {
    const module = graph.modules.get('services/resume-parser.service.ts')!;

    expect(module.usedExports.length).toBeGreaterThan(0);
    expect(module.importedBy).toContain('app/api/import/linkedin/route.ts');
    expect(module.entryChain).toEqual([
      'app/api/import/linkedin/route.ts',
      'services/resume-parser.service.ts',
    ]);
  });

  it('keeps lib/resume-parser dead without touching the service of the same name', () => {
    const library = modulesUnder(graph, 'lib/resume-parser');

    expect(library.length).toBeGreaterThan(1);
    for (const modulePath of library) {
      expect(graph.modules.get(modulePath)?.reachability, modulePath).toBe('orphan');
    }
    // One path segment apart, and in different classes.
    expect(graph.modules.get('services/resume-parser.service.ts')?.reachability).toBe('live');
  });

  it('derives the same importers the records name', () => {
    for (const entry of REACHABILITY) {
      expect(importersOf(graph, entry.path), entry.path).toEqual([...entry.importedBy].sort());
    }
  });
});

describe('scanReachability on the real tree', () => {
  const report = scanReachability();

  it('agrees with every record', () => {
    expect(report.disagreements).toEqual([]);
    expect(report.summary.records).toBe(REACHABILITY.length);
    expect(report.summary.recordsInAgreement).toBe(REACHABILITY.length);
  });

  it('partitions the modules across the three classes', () => {
    const { summary } = report;
    expect(summary.live + summary.moduleReachableCallUnused + summary.orphan).toBe(summary.modules);
    expect(summary.entryPoints).toBeGreaterThan(100);
  });

  it('rediscovers the lib/resume-parser dead end on its own', () => {
    // Item 8's done condition. Nothing in the scanner names this pair; it falls
    // out of "an orphan that another orphan still imports".
    const deadEnd = report.deadEnds.find((entry) => entry.path.startsWith('lib/resume-parser/'));

    expect(deadEnd).toBeDefined();
    expect(deadEnd?.importedBy).toEqual(['services/import/resume-openresume.service.ts']);
  });

  it('reports unrecorded dead and unused modules as gaps', () => {
    expect(report.unrecordedOrphans.length).toBeGreaterThan(0);
    expect(report.unrecordedOrphans).toEqual([...report.unrecordedOrphans].sort());
    expect(report.unrecordedCallUnused).toEqual([...report.unrecordedCallUnused].sort());

    // A module a record already accounts for is not an unrecorded finding.
    for (const entry of REACHABILITY) {
      for (const modulePath of modulesUnder(buildModuleGraph(), entry.path)) {
        expect(report.unrecordedOrphans).not.toContain(modulePath);
        expect(report.unrecordedCallUnused).not.toContain(modulePath);
      }
    }
  });

  it('produces an identical report on a second run', () => {
    expect(scanReachability()).toEqual(report);
  });
});

describe('scanReachability on changed records', () => {
  const graph = buildModuleGraph();

  it('reports a record whose class the repository disproves', () => {
    const report = scanReachability({
      graph,
      records: [record({ path: 'services/resume-parser.service.ts', reachability: 'orphan' })],
    });

    expect(report.disagreements).toHaveLength(1);
    expect(report.disagreements[0].disagreements).toContain('class-changed');
    expect(report.disagreements[0].computedClasses).toEqual(['live']);
  });

  it('reports a changed importer relationship in both directions', () => {
    const report = scanReachability({
      graph,
      records: [
        record({
          path: 'services/import/resume.service.ts',
          reachability: 'module-reachable-call-unused',
          // One importer invented, the real one dropped.
          importedBy: ['lib/utils.ts'],
          entryChain: [
            'app/api/import/links/route.ts',
            'services/import/index.ts',
            'services/import/resume.service.ts',
          ],
        }),
      ],
    });

    const finding = report.disagreements[0];
    expect(finding.disagreements).toContain('importers-changed');
    expect(finding.lostImporters).toEqual(['lib/utils.ts']);
    expect(finding.gainedImporters).toEqual(['services/import/index.ts']);
  });

  it('reports a recorded path that is no longer there', () => {
    const report = scanReachability({
      graph,
      records: [record({ path: 'services/gone-in-a-refactor.service.ts' })],
    });

    expect(report.disagreements[0].disagreements).toEqual(['missing-path']);
    expect(report.disagreements[0].moduleCount).toBe(0);
    // Nothing else is asserted about a path that is not there.
    expect(report.disagreements[0].computedClasses).toEqual([]);
  });

  it('reports an entry chain the repository no longer supports', () => {
    const report = scanReachability({
      graph,
      records: [
        record({
          path: 'services/resume-parser.service.ts',
          reachability: 'live',
          importedBy: [
            'app/api/import/linkedin/route.ts',
            'services/import/resume.service.ts',
            'services/resume-parser-ai.service.ts',
          ],
          // A hop that is not a reference anyone has.
          entryChain: ['app/page.tsx', 'services/resume-parser.service.ts'],
        }),
      ],
    });

    expect(report.disagreements[0].disagreements).toEqual(['entry-chain-invalid']);
    expect(report.disagreements[0].entryChainValid).toBe(false);
    expect(report.disagreements[0].derivedEntryChain).toEqual([
      'app/api/import/linkedin/route.ts',
      'services/resume-parser.service.ts',
    ]);
  });

  it('accepts a different but still valid entry chain', () => {
    // Several entry points may reach one module. Naming one of them is not
    // drift as long as that one still works, so the chain is validated rather
    // than compared for equality.
    const report = scanReachability({
      graph,
      records: [
        record({
          path: 'services/import/resume.service.ts',
          reachability: 'module-reachable-call-unused',
          importedBy: ['services/import/index.ts'],
          entryChain: [
            'app/api/import/links/route.ts',
            'services/import/index.ts',
            'services/import/resume.service.ts',
          ],
        }),
      ],
    });

    expect(report.disagreements).toEqual([]);
  });

  it('reports the repository classification when there are no records at all', () => {
    const report = scanReachability({ graph, records: [] });

    expect(report.disagreements).toEqual([]);
    expect(report.summary.records).toBe(0);
    // Removing the records does not blind the signal.
    expect(report.summary.orphan).toBeGreaterThan(0);
    expect(report.unrecordedOrphans).toContain('services/import/resume-openresume.service.ts');
  });

  it('is order-independent across records', () => {
    const records = [
      record({ path: 'services/import/resume-openresume.service.ts', reachability: 'orphan' }),
      record({
        path: 'services/resume-parser.service.ts',
        reachability: 'live',
        importedBy: [
          'app/api/import/linkedin/route.ts',
          'services/import/resume.service.ts',
          'services/resume-parser-ai.service.ts',
        ],
        entryChain: ['app/api/import/linkedin/route.ts', 'services/resume-parser.service.ts'],
      }),
    ];

    expect(scanReachability({ graph, records: [...records].reverse() })).toEqual(
      scanReachability({ graph, records })
    );
  });
});

describe('scanMapReferences on the real tree', () => {
  const report = scanMapReferences();

  it('finds every codeLocation and exclusion on disk', () => {
    expect(report.missing).toEqual([]);
    expect(report.summary.codeLocations).toBe(
      COVERAGE_MAP.reduce((total, entry) => total + entry.codeLocations.length, 0)
    );
    expect(report.summary.excluded).toBe(EXCLUDED.length);
    expect(report.summary.total).toBe(report.summary.codeLocations + report.summary.excluded);
  });

  it('classifies every reference exactly once', () => {
    expect([...report.present, ...report.orphaned, ...report.missing]).toHaveLength(
      report.summary.total
    );
  });

  it('names mapped code no entry point reaches, without calling it drift', () => {
    expect(report.orphaned.length).toBeGreaterThan(0);

    for (const finding of report.orphaned) {
      expect(finding.moduleCount).toBeGreaterThan(0);
      expect(finding.orphanModules).toHaveLength(finding.moduleCount);
      // It is there — that is what makes it different from `missing`.
      expect(existsSync(path.join(process.cwd(), finding.path)), finding.path).toBe(true);
      expect(finding.moveCandidates).toEqual([]);
    }
  });

  it('lists declared labs without guessing where a lab would live', () => {
    const declared = COVERAGE_MAP.filter((entry) => entry.lab);

    expect(report.labsDeclared).toHaveLength(declared.length);
    expect(report.summary.labsDeclared).toBe(declared.length);
  });

  it('produces an identical report on a second run', () => {
    expect(scanMapReferences()).toEqual(report);
  });
});

describe('scanMapReferences on changed maps', () => {
  const graph = buildModuleGraph();

  it('keeps a missing path apart from an orphaned one', () => {
    const report = scanMapReferences({
      graph,
      features: [
        feature({
          id: 'owner',
          codeLocations: ['lib/gone-in-a-refactor.ts', 'lib/shareable-resume-link.ts'],
        }),
      ],
      excluded: [],
    });

    expect(report.missing.map((finding) => finding.path)).toEqual(['lib/gone-in-a-refactor.ts']);
    expect(report.orphaned.map((finding) => finding.path)).toEqual([
      'lib/shareable-resume-link.ts',
    ]);
    // The two never merge: one is the map being wrong, the other is the code
    // being dead.
    expect(report.summary.missing).toBe(1);
    expect(report.summary.orphaned).toBe(1);
  });

  it('reports a stale exclusion as missing', () => {
    const report = scanMapReferences({
      graph,
      features: [],
      excluded: [{ path: 'app/no-longer-here', reason: 'A stub exclusion for the item-8 test.' }],
    });

    expect(report.missing).toHaveLength(1);
    expect(report.missing[0].featureId).toBeNull();
    expect(report.missing[0].kind).toBe('excluded');
  });

  it('offers move candidates for a lost path and applies none of them', () => {
    const report = scanMapReferences({
      graph,
      features: [feature({ id: 'owner', codeLocations: ['lib/moved/share-token.ts'] })],
      excluded: [],
    });

    const finding = report.missing[0];
    expect(finding.moveCandidates.length).toBeGreaterThan(0);
    expect(finding.moveCandidates.map((candidate) => candidate.path)).toContain(
      'lib/share-token.ts'
    );
    for (const candidate of finding.moveCandidates) {
      expect(candidate.evidence.length).toBeGreaterThan(0);
      expect(['basename', 'basename-and-parent']).toContain(candidate.strength);
    }

    // Advisory only: a candidate never changes the classification and never
    // reaches the map.
    expect(finding.classification).toBe('missing');
    expect(finding.path).toBe('lib/moved/share-token.ts');
    expect(COVERAGE_MAP.flatMap((entry) => entry.codeLocations)).not.toContain(
      'lib/share-token.ts.moved'
    );
  });

  it('says so when nothing on disk shares the name', () => {
    const report = scanMapReferences({
      graph,
      features: [feature({ id: 'owner', codeLocations: ['lib/nothing-is-called-this-zebra.ts'] })],
      excluded: [],
    });

    expect(report.missing[0].moveCandidates).toEqual([]);
    expect(report.missing[0].moveCandidatesConsidered).toBe(0);
  });

  it('ranks move candidates deterministically, strongest first', () => {
    const candidates = [
      'zulu/thing/helpers.ts',
      'alpha/helpers.ts',
      'beta/thing/helpers.ts',
      'gamma/other.ts',
    ];

    const forward = moveCandidatesFor('old/thing/helpers.ts', candidates);
    const reversed = moveCandidatesFor('old/thing/helpers.ts', [...candidates].reverse());

    expect(forward.map((candidate) => candidate.path)).toEqual([
      // Same parent directory first, then by path.
      'beta/thing/helpers.ts',
      'zulu/thing/helpers.ts',
      'alpha/helpers.ts',
    ]);
    expect(forward[0].strength).toBe('basename-and-parent');
    expect(forward[2].strength).toBe('basename');
    expect(reversed).toEqual(forward);
  });

  it('treats a path holding no TypeScript as present, not orphaned', () => {
    // `_extensions/chrome` is JavaScript and `pdf-worker` is a separate app.
    // Neither says anything about reachability either way.
    const report = scanMapReferences({
      graph,
      features: [feature({ id: 'owner', codeLocations: ['_extensions/chrome', 'pdf-worker'] })],
      excluded: [],
    });

    expect(report.orphaned).toEqual([]);
    expect(report.present.map((finding) => finding.path)).toEqual([
      '_extensions/chrome',
      'pdf-worker',
    ]);
    for (const finding of report.present) expect(finding.moduleCount).toBe(0);
  });
});

describe('scanCategoryHealth on the real map', () => {
  const report = scanCategoryHealth();

  it('reports every declared category', () => {
    expect(report.summary.categories).toBe(FEATURE_CATEGORIES.length);
    expect(report.categories.map((finding) => finding.category).sort()).toEqual(
      [...FEATURE_CATEGORIES].sort()
    );
    expect(report.summary.empty).toBe(0);
  });

  it('accounts for every feature exactly once', () => {
    const assigned = report.categories.flatMap((finding) => finding.features);

    expect(assigned).toHaveLength(COVERAGE_MAP.length);
    expect(new Set(assigned).size).toBe(COVERAGE_MAP.length);
    expect(report.summary.features).toBe(COVERAGE_MAP.length);
  });

  it('derives its thresholds from the distribution rather than a constant', () => {
    const { summary } = report;

    expect(summary.largeThreshold).toBe(
      Math.max(2, Math.ceil((2 * COVERAGE_MAP.length) / FEATURE_CATEGORIES.length))
    );
    expect(summary.thinThreshold).toBe(Math.floor(COVERAGE_MAP.length / FEATURE_CATEGORIES.length));
    expect(summary.empty + summary.thin + summary.balanced + summary.large).toBe(
      summary.categories
    );
  });

  it('suggests a regroup only where it has a reason to', () => {
    for (const finding of report.categories) {
      if (finding.size === 'balanced') {
        expect(finding.regroup, finding.category).toBeNull();
        continue;
      }
      expect(finding.regroup, finding.category).toBeTruthy();
    }

    for (const finding of report.large) {
      expect(finding.features.length).toBeGreaterThanOrEqual(report.summary.largeThreshold);
      // The suggestion names the features it would split, from their code.
      for (const featureId of finding.features) expect(finding.regroup).toContain(featureId);
    }
  });

  it('keeps missing pathway and lab coverage informational', () => {
    // Most areas genuinely have no browser coverage, and no lab exists before
    // item 20. Neither is a defect, and neither may fail the scan.
    expect(report.withoutPathway.length).toBeGreaterThan(0);
    expect(report.withoutLab.length).toBeGreaterThan(0);
    expect(report.withoutTests).toEqual([]);

    for (const finding of report.categories) {
      expect(finding.contradictions).toBe(0);
      if (finding.featuresWithPathway === 0) {
        expect(report.withoutPathway).toContain(finding.category);
      }
    }
  });

  it('counts the flagged feature as flagged, not missing', () => {
    const portfolio = report.categories.find((finding) => finding.category === 'Portfolio')!;

    expect(portfolio.flagged).toBe(1);
    expect(portfolio.shipped).toBe(0);
    expect(portfolio.size).not.toBe('empty');
  });

  it('produces an identical report on a second run', () => {
    expect(scanCategoryHealth()).toEqual(report);
  });
});

describe('scanCategoryHealth on changed metadata', () => {
  const categories: FeatureCategory[] = ['AI', 'Builder', 'Export'];

  it('moves a category between sizes when the features move', () => {
    const before = scanCategoryHealth({
      categories,
      features: [
        feature({ id: 'one', category: 'AI' }),
        feature({ id: 'two', category: 'Builder' }),
        feature({ id: 'three', category: 'Export' }),
      ],
    });

    const after = scanCategoryHealth({
      categories,
      features: [
        feature({ id: 'one', category: 'AI' }),
        feature({ id: 'two', category: 'AI' }),
        feature({ id: 'three', category: 'AI' }),
      ],
    });

    // Three features over three categories: threshold 2, every category holds
    // one, nothing is large.
    expect(before.summary.largeThreshold).toBe(2);
    expect(before.summary.large).toBe(0);
    expect(before.summary.empty).toBe(0);

    // Same features, all in one category: that one is large and two are empty.
    expect(after.categories.find((finding) => finding.category === 'AI')?.size).toBe('large');
    expect(after.summary.empty).toBe(2);
    expect(after.empty.map((finding) => finding.category).sort()).toEqual(['Builder', 'Export']);
    for (const finding of after.empty) {
      expect(finding.regroup).toContain('FEATURE_CATEGORIES');
    }
  });

  it('reports a thin category once the map is big enough to have one', () => {
    const report = scanCategoryHealth({
      categories: ['AI', 'Builder'],
      features: [
        ...Array.from({ length: 5 }, (unused, index) =>
          feature({ id: `ai-${index}`, category: 'AI' })
        ),
        feature({ id: 'builder-0', category: 'Builder' }),
      ],
    });

    // Six features over two categories: thin below 3, large at or above 6.
    expect(report.summary.thinThreshold).toBe(3);
    expect(report.summary.largeThreshold).toBe(6);
    expect(report.thin.map((finding) => finding.category)).toEqual(['Builder']);
    expect(report.thin[0].regroup).toContain('thin threshold');
  });

  it('counts contradictions against the category that owns the feature', () => {
    const report = scanCategoryHealth({
      categories,
      features: [
        feature({ id: 'one', category: 'AI' }),
        feature({ id: 'two', category: 'Export' }),
      ],
      contradictions: [
        { featureId: 'one', signal: 'test-attribution', detail: 'a.test.ts (missing-file)' },
        { featureId: 'unknown-feature', signal: 'ai-stages', detail: 'ghost (unknown-stage)' },
      ],
    });

    expect(report.categories.find((finding) => finding.category === 'AI')?.contradictions).toBe(1);
    expect(report.categories.find((finding) => finding.category === 'Export')?.contradictions).toBe(
      0
    );
  });

  it('is order-independent across features and categories', () => {
    const features = [
      feature({ id: 'zulu', category: 'AI' }),
      feature({ id: 'alpha', category: 'AI' }),
    ];

    const forward = scanCategoryHealth({ categories, features });
    const reversed = scanCategoryHealth({
      categories: [...categories].reverse(),
      features: [...features].reverse(),
    });

    expect(forward.categories[0].features).toEqual(['alpha', 'zulu']);
    expect(reversed).toEqual(forward);
  });
});

// Each of these runs the whole drift scan, which since item 8 parses the
// ~670-file source tree to classify reachability. The first call in a worker
// takes a couple of seconds, so the suite gets room beyond the 5s default; the
// assertions are unchanged.
describe('drift report integration', { timeout: 30_000 }, () => {
  const report = runDriftScan();

  it('carries the three item-8 signals after the existing six', () => {
    expect(report.signals.map((signal) => signal.signal)).toEqual([
      'product-surface',
      'test-attribution',
      'live-qa-pathways',
      'ai-stages',
      'feature-flags',
      'prisma-models',
      'reachability',
      'map-references',
      'category-health',
    ]);
  });

  it('leaves the six landed signals byte-identical', () => {
    const same = (name: string, expected: unknown) =>
      expect(report.signals.find((signal) => signal.signal === name)).toEqual(expected);

    same('product-surface', scanProductSurface());
    same('test-attribution', scanTestAttribution());
    same('live-qa-pathways', scanLiveQaPathways());
    same('ai-stages', scanAiStages());
    same('feature-flags', scanFeatureFlags());
    same('prisma-models', scanPrismaModels());
  });

  it('keeps every prior baseline', () => {
    const surface = report.signals.find((signal) => signal.signal === 'product-surface');
    const pathways = report.signals.find((signal) => signal.signal === 'live-qa-pathways');
    const tests = report.signals.find((signal) => signal.signal === 'test-attribution');
    const aiStages = report.signals.find((signal) => signal.signal === 'ai-stages');
    const flags = report.signals.find((signal) => signal.signal === 'feature-flags');
    const prisma = report.signals.find((signal) => signal.signal === 'prisma-models');

    expect(surface?.signal === 'product-surface' && surface.summary).toEqual({
      // Item 8a widened route discovery from `app/api` to all of `app/`,
      // which added the three `.well-known` OAuth handlers. Items 10, 12, 14,
      // 15, 19 and 21 added the five Developer Platform pages and nine admin
      // API routes, all excluded by the `app/admin` and `app/api/admin`
      // entries. The Resume Lab is the fifth page and the ninth route.
      total: 163,
      mapped: 130,
      excluded: 33,
      unmapped: 0,
      pages: 49,
      routes: 114,
    });
    expect(pathways?.signal === 'live-qa-pathways' && pathways.summary).toMatchObject({
      total: 9,
      mapped: 9,
      unmapped: 0,
      missingSpec: 0,
      orphanSpecs: 0,
    });
    expect(tests?.signal === 'test-attribution' && tests.summary).toMatchObject({
      mapped: 79,
      unlisted: 1,
      misattributed: 0,
      deadCode: 8,
      unresolvable: 0,
    });
    expect(tests?.signal === 'test-attribution' && tests.stale).toEqual([]);
    expect(aiStages?.signal === 'ai-stages' && aiStages.summary.total).toBe(11);
    expect(flags?.signal === 'feature-flags' && flags.summary.total).toBe(1);
    expect(prisma?.signal === 'prisma-models' && prisma.summary.total).toBe(31);
  });

  it('reports no drift on the current tree', () => {
    expect(report.ok).toBe(true);
  });

  it('does not fail the scan for dead modules, dead mapped code or category size', () => {
    const reachability = report.signals.find((signal) => signal.signal === 'reachability');
    const references = report.signals.find((signal) => signal.signal === 'map-references');
    const categories = report.signals.find((signal) => signal.signal === 'category-health');

    // Each of these is non-empty on the current tree, and `ok` is still true.
    expect(
      reachability?.signal === 'reachability' && reachability.unrecordedOrphans.length
    ).toBeGreaterThan(0);
    expect(references?.signal === 'map-references' && references.orphaned.length).toBeGreaterThan(
      0
    );
    expect(categories?.signal === 'category-health' && categories.large.length).toBeGreaterThan(0);
    expect(report.ok).toBe(true);
  });

  it('fails the scan for a disproved record or a path that is gone', () => {
    const badRecord = runDriftScan({
      records: [record({ path: 'services/resume-parser.service.ts', reachability: 'orphan' })],
    });
    expect(badRecord.ok).toBe(false);

    const badPath = runDriftScan({
      features: [...COVERAGE_MAP, feature({ id: 'ghost', codeLocations: ['lib/gone.ts'] })],
    });
    expect(badPath.ok).toBe(false);
  });

  it('feeds contradictions from the other signals into category health', () => {
    const drifted = runDriftScan({
      features: [
        ...COVERAGE_MAP,
        feature({ id: 'ghost', category: 'Export', aiStages: ['resumeGlance'] }),
      ],
    });
    const categories = drifted.signals.find((signal) => signal.signal === 'category-health');

    expect(drifted.ok).toBe(false);
    expect(
      categories?.signal === 'category-health' &&
        categories.categories.find((finding) => finding.category === 'Export')?.contradictions
    ).toBe(1);
  });

  it('produces an identical report on a second run', () => {
    expect(runDriftScan()).toEqual(report);
  });
});
