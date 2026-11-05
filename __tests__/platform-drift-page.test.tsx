/**
 * Drift page: the scan's findings in the browser (PLATFORM_TODO item 17).
 *
 * Item 17 has no `_Done when_` clause of its own — the title is the
 * requirement: the findings `npm run platform:scan` already produces, rendered
 * in the UI. So the assertions here are about three things: that the page reads
 * the existing scanner rather than a second implementation of it, that every
 * signal and every one of its typed lists reaches the page, and that a
 * contradiction never reads like a gap or the other way round.
 *
 * Targeted states come from synthetic typed `DriftReport` fixtures, because the
 * real tree is clean and a page that can only be tested when something is
 * broken is a page nobody has tested. The last block runs the **real** scanner
 * through the same `buildDriftView` the route calls, and checks the view sees
 * the repository's current baseline.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  buildDriftView,
  FAILING_GROUPS,
  REGISTERED_GROUPS,
  toDriftView,
} from '@/_admin-panel/platform/drift';
import type { DriftView } from '@/_admin-panel/platform/drift';
import type {
  AiStageScanReport,
  CategoryHealthReport,
  DriftReport,
  FlagScanReport,
  MapReferenceScanReport,
  PathwayScanReport,
  PrismaScanReport,
  ReachabilityScanReport,
  SurfaceScanReport,
  TestScanReport,
} from '@/_admin-panel/platform/scan/types';
import { DriftReportView } from '@/_admin-panel/platform/ui';

const VIEW = '_admin-panel/platform/drift/view.ts';
const VIEW_TYPES = '_admin-panel/platform/drift/view-types.ts';
const COMPONENT = '_admin-panel/platform/ui/drift-report.tsx';
const DRIFT_PAGE = 'app/admin/(dashboard)/platform/drift/page.tsx';
const NAV = '_admin-panel/platform/nav.ts';

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

/** Rendered text, with tags removed and entities decoded. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&rsquo;/g, '’')
    .replace(/&mdash;/g, '—')
    .replace(/\s+/g, ' ');
}

/* ------------------------------------------------------------------ *
 * Typed fixtures: one empty report per signal, overridable per test. *
 * ------------------------------------------------------------------ */

const surface = (over: Partial<SurfaceScanReport> = {}): SurfaceScanReport => ({
  signal: 'product-surface',
  summary: { total: 0, mapped: 0, excluded: 0, unmapped: 0, pages: 0, routes: 0 },
  mapped: [],
  excluded: [],
  unmapped: [],
  ...over,
});

const tests = (over: Partial<TestScanReport> = {}): TestScanReport => ({
  signal: 'test-attribution',
  summary: {
    total: 0,
    mapped: 0,
    unlisted: 0,
    misattributed: 0,
    uncategorized: 0,
    deadCode: 0,
    sourceText: 0,
    unresolvable: 0,
  },
  tests: [],
  mapped: [],
  unlisted: [],
  misattributed: [],
  uncategorized: [],
  deadCode: [],
  stale: [],
  ...over,
});

const pathways = (over: Partial<PathwayScanReport> = {}): PathwayScanReport => ({
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
  ...over,
});

const aiStages = (over: Partial<AiStageScanReport> = {}): AiStageScanReport => ({
  signal: 'ai-stages',
  summary: {
    total: 0,
    mapped: 0,
    unclaimed: 0,
    declared: 0,
    unused: 0,
    aiFeatures: 0,
    aiFeaturesWithoutStage: 0,
  },
  stages: [],
  mapped: [],
  unclaimed: [],
  unused: [],
  undeclared: [],
  stale: [],
  unbudgetedStages: [],
  aiFeaturesWithoutStage: [],
  aiFeaturesWithoutClient: [],
  ...over,
});

const flags = (over: Partial<FlagScanReport> = {}): FlagScanReport => ({
  signal: 'feature-flags',
  summary: {
    total: 0,
    mapped: 0,
    unclaimed: 0,
    declared: 0,
    unenforced: 0,
    gatedFeatures: 0,
  },
  flags: [],
  mapped: [],
  unclaimed: [],
  unenforced: [],
  stale: [],
  partiallyGated: [],
  ...over,
});

const prisma = (over: Partial<PrismaScanReport> = {}): PrismaScanReport => ({
  signal: 'prisma-models',
  summary: { total: 0, mapped: 0, unclaimed: 0, declared: 0, unused: 0 },
  models: [],
  mapped: [],
  unclaimed: [],
  unused: [],
  undeclared: [],
  stale: [],
  ...over,
});

const reachability = (over: Partial<ReachabilityScanReport> = {}): ReachabilityScanReport => ({
  signal: 'reachability',
  summary: {
    modules: 0,
    entryPoints: 0,
    live: 0,
    moduleReachableCallUnused: 0,
    orphan: 0,
    records: 0,
    recordsInAgreement: 0,
    unrecordedOrphans: 0,
    unrecordedCallUnused: 0,
  },
  entryPoints: [],
  records: [],
  disagreements: [],
  unrecordedOrphans: [],
  unrecordedCallUnused: [],
  deadEnds: [],
  ...over,
});

const mapReferences = (over: Partial<MapReferenceScanReport> = {}): MapReferenceScanReport => ({
  signal: 'map-references',
  summary: {
    total: 0,
    present: 0,
    orphaned: 0,
    missing: 0,
    codeLocations: 0,
    excluded: 0,
    labsDeclared: 0,
    moveCandidates: 0,
  },
  references: [],
  present: [],
  orphaned: [],
  missing: [],
  labsDeclared: [],
  ...over,
});

const categories = (over: Partial<CategoryHealthReport> = {}): CategoryHealthReport => ({
  signal: 'category-health',
  summary: {
    categories: 0,
    features: 0,
    empty: 0,
    thin: 0,
    balanced: 0,
    large: 0,
    largeThreshold: 2,
    thinThreshold: 0,
    categoriesWithoutPathway: 0,
    categoriesWithoutLab: 0,
  },
  categories: [],
  empty: [],
  thin: [],
  large: [],
  withoutPathway: [],
  withoutLab: [],
  withoutTests: [],
  ...over,
});

type SignalParts = {
  surface?: SurfaceScanReport;
  tests?: TestScanReport;
  pathways?: PathwayScanReport;
  aiStages?: AiStageScanReport;
  flags?: FlagScanReport;
  prisma?: PrismaScanReport;
  reachability?: ReachabilityScanReport;
  mapReferences?: MapReferenceScanReport;
  categories?: CategoryHealthReport;
};

/** A full nine-signal report, in the scanner's own order. */
function report(parts: SignalParts = {}, ok = true): DriftReport {
  return {
    signals: [
      parts.surface ?? surface(),
      parts.tests ?? tests(),
      parts.pathways ?? pathways(),
      parts.aiStages ?? aiStages(),
      parts.flags ?? flags(),
      parts.prisma ?? prisma(),
      parts.reachability ?? reachability(),
      parts.mapReferences ?? mapReferences(),
      parts.categories ?? categories(),
    ],
    ok,
  };
}

const MEASURED = { scannedAt: '2026-10-11T09:00:00.000Z', durationMs: 1_300 };

function viewOf(parts: SignalParts = {}, ok = true): DriftView {
  return toDriftView(report(parts, ok), MEASURED);
}

function renderOf(parts: SignalParts = {}, ok = true): string {
  return renderToStaticMarkup(<DriftReportView view={viewOf(parts, ok)} />);
}

function groupOf(view: DriftView, signal: string, id: string) {
  return view.signals.find((entry) => entry.signal === signal)?.groups.find((g) => g.id === id);
}

describe('the page reads the existing scanner', () => {
  it('calls runDriftScan and derives nothing itself', () => {
    const source = read(VIEW);

    expect(source).toContain("import { runDriftScan } from '../scan'");
    // No second scan: no filesystem, no TypeScript compiler, no walking.
    expect(source).not.toMatch(/from 'node:/);
    expect(source).not.toMatch(/readFileSync|readdirSync|existsSync|typescript/);
    // And none of the scanner's own discovery functions are re-run here.
    for (const forbidden of [
      'discoverProductSurface',
      'discoverTestFiles',
      'buildModuleGraph',
      'collectSourceFacts',
      'scanProductSurface',
      'scanTestAttribution',
    ]) {
      expect(source, `${forbidden} must not be called from the view`).not.toContain(forbidden);
    }
  });

  it('passes the scanner’s own verdict through untouched', () => {
    // The one number the page must never compute for itself: if these ever
    // disagree, the browser and the CLI tell an engineer different things.
    expect(viewOf({}, true).ok).toBe(true);
    expect(viewOf({}, false).ok).toBe(false);
    expect(read(VIEW)).toContain('ok: report.ok');
    expect(read(VIEW)).not.toMatch(/ok:\s*(!|\w+\.length === 0)/);
  });

  it('is the route that runs the scan, in a thin shim', () => {
    const page = read(DRIFT_PAGE);

    expect(page).toContain('buildDriftView()');
    expect(page).toContain('DriftReportView');
    expect(page).toMatch(/await requireAdmin\(\)/);
    expect(page).toContain("dynamic = 'force-dynamic'");
    expect(page).not.toContain('PlatformSectionPlaceholder');
    // No markup and no logic of its own.
    expect(page).not.toMatch(/className=|\.map\(|\.filter\(/);
  });

  it('keeps its severities tied to the scan’s own failure terms', () => {
    // `contradiction` means exactly "a term in DriftReport.ok". The table in
    // the view and the `ok` expression in the scanner are checked against each
    // other here, so neither can move alone.
    const okExpression = read('_admin-panel/platform/scan/report.ts')
      .split('ok:')[1]
      .split('};')[0];

    const expected: Record<string, string> = {
      'product-surface.unmapped': 'surface.unmapped',
      'test-attribution.stale': 'tests.stale',
      'test-attribution.misattributed': 'tests.misattributed',
      // Signal 3's three joined the expression in item 17a.
      'live-qa-pathways.stale': 'pathways.stale',
      'live-qa-pathways.missingSpec': 'pathways.missingSpec',
      'live-qa-pathways.orphanSpecs': 'pathways.orphanSpecs',
      'ai-stages.stale': 'aiStages.stale',
      'feature-flags.stale': 'flags.stale',
      'prisma-models.stale': 'prismaModels.stale',
      'reachability.disagreements': 'reachability.disagreements',
      'map-references.missing': 'mapReferences.missing',
    };

    expect([...FAILING_GROUPS].sort()).toEqual(Object.keys(expected).sort());
    for (const [group, term] of Object.entries(expected)) {
      expect(okExpression, `${group} must be a term in the scanner's ok`).toContain(
        `${term}.length === 0`
      );
    }

    // Every group the page can render is registered with a severity, and only
    // the failing ones are contradictions.
    const everything = viewOf(ALL_FINDINGS_PARTS, false);
    for (const signal of everything.signals) {
      for (const group of signal.groups) {
        const key = `${signal.signal}.${group.id}`;
        expect(REGISTERED_GROUPS, `${key} is not registered`).toContain(key);
        expect(group.failsScan, key).toBe(FAILING_GROUPS.includes(key));
        expect(group.severity === 'contradiction', key).toBe(group.failsScan);
      }
    }
  });
});

/** Every list of every signal, populated once, for the sweep tests. */
const ALL_FINDINGS_PARTS: SignalParts = {
  surface: surface({
    summary: { total: 2, mapped: 1, excluded: 0, unmapped: 1, pages: 1, routes: 1 },
    unmapped: [
      { path: 'app/zebra/page.tsx', kind: 'page', classification: 'unmapped', claimedBy: [] },
    ],
  }),
  tests: tests({
    summary: {
      total: 4,
      mapped: 0,
      unlisted: 1,
      misattributed: 1,
      uncategorized: 1,
      deadCode: 1,
      sourceText: 1,
      unresolvable: 0,
    },
    stale: [{ featureId: 'zebra', testPath: '__tests__/gone.test.ts', reason: 'missing-file' }],
    misattributed: [
      {
        path: '__tests__/wrong.test.ts',
        assertion: 'behavior',
        directTargets: ['lib/other.ts'],
        barrelTargets: [],
        unresolved: [],
        inferredFeatures: [],
        declaredFeatures: ['zebra'],
        classification: 'misattributed',
      },
    ],
    unlisted: [
      {
        path: '__tests__/unlisted.test.ts',
        assertion: 'behavior',
        directTargets: ['lib/zebra.ts'],
        barrelTargets: ['lib/index.ts'],
        unresolved: ['@/nope'],
        inferredFeatures: ['zebra'],
        declaredFeatures: [],
        classification: 'unlisted',
      },
    ],
    uncategorized: [
      {
        path: '__tests__/shared.test.ts',
        assertion: 'source-text',
        directTargets: ['lib/utils.ts'],
        barrelTargets: [],
        unresolved: [],
        inferredFeatures: [],
        declaredFeatures: [],
        classification: 'uncategorized',
      },
    ],
    deadCode: [
      {
        path: '__tests__/dead.test.ts',
        assertion: 'behavior',
        directTargets: ['lib/dead.ts'],
        barrelTargets: [],
        unresolved: [],
        inferredFeatures: [],
        declaredFeatures: [],
        classification: 'dead-code',
      },
    ],
  }),
  pathways: pathways({
    summary: {
      total: 2,
      mapped: 0,
      unmapped: 1,
      missingSpec: 1,
      orphanSpecs: 1,
      featuresWithPathway: 0,
      featuresWithoutPathway: 1,
    },
    stale: [{ featureId: 'zebra', pathwayId: 'gone.missing', reason: 'unknown-pathway' }],
    missingSpec: [
      {
        id: 'zebra.one',
        spec: 'pathways/zebra-one.spec.ts',
        specPath: null,
        area: 'public',
        requiresAuth: false,
        stability: 'stable',
        claimedBy: [],
        classification: 'unmapped',
      },
    ],
    unmapped: [
      {
        id: 'zebra.two',
        spec: 'pathways/zebra-two.spec.ts',
        specPath: '_admin-panel/modules/developer/live-qa/pathways/zebra-two.spec.ts',
        area: 'dashboard',
        requiresAuth: true,
        stability: 'flaky',
        claimedBy: [],
        classification: 'unmapped',
      },
    ],
    orphanSpecs: ['_admin-panel/modules/developer/live-qa/pathways/stray.spec.ts'],
    featuresWithoutPathway: ['zebra'],
  }),
  aiStages: aiStages({
    summary: {
      total: 2,
      mapped: 1,
      unclaimed: 1,
      declared: 1,
      unused: 1,
      aiFeatures: 1,
      aiFeaturesWithoutStage: 1,
    },
    stale: [{ featureId: 'zebra', stage: 'zebraStage', reason: 'unknown-stage' }],
    unbudgetedStages: ['lionStage'],
    unused: [
      {
        stage: 'unusedStage',
        usedBy: [],
        inferredFeatures: [],
        declaredFeatures: [],
        classification: 'unclaimed',
      },
    ],
    unclaimed: [
      {
        stage: 'unclaimedStage',
        usedBy: ['lib/ai.ts'],
        inferredFeatures: [],
        declaredFeatures: [],
        classification: 'unclaimed',
      },
    ],
    undeclared: [
      {
        stage: 'undeclaredStage',
        usedBy: ['lib/zebra.ts'],
        inferredFeatures: ['zebra'],
        declaredFeatures: [],
        classification: 'mapped',
      },
    ],
    aiFeaturesWithoutStage: ['zebra'],
    aiFeaturesWithoutClient: ['jd-match'],
  }),
  flags: flags({
    summary: { total: 2, mapped: 1, unclaimed: 1, declared: 1, unenforced: 1, gatedFeatures: 1 },
    stale: [{ featureId: 'zebra', flag: 'NEXT_PUBLIC_ZEBRA', reason: 'unknown-flag' }],
    unenforced: [
      {
        flag: 'NEXT_PUBLIC_UNUSED',
        helpers: ['isUnusedEnabled'],
        enforcedIn: [],
        inferredFeatures: [],
        declaredFeatures: [],
        classification: 'unclaimed',
      },
    ],
    unclaimed: [
      {
        flag: 'NEXT_PUBLIC_ORPHAN',
        helpers: [],
        enforcedIn: ['lib/orphan.ts'],
        inferredFeatures: [],
        declaredFeatures: [],
        classification: 'unclaimed',
      },
    ],
    partiallyGated: [{ featureId: 'public-follio', flag: 'NEXT_PUBLIC_PORTFOLIO_ENABLED' }],
  }),
  prisma: prisma({
    summary: { total: 2, mapped: 1, unclaimed: 1, declared: 1, unused: 1 },
    stale: [{ featureId: 'zebra', model: 'Zebra', reason: 'unknown-model' }],
    unused: [
      {
        model: 'Unused',
        delegate: 'unused',
        usedBy: [],
        inferredFeatures: [],
        declaredFeatures: [],
        classification: 'unclaimed',
      },
    ],
    unclaimed: [
      {
        model: 'Admin',
        delegate: 'admin',
        usedBy: ['lib/admin.ts'],
        inferredFeatures: [],
        declaredFeatures: [],
        classification: 'unclaimed',
      },
    ],
    undeclared: [
      {
        model: 'Profile',
        delegate: 'profile',
        usedBy: ['lib/profile.ts'],
        inferredFeatures: ['zebra'],
        declaredFeatures: [],
        classification: 'mapped',
      },
    ],
  }),
  reachability: reachability({
    summary: {
      modules: 10,
      entryPoints: 2,
      live: 7,
      moduleReachableCallUnused: 1,
      orphan: 2,
      records: 1,
      recordsInAgreement: 0,
      unrecordedOrphans: 1,
      unrecordedCallUnused: 1,
    },
    disagreements: [
      {
        path: 'lib/zebra',
        recordedClass: 'live',
        computedClasses: ['orphan'],
        moduleCount: 3,
        recordedImporters: ['app/page.tsx'],
        derivedImporters: ['lib/other.ts'],
        lostImporters: ['app/page.tsx'],
        gainedImporters: ['lib/other.ts'],
        recordedEntryChain: ['app/page.tsx', 'lib/zebra/index.ts'],
        derivedEntryChain: [],
        entryChainValid: false,
        disagreements: ['class-changed', 'importers-changed', 'entry-chain-invalid'],
      },
    ],
    unrecordedOrphans: ['lib/forgotten.ts'],
    unrecordedCallUnused: ['lib/quiet.ts'],
    deadEnds: [{ path: 'lib/dead-end.ts', importedBy: ['lib/also-dead.ts'] }],
  }),
  mapReferences: mapReferences({
    summary: {
      total: 3,
      present: 1,
      orphaned: 1,
      missing: 1,
      codeLocations: 3,
      excluded: 0,
      labsDeclared: 1,
      moveCandidates: 1,
    },
    missing: [
      {
        featureId: 'zebra',
        kind: 'code-location',
        path: 'lib/moved-away.ts',
        classification: 'missing',
        moduleCount: 0,
        orphanModules: [],
        moveCandidates: [
          { path: 'lib/new-home/moved-away.ts', strength: 'basename', evidence: ['moved-away.ts'] },
        ],
        moveCandidatesConsidered: 3,
      },
    ],
    orphaned: [
      {
        featureId: 'zebra',
        kind: 'code-location',
        path: 'lib/orphaned-dir',
        classification: 'orphaned',
        moduleCount: 2,
        orphanModules: ['lib/orphaned-dir/a.ts', 'lib/orphaned-dir/b.ts'],
        moveCandidates: [],
        moveCandidatesConsidered: 0,
      },
    ],
    labsDeclared: ['zebra → resume-import'],
  }),
  categories: categories({
    summary: {
      categories: 2,
      features: 3,
      empty: 0,
      thin: 1,
      balanced: 0,
      large: 1,
      largeThreshold: 3,
      thinThreshold: 1,
      categoriesWithoutPathway: 1,
      categoriesWithoutLab: 2,
    },
    categories: [
      {
        category: 'AI',
        features: ['one', 'two', 'three'],
        shipped: 2,
        flagged: 1,
        unshipped: 0,
        deprecated: 0,
        featuresWithTests: 3,
        featuresWithPathway: 0,
        featuresWithLab: 0,
        contradictions: 2,
        size: 'large',
        regroup: 'candidate split by code root — lib: jd-align',
      },
      {
        category: 'Export',
        features: ['four'],
        shipped: 1,
        flagged: 0,
        unshipped: 0,
        deprecated: 0,
        featuresWithTests: 1,
        featuresWithPathway: 1,
        featuresWithLab: 0,
        contradictions: 0,
        size: 'thin',
        regroup: null,
      },
    ],
    withoutPathway: ['AI'],
    withoutLab: ['AI', 'Export'],
    withoutTests: [],
  }),
};

describe('every signal reaches the page', () => {
  it('projects each of the report’s signals, in its order', () => {
    const source = report(ALL_FINDINGS_PARTS, false);
    const view = toDriftView(source, MEASURED);

    expect(view.signals.map((signal) => signal.signal)).toEqual(
      source.signals.map((signal) => signal.signal)
    );
    expect(view.summary.signals).toBe(source.signals.length);
  });

  it('renders a section for every signal, named and explained', () => {
    const view = viewOf(ALL_FINDINGS_PARTS, false);
    const html = renderToStaticMarkup(<DriftReportView view={view} />);
    const text = textOf(html);

    for (const signal of view.signals) {
      expect(html, `${signal.signal} has no section`).toContain(signal.signal);
      expect(text, `${signal.title} is not titled`).toContain(signal.title);
      // Each one says what it compares, so a reader need not know the CLI.
      expect(text.length).toBeGreaterThan(0);
      expect(textOf(html)).toContain(textOf(signal.checks).trim().slice(0, 40));
    }
  });

  it('renders every populated list, with its own heading', () => {
    const view = viewOf(ALL_FINDINGS_PARTS, false);
    const text = textOf(renderToStaticMarkup(<DriftReportView view={view} />));

    const groups = view.signals.flatMap((signal) => signal.groups);
    // Every list in the fixture produced a group, and every group is on screen.
    expect(groups.length).toBeGreaterThanOrEqual(25);
    for (const group of groups) {
      expect(text, `${group.title} is missing`).toContain(group.title);
      for (const entry of group.entries) {
        expect(text, `${entry.label} is missing`).toContain(entry.label);
      }
    }
  });

  it('counts every finding exactly once, by severity', () => {
    const view = viewOf(ALL_FINDINGS_PARTS, false);
    const groups = view.signals.flatMap((signal) => signal.groups);
    const total = groups.reduce((sum, group) => sum + group.entries.length + group.omitted, 0);

    expect(view.summary.contradictions + view.summary.inconsistencies + view.summary.gaps).toBe(
      total
    );
    // Eight of the nine: category health is the only signal that can never
    // have one.
    expect(view.summary.signalsWithContradictions).toBe(8);
  });
});

describe('a clean report', () => {
  const view = viewOf();
  const html = renderToStaticMarkup(<DriftReportView view={view} />);
  const text = textOf(html);

  it('says so plainly', () => {
    expect(text).toContain('No drift found');
    expect(text).toContain('the repository matches the coverage map');
    expect(text).not.toContain('Drift found in');
  });

  it('still shows every signal, so the page is useful when nothing is wrong', () => {
    expect(view.summary.healthySignals).toBe(view.summary.signals);
    for (const signal of view.signals) {
      expect(signal.healthy, signal.signal).toBe(true);
      expect(text, `${signal.title} disappears when clean`).toContain(signal.title);
      // A healthy signal says what healthy means for it, rather than nothing.
      expect(text, `${signal.signal} has no healthy note`).toContain(
        textOf(signal.healthyNote).trim().slice(0, 40)
      );
    }
    expect(text.split('No disagreement').length - 1).toBe(view.signals.length);
  });

  it('fabricates no finding to look busy', () => {
    expect(view.signals.every((signal) => signal.groups.length === 0)).toBe(true);
    expect(view.summary).toMatchObject({ contradictions: 0, inconsistencies: 0, gaps: 0 });
    expect(text).not.toContain('Fails the scan');
    expect(text).not.toContain('Recorded gap');
  });
});

describe('contradictions', () => {
  it('name the signal, the finding and that they fail the scan', () => {
    const html = renderOf(
      {
        surface: surface({
          summary: { total: 1, mapped: 0, excluded: 0, unmapped: 1, pages: 1, routes: 0 },
          unmapped: [
            { path: 'app/zebra/page.tsx', kind: 'page', classification: 'unmapped', claimedBy: [] },
          ],
        }),
      },
      false
    );
    const text = textOf(html);

    expect(text).toContain('Drift found in 1 of 9 signals');
    expect(text).toContain('Unmapped surfaces');
    expect(text).toContain('app/zebra/page.tsx');
    expect(text).toContain('Fails the scan');
    expect(text).toContain('page');
  });

  it('are counted apart from gaps', () => {
    const view = viewOf(ALL_FINDINGS_PARTS, false);

    // Eleven: one per failing list — test attribution has two of them and the
    // pathway signal three.
    expect(view.summary.contradictions).toBe(11);
    // One left in the middle tier: a call site naming a stage the token budget
    // does not define, which the scanner reports without failing because the
    // client falls back to its default allowance.
    expect(view.summary.inconsistencies).toBe(1);
    expect(view.summary.gaps).toBeGreaterThan(view.summary.contradictions);
  });

  it('read differently from an informational gap', () => {
    const text = textOf(renderOf(ALL_FINDINGS_PARTS, false));

    // Three labels, three meanings — the distinction the page exists for.
    expect(text).toContain('Fails the scan');
    expect(text).toContain('Does not fail the scan');
    expect(text).toContain('Recorded gap');
    expect(text).toContain('Recorded gaps — not drift');
  });
});

describe('product surface', () => {
  it('shows the report’s own counts, and lists what is unmapped', () => {
    const view = viewOf({
      surface: surface({
        summary: { total: 158, mapped: 130, excluded: 27, unmapped: 1, pages: 48, routes: 110 },
        unmapped: [
          {
            path: 'app/api/zebra/route.ts',
            kind: 'route',
            classification: 'unmapped',
            claimedBy: [],
          },
        ],
      }),
    });
    const signal = view.signals[0];
    const text = textOf(renderToStaticMarkup(<DriftReportView view={view} />));

    expect(signal.counts.map((count) => [count.label, count.value])).toEqual([
      ['Discovered', 158],
      ['Pages', 48],
      ['Route handlers', 110],
      ['Mapped', 130],
      ['Excluded', 27],
      ['Unmapped', 1],
    ]);
    expect(text).toContain('app/api/zebra/route.ts');
    expect(text).toContain('route handler');
  });

  it('never treats an excluded surface as drift', () => {
    const view = viewOf({
      surface: surface({
        summary: { total: 2, mapped: 1, excluded: 1, unmapped: 0, pages: 1, routes: 1 },
        excluded: [
          {
            path: 'app/admin/page.tsx',
            kind: 'page',
            classification: 'excluded',
            claimedBy: [],
            matchedBy: 'app/admin',
          },
        ],
      }),
    });

    expect(view.signals[0].groups).toEqual([]);
    expect(view.signals[0].healthy).toBe(true);
  });

  it('hardcodes no baseline in the component', () => {
    const source = read(COMPONENT);

    expect(source).not.toMatch(/\b\d+\s*(pages|routes|features|modules|models|signals)\b/i);
    expect(source).not.toMatch(/\b(158|130|110|680|110)\b/);
  });
});

describe('test attribution', () => {
  const view = viewOf(ALL_FINDINGS_PARTS, false);
  const text = textOf(renderToStaticMarkup(<DriftReportView view={view} />));

  it('shows a stale reference with its feature and reason', () => {
    const stale = groupOf(view, 'test-attribution', 'stale');

    expect(stale?.severity).toBe('contradiction');
    // `toMatchObject`, because item 18 hangs a review-only proposal off this
    // entry and that proposal has its own tests.
    expect(stale?.entries[0]).toMatchObject({
      label: '__tests__/gone.test.ts',
      detail: 'listed by zebra · missing-file',
      evidence: [],
    });
    expect(text).toContain('listed by zebra · missing-file');
  });

  it('shows the evidence behind a misattribution', () => {
    const entry = groupOf(view, 'test-attribution', 'misattributed')?.entries[0];

    expect(entry?.label).toBe('__tests__/wrong.test.ts');
    expect(entry?.evidence).toContain('map lists it under: zebra');
    expect(entry?.evidence).toContain('reaches: lib/other.ts');
  });

  it('keeps unlisted, uncategorized and dead-code informational', () => {
    for (const id of ['unlisted', 'uncategorized', 'deadCode']) {
      const group = groupOf(view, 'test-attribution', id);
      expect(group?.severity, id).toBe('gap');
      expect(group?.failsScan, id).toBe(false);
    }
    expect(text).toContain('graph attributes it to: zebra');
    expect(text).toContain('unresolved specifiers: @/nope');
    expect(text).toContain('asserts on source text');
  });

  it('shows every summary field the report carries', () => {
    const labels = view.signals
      .find((signal) => signal.signal === 'test-attribution')!
      .counts.map((count) => count.label);

    expect(labels).toEqual([
      'Test files',
      'Mapped',
      'Unlisted',
      'Misattributed',
      'Under no feature',
      'Dead code',
      'Source-text',
      'Unresolvable',
    ]);
  });
});

describe('Live QA pathways', () => {
  const view = viewOf(ALL_FINDINGS_PARTS, false);
  const text = textOf(renderToStaticMarkup(<DriftReportView view={view} />));

  it('shows all three of the signal’s contradictions as failing the scan', () => {
    // Item 17a: a stale claim, a catalogued pathway with no spec, and a spec
    // the catalog does not name are each a term in the scanner's `ok`.
    for (const id of ['stale', 'missingSpec', 'orphanSpecs']) {
      const group = groupOf(view, 'live-qa-pathways', id);
      expect(group?.severity, id).toBe('contradiction');
      expect(group?.failsScan, id).toBe(true);
      expect(group?.note, id).not.toContain('does not currently fail');
    }

    expect(text).toContain('gone.missing');
    expect(text).toContain('claimed by zebra · unknown-pathway');
    expect(text).toContain('spec pathways/zebra-one.spec.ts is not on disk');
    expect(text).toContain('stray.spec.ts');
  });

  it('keeps unclaimed pathways and bare features informational', () => {
    for (const id of ['unmapped', 'featuresWithoutPathway']) {
      expect(groupOf(view, 'live-qa-pathways', id)?.severity, id).toBe('gap');
      expect(groupOf(view, 'live-qa-pathways', id)?.failsScan, id).toBe(false);
    }
    expect(text).toContain('dashboard · flaky · signs in first');
  });

  it('runs nothing', () => {
    // Matched against imports and calls, not prose: item 18's notes explain
    // that a pathway's fix is a Playwright spec, which is why that word is on
    // the page.
    for (const source of [read(VIEW), read(COMPONENT), read(DRIFT_PAGE)]) {
      expect(source).not.toMatch(/from '[^']*(platform\/tests|child_process)/);
      expect(source).not.toMatch(/runLiveQa\(|runPathway\(|runCategory\(|spawn\(/);
    }
  });
});

describe('source facts', () => {
  const view = viewOf(ALL_FINDINGS_PARTS, false);
  const text = textOf(renderToStaticMarkup(<DriftReportView view={view} />));

  it('shows AI-stage drift and its gaps apart', () => {
    expect(groupOf(view, 'ai-stages', 'stale')?.severity).toBe('contradiction');
    expect(groupOf(view, 'ai-stages', 'unbudgetedStages')?.severity).toBe('inconsistency');
    for (const id of ['unused', 'unclaimed', 'undeclared', 'aiFeaturesWithoutStage']) {
      expect(groupOf(view, 'ai-stages', id)?.severity, id).toBe('gap');
    }

    expect(text).toContain('zebraStage');
    expect(text).toContain('declared by zebra · unknown-stage');
    expect(text).toContain('lionStage');
    expect(text).toContain('used by: lib/zebra.ts');
  });

  it('says plainly that an AI feature with no client is not a gap to close', () => {
    const group = groupOf(view, 'ai-stages', 'aiFeaturesWithoutClient');

    expect(group?.severity).toBe('gap');
    expect(group?.note).toContain('Not a gap to close');
    expect(text).toContain('jd-match');
  });

  it('shows flag drift and partial gating apart', () => {
    expect(groupOf(view, 'feature-flags', 'stale')?.severity).toBe('contradiction');
    expect(groupOf(view, 'feature-flags', 'partiallyGated')?.severity).toBe('gap');

    expect(text).toContain('NEXT_PUBLIC_ZEBRA');
    expect(text).toContain('declared by zebra · unknown-flag');
    expect(text).toContain('gates on NEXT_PUBLIC_PORTFOLIO_ENABLED without declaring it');
    expect(text).toContain('enforced in: lib/orphan.ts');
  });

  it('shows Prisma drift, and the shared tables as expected gaps', () => {
    expect(groupOf(view, 'prisma-models', 'stale')?.severity).toBe('contradiction');
    expect(groupOf(view, 'prisma-models', 'undeclared')?.severity).toBe('gap');
    expect(groupOf(view, 'prisma-models', 'undeclared')?.note).toContain('ownership nobody has');

    expect(text).toContain('declared by zebra · unknown-model');
    expect(text).toContain('queried via `admin`');
  });
});

describe('reachability', () => {
  const view = viewOf(ALL_FINDINGS_PARTS, false);
  const text = textOf(renderToStaticMarkup(<DriftReportView view={view} />));

  it('shows a disagreement with its recorded and computed classes', () => {
    const entry = groupOf(view, 'reachability', 'disagreements')?.entries[0];

    expect(groupOf(view, 'reachability', 'disagreements')?.severity).toBe('contradiction');
    expect(entry?.label).toBe('lib/zebra');
    expect(entry?.detail).toBe('recorded live · computed orphan');
    expect(entry?.evidence).toContain(
      'disagreements: class-changed, importers-changed, entry-chain-invalid'
    );
    expect(entry?.evidence).toContain('importers the repository no longer shows: app/page.tsx');
    expect(entry?.evidence).toContain('importers the record does not name: lib/other.ts');
    expect(entry?.evidence).toContain(
      'the recorded entry chain is no longer a real path through the repository'
    );
    expect(text).toContain('recorded live · computed orphan');
  });

  it('keeps orphan and dead-end lists informational', () => {
    for (const id of ['unrecordedOrphans', 'unrecordedCallUnused', 'deadEnds']) {
      expect(groupOf(view, 'reachability', id)?.severity, id).toBe('gap');
    }
    expect(text).toContain('imported by: lib/also-dead.ts');
  });
});

describe('map references', () => {
  const view = viewOf(ALL_FINDINGS_PARTS, false);
  const text = textOf(renderToStaticMarkup(<DriftReportView view={view} />));

  it('treats a missing path as a contradiction, with move candidates as advice', () => {
    const group = groupOf(view, 'map-references', 'missing');

    expect(group?.severity).toBe('contradiction');
    expect(group?.failsScan).toBe(true);
    expect(group?.entries[0].label).toBe('lib/moved-away.ts');
    expect(group?.entries[0].evidence).toContain(
      'possible move (advisory): lib/new-home/moved-away.ts — matched on basename (moved-away.ts)'
    );
    expect(group?.entries[0].evidence).toContain('3 candidates considered in all');
    expect(text).toContain('advisory');
  });

  it('keeps an orphaned path informational', () => {
    const group = groupOf(view, 'map-references', 'orphaned');

    expect(group?.severity).toBe('gap');
    expect(group?.failsScan).toBe(false);
    expect(group?.entries[0].evidence).toContain(
      'unreachable modules under it: lib/orphaned-dir/a.ts, lib/orphaned-dir/b.ts'
    );
  });

  it('writes nothing back to the map', () => {
    for (const source of [read(VIEW), read(COMPONENT), read(DRIFT_PAGE)]) {
      expect(source).not.toMatch(/writeFileSync|COVERAGE_MAP\s*\.|\.push\(.*codeLocations/);
    }
  });
});

describe('category health', () => {
  const view = viewOf(ALL_FINDINGS_PARTS, false);
  const html = renderToStaticMarkup(<DriftReportView view={view} />);
  const text = textOf(html);

  it('renders the table the report carries', () => {
    expect(view.categories).toHaveLength(2);
    expect(view.categories[0]).toEqual({
      category: 'AI',
      features: 3,
      shipped: 2,
      flagged: 1,
      unshipped: 0,
      deprecated: 0,
      featuresWithTests: 3,
      featuresWithPathway: 0,
      featuresWithLab: 0,
      contradictions: 2,
      size: 'large',
      regroup: 'candidate split by code root — lib: jd-align',
    });

    expect(html).toContain('<table');
    for (const header of [
      'Category',
      'Size',
      'Features',
      'Shipped',
      'Flagged',
      'With tests',
      'With pathway',
      'With lab',
      'Contradictions',
    ]) {
      expect(text, `${header} column is missing`).toContain(header);
    }
    expect(text).toContain('candidate split by code root');
    expect(text).toContain('Advisory only');
  });

  it('turns no gap into a failure', () => {
    const signal = view.signals.find((entry) => entry.signal === 'category-health')!;

    expect(signal.groups.every((group) => group.severity === 'gap')).toBe(true);
    expect(signal.groups.every((group) => group.failsScan === false)).toBe(true);
    expect(signal.healthy).toBe(true);
    expect(signal.healthyNote).toContain('Nothing in this signal fails the scan');
    expect(groupOf(view, 'category-health', 'withoutLab')?.note).toContain('item 20');
  });

  it('keeps a clean category table out of the way when there is nothing to show', () => {
    const clean = renderToStaticMarkup(<DriftReportView view={viewOf()} />);

    expect(clean).not.toContain('<table');
  });
});

describe('the page is read-only', () => {
  const html = renderToStaticMarkup(<DriftReportView view={viewOf(ALL_FINDINGS_PARTS, false)} />);

  it('offers no control that changes anything', () => {
    for (const control of ['<button', '<input', '<form', '<select', '<textarea']) {
      expect(html, `${control} belongs to item 18 or 19`).not.toContain(control);
    }
    const source = read(COMPONENT);
    expect(source).not.toMatch(/onClick|onSubmit|onChange|'use client'|useState|fetch\(/);
    // A server component with no client bundle and no server action, so there
    // is nothing for a control to be wired to. ("quarantine" and "delete" do
    // appear on the page — in the sentence saying they arrive in item 19.)
    expect(source).not.toContain('use server');
    expect(textOf(html)).toContain('re-derives nothing and changes nothing');
  });

  it('says where the actions will live instead of implying they exist', () => {
    const text = textOf(html);

    expect(text).toContain('item 18');
    expect(text).toContain('item 19');
  });

  it('keeps the scanner out of the rendered component', () => {
    const source = read(COMPONENT);

    expect(source).not.toMatch(/from '[^']*platform\/scan/);
    expect(source).not.toMatch(/from '[^']*drift\/view'/);
    expect(source).not.toMatch(/from 'node:/);
    expect(source).not.toMatch(/readFileSync\(|readdirSync\(/);
    expect(source).toMatch(/import type \{[\s\S]*?\} from '\.\.\/drift\/view-types'/);
    // And the client-safe types reach for nothing either.
    expect(read(VIEW_TYPES)).not.toMatch(/from 'node:|process\.|from '\.\.\/scan/);
  });
});

describe('long lists and determinism', () => {
  it('says how many entries it left out rather than cutting silently', () => {
    const many = Array.from({ length: 120 }, (_, index) => `lib/orphan-${index}.ts`);
    const view = viewOf({
      reachability: reachability({
        summary: {
          modules: 200,
          entryPoints: 1,
          live: 80,
          moduleReachableCallUnused: 0,
          orphan: 120,
          records: 0,
          recordsInAgreement: 0,
          unrecordedOrphans: 120,
          unrecordedCallUnused: 0,
        },
        unrecordedOrphans: many,
      }),
    });
    const group = groupOf(view, 'reachability', 'unrecordedOrphans')!;

    expect(group.entries).toHaveLength(view.entryCap);
    expect(group.omitted).toBe(120 - view.entryCap);
    expect(textOf(renderToStaticMarkup(<DriftReportView view={view} />))).toContain(
      `${group.omitted} more not shown`
    );
    // The count still reflects everything the report held.
    expect(view.summary.gaps).toBe(120);
  });

  it('projects the same report to the same view twice', () => {
    const source = report(ALL_FINDINGS_PARTS, false);

    expect(toDriftView(source, MEASURED)).toEqual(toDriftView(source, MEASURED));
  });

  it('caps an evidence line and says it did', () => {
    const view = viewOf({
      tests: tests({
        unlisted: [
          {
            path: '__tests__/wide.test.ts',
            assertion: 'behavior',
            directTargets: Array.from({ length: 9 }, (_, index) => `lib/target-${index}.ts`),
            barrelTargets: [],
            unresolved: [],
            inferredFeatures: ['zebra'],
            declaredFeatures: [],
            classification: 'unlisted',
          },
        ],
      }),
    });

    expect(groupOf(view, 'test-attribution', 'unlisted')?.entries[0].evidence).toContain(
      'reaches: lib/target-0.ts, lib/target-1.ts, lib/target-2.ts, lib/target-3.ts, lib/target-4.ts, lib/target-5.ts (+3 more)'
    );
  });
});

describe('the rest of the platform is untouched', () => {
  it('marks Drift as a built section that still names what finishes it', () => {
    const nav = read(NAV);

    expect(nav).toMatch(/id: 'drift'[\s\S]*?status: 'available'/);
    // Item 20 built the Labs index, so no section is planned any more; the
    // Drift entry still lists the items that complete it.
    expect(nav).toContain('items 17–19');
  });

  it('leaves the Tests console and its runners alone', () => {
    for (const modulePath of [
      '_admin-panel/platform/ui/test-console.tsx',
      '_admin-panel/platform/tests/runner.ts',
      '_admin-panel/platform/tests/history.ts',
      'app/admin/(dashboard)/platform/tests/page.tsx',
    ]) {
      expect(existsSync(path.join(process.cwd(), modulePath)), modulePath).toBe(true);
      expect(read(modulePath), `${modulePath} must not know about the drift view`).not.toMatch(
        /platform\/drift|DriftReportView/
      );
    }
  });

  it('leaves the old developer surface alone', () => {
    for (const modulePath of ['app/admin/(dashboard)/developer/page.tsx']) {
      expect(existsSync(path.join(process.cwd(), modulePath)), modulePath).toBe(true);
      expect(read(modulePath)).not.toMatch(/platform\/drift/);
    }
  });

  it('adds no dependency and stays inside the admin panel', () => {
    const imports = [...read(VIEW).matchAll(/from '([^']+)'/g)].map((match) => match[1]);

    for (const specifier of imports) {
      expect(specifier.startsWith('.'), `${specifier} is outside the admin panel`).toBe(true);
    }
  });
});

describe('the real scanner, through the page’s own path', () => {
  // The non-vacuity check: not a fixture. This is `buildDriftView()`, which is
  // exactly what the route calls, against this repository as it stands.
  const view = buildDriftView();
  const html = renderToStaticMarkup(<DriftReportView view={view} />);
  const text = textOf(html);

  it('sees the repository as the CLI does', () => {
    expect(view.ok).toBe(true);
    expect(view.summary.signals).toBe(9);
    expect(view.summary.signalsWithContradictions).toBe(0);
    expect(view.summary.contradictions).toBe(0);
    expect(view.signals.map((signal) => signal.signal)).toEqual([
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

  it('measures its own scan rather than inventing a time', () => {
    expect(Number.isInteger(view.durationMs)).toBe(true);
    expect(view.durationMs).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(Date.parse(view.scannedAt))).toBe(false);
    // The report itself carries no timestamp, on purpose — so this is measured
    // around the call and labelled as such.
    expect(text).toContain('measured around this page');
  });

  it('carries the current baseline, read from the report rather than written here', () => {
    const surfaceCounts = view.signals[0].counts;
    const byLabel = (label: string) =>
      surfaceCounts.find((count) => count.label === label)?.value ?? -1;

    // Not asserted as literals: the view's numbers must equal the scanner's,
    // whatever they are today.
    expect(byLabel('Discovered')).toBe(byLabel('Pages') + byLabel('Route handlers'));
    expect(byLabel('Discovered')).toBe(
      byLabel('Mapped') + byLabel('Excluded') + byLabel('Unmapped')
    );
    expect(byLabel('Unmapped')).toBe(0);
    expect(byLabel('Discovered')).toBeGreaterThan(100);

    const reach = view.signals.find((signal) => signal.signal === 'reachability')!;
    const reachBy = (label: string) =>
      reach.counts.find((count) => count.label === label)?.value ?? -1;
    expect(reachBy('Modules')).toBe(reachBy('Live') + reachBy('Call-unused') + reachBy('Orphan'));
    expect(reachBy('Records')).toBe(reachBy('In agreement'));
  });

  it('renders every signal of the real report with its real gaps', () => {
    for (const signal of view.signals) {
      expect(text, `${signal.title} is missing`).toContain(signal.title);
    }
    // The repository's real recorded gaps, which the page must still show.
    expect(view.summary.gaps).toBeGreaterThan(0);
    expect(text).toContain('Recorded gaps — not drift');
    expect(text).toContain('No drift found');
    expect(text).not.toContain('Fails the scan');
  });

  it('agrees with the category table the scan prints', () => {
    const health = view.signals.find((signal) => signal.signal === 'category-health')!;
    const categoryCount = health.counts.find((count) => count.label === 'Categories')?.value ?? -1;

    expect(view.categories).toHaveLength(categoryCount);
    expect(view.categories.every((row) => row.contradictions === 0)).toBe(true);
    expect(view.categories.map((row) => row.category)).toEqual(
      [...view.categories.map((row) => row.category)].sort((a, b) => a.localeCompare(b))
    );
  });
}, 60_000);
