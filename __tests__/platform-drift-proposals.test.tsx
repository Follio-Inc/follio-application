/**
 * Drift actions: proposed map entries and draft tests (PLATFORM_TODO item 18).
 *
 * Item 18 has no `_Done when_` clause; its line is the requirement — "propose
 * map entries and draft tests (drafts for review, never auto-merged)". So these
 * assertions are about three things: that the proposals come from evidence the
 * scanner already found, that the ones with no evidence say so instead of
 * guessing an owner, and that **nothing can be applied**.
 *
 * The last one is the point of the item. Proposals are generated during the
 * page's own server render, so there is no request to make and no id to submit:
 * the attack surface a "propose" endpoint would have is absent rather than
 * defended. The tests below pin that — no route generates proposals, the module
 * cannot write a file, and the page has no control that would.
 *
 * Targeted states come from synthetic typed reports, because the real tree has
 * no contradictions. The last block uses the real scanner through the real
 * `buildDriftView` and checks what it actually proposes for this repository.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { COVERAGE_MAP } from '@/_admin-panel/platform/coverage-map';
import type { PlatformFeature } from '@/_admin-panel/platform/coverage-map';
import {
  buildDriftView,
  MAP_FILE,
  NOT_ACTIONABLE_GROUPS,
  PROPOSAL_GROUPS,
  proposeForMisattributedTest,
  proposeForMissingReference,
  proposeForStaleReference,
  proposeForUnlistedTest,
  proposeForUnmappedSurface,
  proposeTestDraft,
  proposeTestDrafts,
  REGISTERED_GROUPS,
  toDriftView,
} from '@/_admin-panel/platform/drift';
import type { DriftView, MapEntryProposal } from '@/_admin-panel/platform/drift';
import type {
  DriftReport,
  MapReferenceFinding,
  SurfaceFinding,
  TestFinding,
} from '@/_admin-panel/platform/scan/types';
import { DriftReportView } from '@/_admin-panel/platform/ui';

const PROPOSALS = '_admin-panel/platform/drift/proposals.ts';
const PROPOSAL_TYPES = '_admin-panel/platform/drift/proposal-types.ts';
const VIEW = '_admin-panel/platform/drift/view.ts';
const COMPONENT = '_admin-panel/platform/ui/drift-report.tsx';
const DRIFT_PAGE = 'app/admin/(dashboard)/platform/drift/page.tsx';
const COVERAGE_MAP_FILE = '_admin-panel/platform/coverage-map/map.ts';
const PLATFORM_API_DIR = ['app', 'api', 'admin', 'platform'].join(path.sep);
const TESTS_DIR = '__tests__';

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

function feature(overrides: Partial<PlatformFeature>): PlatformFeature {
  return {
    id: 'zebra',
    name: 'Zebra',
    userDescription: 'Does the zebra thing. Then it does another thing.',
    codeLocations: ['lib/zebra.ts'],
    category: 'Builder',
    status: 'shipped',
    unitTests: ['__tests__/zebra.test.ts'],
    pathways: [],
    ...overrides,
  };
}

function testFinding(overrides: Partial<TestFinding>): TestFinding {
  return {
    path: '__tests__/example.test.ts',
    assertion: 'behavior',
    directTargets: ['lib/zebra.ts'],
    barrelTargets: [],
    unresolved: [],
    inferredFeatures: [],
    declaredFeatures: [],
    classification: 'unlisted',
    ...overrides,
  };
}

function reference(overrides: Partial<MapReferenceFinding>): MapReferenceFinding {
  return {
    featureId: 'zebra',
    kind: 'code-location',
    path: 'lib/gone.ts',
    classification: 'missing',
    moduleCount: 0,
    orphanModules: [],
    moveCandidates: [],
    moveCandidatesConsidered: 0,
    ...overrides,
  };
}

const FEATURES = [
  feature({ id: 'zebra', codeLocations: ['lib/zebra.ts'] }),
  feature({ id: 'lion', codeLocations: ['lib/lion.ts'] }),
];

describe('which findings get a proposal', () => {
  it('declares every list as actionable or says why it is not', () => {
    // No list can arrive without someone deciding which it is: the two tables
    // partition the registered groups, and this fails if one is in neither or
    // in both.
    const actionable = new Set(PROPOSAL_GROUPS);
    const reasoned = new Set(NOT_ACTIONABLE_GROUPS);

    for (const group of REGISTERED_GROUPS) {
      const inActionable = actionable.has(group);
      const inReasoned = reasoned.has(group);
      expect(inActionable !== inReasoned, `${group} must be in exactly one table`).toBe(true);
    }
    for (const group of [...actionable, ...reasoned]) {
      expect(REGISTERED_GROUPS, `${group} is not a registered list`).toContain(group);
    }
  });

  it('proposes only where the report names a target or the edit is a removal', () => {
    expect([...PROPOSAL_GROUPS]).toEqual([
      'ai-stages.stale',
      'feature-flags.stale',
      'live-qa-pathways.stale',
      'map-references.missing',
      'prisma-models.stale',
      'product-surface.unmapped',
      'test-attribution.misattributed',
      'test-attribution.stale',
      'test-attribution.unlisted',
    ]);
  });

  it('never proposes ownership for dead or orphaned code', () => {
    // The explicit prohibition: unreachable code must not be mapped as live
    // product behaviour, however tempting the path looks.
    for (const group of [
      'test-attribution.deadCode',
      'reachability.unrecordedOrphans',
      'reachability.unrecordedCallUnused',
      'reachability.deadEnds',
      'map-references.orphaned',
    ]) {
      expect(PROPOSAL_GROUPS, `${group} must not be actionable`).not.toContain(group);
      expect(NOT_ACTIONABLE_GROUPS).toContain(group);
    }
  });

  it('leaves the gaps the map declines on purpose alone', () => {
    for (const group of [
      'prisma-models.undeclared',
      'ai-stages.undeclared',
      'feature-flags.partiallyGated',
      'test-attribution.uncategorized',
    ]) {
      expect(PROPOSAL_GROUPS, `${group} must not be actionable`).not.toContain(group);
    }
  });

  it('turns no category-health gap into an action', () => {
    for (const group of REGISTERED_GROUPS.filter((entry) => entry.startsWith('category-health.'))) {
      expect(PROPOSAL_GROUPS, `${group} must not be actionable`).not.toContain(group);
      expect(NOT_ACTIONABLE_GROUPS).toContain(group);
    }
  });
});

describe('a map entry proposed from the import graph', () => {
  it('names the one feature the graph attributes the test to', () => {
    const [proposal] = proposeForUnlistedTest(
      testFinding({
        path: '__tests__/zebra-extra.test.ts',
        directTargets: ['lib/zebra.ts', 'lib/shared.ts'],
        inferredFeatures: ['zebra'],
      }),
      FEATURES
    );

    expect(proposal.kind).toBe('map-entry');
    expect(proposal.action).toBe('add');
    expect(proposal.field).toBe('unitTests');
    expect(proposal.reference).toBe('__tests__/zebra-extra.test.ts');
    expect(proposal.featureId).toBe('zebra');
    expect(proposal.certainty).toBe('certain');
    expect(proposal.editFile).toBe(MAP_FILE);
    // The evidence is the graph's, quoting only the targets this feature owns.
    expect(proposal.evidence.join(' ')).toContain("'zebra' claims lib/zebra.ts");
    expect(proposal.evidence.join(' ')).not.toContain('lib/shared.ts —');
  });

  it('refuses to choose when several features claim what the test reaches', () => {
    const [proposal] = proposeForUnlistedTest(
      testFinding({
        directTargets: ['lib/zebra.ts', 'lib/lion.ts'],
        inferredFeatures: ['lion', 'zebra'],
      }),
      FEATURES
    );

    expect(proposal.certainty).toBe('ambiguous');
    expect(proposal.featureId).toBeNull();
    expect(proposal.candidates.map((candidate) => candidate.target)).toEqual(['lion', 'zebra']);
    // Each candidate carries the evidence for itself, not a shared blur.
    expect(proposal.candidates[0].evidence.join(' ')).toContain('lib/lion.ts');
    expect(proposal.candidates[1].evidence.join(' ')).toContain('lib/zebra.ts');
    expect(proposal.needsDecision).toContain('Pick the feature');
  });

  it('says what the graph cannot know, even when the target is certain', () => {
    const [proposal] = proposeForUnlistedTest(
      testFinding({ inferredFeatures: ['zebra'] }),
      FEATURES
    );

    // The graph sees that a test reaches a feature's code, not that it covers
    // it — a fixture looks the same. A proposal that hid that would turn a
    // deliberate omission into a confident mistake.
    expect(proposal.evidence.join(' ')).toContain('cannot tell coverage from contact');
    expect(proposal.needsDecision).toContain('rather than merely importing it');
  });

  it('proposes nothing when the graph attributes the test to nobody', () => {
    expect(proposeForUnlistedTest(testFinding({ inferredFeatures: [] }), FEATURES)).toEqual([]);
  });

  it('moves a misattributed test to the feature the graph does support', () => {
    const [proposal] = proposeForMisattributedTest(
      testFinding({
        classification: 'misattributed',
        directTargets: ['lib/lion.ts'],
        declaredFeatures: ['zebra'],
        inferredFeatures: ['lion'],
      }),
      FEATURES
    );

    expect(proposal.action).toBe('move');
    expect(proposal.fromFeatureId).toBe('zebra');
    expect(proposal.featureId).toBe('lion');
    expect(proposal.certainty).toBe('certain');
    expect(proposal.preview.join('\n')).toContain("-   '__tests__/example.test.ts',");
    expect(proposal.preview.join('\n')).toContain("+   '__tests__/example.test.ts',");
  });

  it('only removes a misattributed test when there is nowhere to move it', () => {
    const [proposal] = proposeForMisattributedTest(
      testFinding({
        classification: 'misattributed',
        declaredFeatures: ['zebra'],
        inferredFeatures: [],
      }),
      FEATURES
    );

    expect(proposal.action).toBe('remove');
    expect(proposal.featureId).toBeNull();
    expect(proposal.candidates).toEqual([]);
    expect(proposal.evidence.join(' ')).toContain('no feature at all');
  });
});

describe('a map entry proposed for something the repository cannot support', () => {
  it('removes a reference to a thing that does not exist', () => {
    const [proposal] = proposeForStaleReference({
      signal: 'ai-stages',
      field: 'aiStages',
      featureId: 'zebra',
      reference: 'zebraStage',
      reason: 'unknown-stage',
      explain: 'the token budget defines no such key.',
    });

    expect(proposal.action).toBe('remove');
    expect(proposal.field).toBe('aiStages');
    expect(proposal.fromFeatureId).toBe('zebra');
    expect(proposal.featureId).toBeNull();
    expect(proposal.certainty).toBe('certain');
    expect(proposal.needsDecision).toBeNull();
    expect(proposal.preview.join('\n')).toContain("-   'zebraStage',");
    expect(proposal.preview.join('\n')).not.toContain('+');
  });

  it('moves it instead when the report names the feature that does own it', () => {
    const [proposal] = proposeForStaleReference({
      signal: 'prisma-models',
      field: 'prismaModels',
      featureId: 'zebra',
      reference: 'Lion',
      reason: 'no-usage-link',
      explain: 'no query for it sits in that feature’s code.',
      inferredFeatures: ['lion'],
    });

    expect(proposal.action).toBe('move');
    expect(proposal.featureId).toBe('lion');
    expect(proposal.fromFeatureId).toBe('zebra');
    expect(proposal.certainty).toBe('certain');
  });

  it('refuses to choose between several owners', () => {
    const [proposal] = proposeForStaleReference({
      signal: 'feature-flags',
      field: 'flag',
      featureId: 'zebra',
      reference: 'NEXT_PUBLIC_ZEBRA',
      reason: 'no-enforcement-link',
      explain: 'nothing in that feature’s code gates on it.',
      inferredFeatures: ['lion', 'tiger'],
    });

    expect(proposal.action).toBe('remove');
    expect(proposal.certainty).toBe('ambiguous');
    expect(proposal.candidates.map((candidate) => candidate.target)).toEqual(['lion', 'tiger']);
    expect(proposal.needsDecision).toContain('Pick which feature');
  });

  it('ignores the declaring feature when it appears in its own inferred list', () => {
    const [proposal] = proposeForStaleReference({
      signal: 'test-attribution',
      field: 'unitTests',
      featureId: 'zebra',
      reference: '__tests__/zebra.test.ts',
      reason: 'no-import-link',
      explain: 'the import graph reaches none of its code.',
      inferredFeatures: ['zebra'],
    });

    expect(proposal.action).toBe('remove');
    expect(proposal.candidates).toEqual([]);
  });
});

describe('a map entry proposed for a path that moved or vanished', () => {
  it('names a single strong candidate', () => {
    const [proposal] = proposeForMissingReference(
      reference({
        moveCandidates: [
          {
            path: 'lib/new/gone.ts',
            strength: 'basename-and-parent',
            evidence: ['gone.ts', 'new'],
          },
        ],
        moveCandidatesConsidered: 1,
      })
    );

    expect(proposal.action).toBe('add');
    expect(proposal.reference).toBe('lib/new/gone.ts');
    expect(proposal.certainty).toBe('certain');
    expect(proposal.evidence.join(' ')).toContain('advisory');
    expect(proposal.needsDecision).toContain('A name match is not proof');
  });

  it('lists candidates and refuses to choose when the match is weak', () => {
    const [proposal] = proposeForMissingReference(
      reference({
        moveCandidates: [
          { path: 'lib/a/gone.ts', strength: 'basename', evidence: ['gone.ts'] },
          { path: 'lib/b/gone.ts', strength: 'basename', evidence: ['gone.ts'] },
        ],
        moveCandidatesConsidered: 5,
      })
    );

    expect(proposal.certainty).toBe('ambiguous');
    expect(proposal.candidates).toHaveLength(2);
    expect(proposal.evidence.join(' ')).toContain('5 paths in the tree match');
  });

  it('removes the entry when nothing in the tree matches', () => {
    const [proposal] = proposeForMissingReference(reference({}));

    expect(proposal.action).toBe('remove');
    expect(proposal.certainty).toBe('certain');
    expect(proposal.evidence.join(' ')).toContain('nothing to repoint it at');
  });
});

describe('an unmapped surface', () => {
  const surface: SurfaceFinding = {
    path: 'app/zebra/page.tsx',
    kind: 'page',
    classification: 'unmapped',
    claimedBy: [],
  };

  it('gets the shape of the edit and no invented owner', () => {
    const [proposal] = proposeForUnmappedSurface(surface);

    expect(proposal.certainty).toBe('unresolved');
    expect(proposal.featureId).toBeNull();
    // Both honest routes, and the page is not assigned to either.
    expect(proposal.candidates.map((candidate) => candidate.target)).toEqual([
      'a feature',
      'EXCLUDED',
    ]);
    expect(proposal.evidence.join(' ')).toContain('a guess from the path would be a claim');
    expect(proposal.needsDecision).toContain('whether this page is product');
    expect(proposal.preview.join('\n')).toContain('the feature a person picks');
  });

  it('does not read the path for a feature name', () => {
    const [proposal] = proposeForUnmappedSurface({ ...surface, path: 'app/portfolio/page.tsx' });

    // 'portfolio' is a real feature id in the map. Matching on the path would
    // be the exact mistake the scanner has stronger evidence to avoid.
    expect(proposal.featureId).toBeNull();
    expect(proposal.candidates.map((candidate) => candidate.target)).not.toContain('portfolio');
  });
});

describe('a draft test', () => {
  const bare = feature({ id: 'chrome-thing', name: "Zebra's tool", unitTests: [] });

  it('is proposed only for a feature the map lists no test for', () => {
    const drafts = proposeTestDrafts([bare, feature({ id: 'covered' })]);

    expect(drafts.map((draft) => draft.featureId)).toEqual(['chrome-thing']);
  });

  it('follows the repository’s Vitest conventions and asserts nothing', () => {
    const draft = proposeTestDraft(bare);

    expect(draft.suggestedPath).toBe('__tests__/chrome-thing.test.ts');
    expect(draft.draft).toContain("import { describe, it } from 'vitest';");
    // Every case is a todo, so the draft cannot report as a pass. That is the
    // whole reason it is safe to generate: it can never claim coverage.
    expect(draft.draft).toContain('it.todo(');
    expect(draft.draft).not.toMatch(/\bexpect\(/);
    expect(draft.draft).not.toMatch(/\bit\('|\bit\("|it\.only|it\.skip/);
    expect(draft.draft.match(/it\.todo\(/g)).toHaveLength(2);
    // An apostrophe in a feature name must not break the describe literal.
    expect(draft.draft).toContain("describe('Zebra\\'s tool'");
  });

  it('says it is a draft, and what is left for a person', () => {
    const draft = proposeTestDraft(bare);

    expect(draft.draft).toContain('draft, not coverage');
    expect(draft.draft).toContain('TODO:');
    expect(draft.placeholders.join(' ')).toContain('Every assertion');
    expect(draft.evidence.join(' ')).toContain("lists no `unitTests` entry for 'chrome-thing'");
    expect(draft.evidence.join(' ')).toContain('lib/zebra.ts');
  });

  it('is minimal rather than speculative', () => {
    const draft = proposeTestDraft(bare);

    // A draft long enough to look like coverage would be worse than none.
    expect(draft.draft.split('\n').length).toBeLessThan(35);
    expect(draft.draft).not.toContain('vi.mock');
    expect(draft.draft).not.toContain('beforeEach');
  });

  it('warns when the path it suggests is taken', () => {
    const draft = proposeTestDraft(bare, ['__tests__/chrome-thing.test.ts']);

    expect(draft.evidence.join(' ')).toContain('A file already exists');
    expect(draft.placeholders.join(' ')).toContain('The file name');
  });
});

/** A report with one finding per actionable list, for the end-to-end checks. */
function reportWith(overrides: Partial<Record<string, unknown>> = {}): DriftReport {
  const empty = {
    'product-surface': {
      signal: 'product-surface',
      summary: { total: 0, mapped: 0, excluded: 0, unmapped: 0, pages: 0, routes: 0 },
      mapped: [],
      excluded: [],
      unmapped: [],
    },
    'test-attribution': {
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
    },
    'live-qa-pathways': {
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
    },
    'ai-stages': {
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
    },
    'feature-flags': {
      signal: 'feature-flags',
      summary: { total: 0, mapped: 0, unclaimed: 0, declared: 0, unenforced: 0, gatedFeatures: 0 },
      flags: [],
      mapped: [],
      unclaimed: [],
      unenforced: [],
      stale: [],
      partiallyGated: [],
    },
    'prisma-models': {
      signal: 'prisma-models',
      summary: { total: 0, mapped: 0, unclaimed: 0, declared: 0, unused: 0 },
      models: [],
      mapped: [],
      unclaimed: [],
      unused: [],
      undeclared: [],
      stale: [],
    },
    reachability: {
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
    },
    'map-references': {
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
    },
    'category-health': {
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
    },
  } as unknown as Record<string, Record<string, unknown>>;

  for (const [signal, patch] of Object.entries(overrides)) {
    empty[signal] = { ...empty[signal], ...(patch as Record<string, unknown>) };
  }

  return {
    signals: Object.values(empty),
    ok: false,
  } as unknown as DriftReport;
}

const MEASURED = { scannedAt: '2026-10-11T09:00:00.000Z', durationMs: 1_200, features: FEATURES };

describe('the view carries the proposals through', () => {
  const view: DriftView = toDriftView(
    reportWith({
      'product-surface': {
        unmapped: [
          { path: 'app/zebra/page.tsx', kind: 'page', classification: 'unmapped', claimedBy: [] },
        ],
      },
      'test-attribution': {
        unlisted: [testFinding({ inferredFeatures: ['zebra'] })],
        deadCode: [testFinding({ path: '__tests__/dead.test.ts', classification: 'dead-code' })],
      },
    }),
    MEASURED
  );
  const html = renderToStaticMarkup(<DriftReportView view={view} />);
  const text = textOf(html);

  it('attaches a proposal to the finding it is about', () => {
    const surface = view.signals[0].groups.find((group) => group.id === 'unmapped');
    const unlisted = view.signals[1].groups.find((group) => group.id === 'unlisted');

    expect(surface?.actionable).toBe(true);
    expect(surface?.entries[0].proposals).toHaveLength(1);
    expect(unlisted?.entries[0].proposals[0].featureId).toBe('zebra');
  });

  it('attaches none to an informational list, and says why', () => {
    const deadCode = view.signals[1].groups.find((group) => group.id === 'deadCode');

    expect(deadCode?.actionable).toBe(false);
    expect(deadCode?.entries[0].proposals).toEqual([]);
    expect(deadCode?.notActionable).toContain('Mapping it as live product behaviour');
    expect(text).toContain('No proposal: The code they cover is unreachable');
  });

  it('counts the proposals it produced', () => {
    expect(view.proposals).toMatchObject({
      mapEntries: 2,
      certain: 1,
      unresolved: 1,
      ambiguous: 0,
    });
    expect(view.proposals.total).toBe(view.proposals.mapEntries + view.proposals.testDrafts);
  });

  it('renders the target, the evidence, the edit and the open question', () => {
    expect(text).toContain('Proposed map entry');
    expect(text).toContain('Add unitTests on zebra');
    expect(text).toContain('certain — evidence names the target');
    expect(text).toContain('unresolved — no target in the report');
    expect(text).toContain('Suggested edit to _admin-panel/platform/coverage-map/map.ts');
    expect(text).toContain('Candidates — pick one by hand');
    expect(text).toContain('Still open:');
    // The preview is the lines a person would type, not a command.
    expect(html).toContain('<pre');
  });

  it('says on every proposal that nothing has been applied', () => {
    expect(text.split('not applied').length - 1).toBe(view.proposals.mapEntries);
    expect(text).toContain('Nothing here has been applied');
    expect(text).toContain('the coverage map is not written to');
  });

  it('is deterministic, and its ids point at findings that are present', () => {
    const again = toDriftView(
      reportWith({
        'product-surface': {
          unmapped: [
            { path: 'app/zebra/page.tsx', kind: 'page', classification: 'unmapped', claimedBy: [] },
          ],
        },
        'test-attribution': {
          unlisted: [testFinding({ inferredFeatures: ['zebra'] })],
          deadCode: [testFinding({ path: '__tests__/dead.test.ts', classification: 'dead-code' })],
        },
      }),
      MEASURED
    );

    expect(again).toEqual(view);

    // Every proposal id names the signal, the list and the reference it came
    // from, and each one resolves to a finding in this very view — there is no
    // id for a finding the current report does not have.
    const labels = new Set(
      view.signals.flatMap((signal) =>
        signal.groups.flatMap((group) =>
          group.entries.map((entry) => `${signal.signal}.${group.id}:${entry.label}`)
        )
      )
    );
    const proposals = view.signals.flatMap((signal) =>
      signal.groups.flatMap((group) => group.entries.flatMap((entry) => entry.proposals))
    );

    expect(proposals.length).toBeGreaterThan(0);
    for (const proposal of proposals) {
      expect(labels, `${proposal.id} is dangling`).toContain(
        `${proposal.signal}.${proposal.group}:${proposal.reference}`
      );
    }
  });

  it('keeps a healthy report free of actions', () => {
    const healthy = toDriftView({ ...reportWith(), ok: true }, MEASURED);
    const clean = textOf(renderToStaticMarkup(<DriftReportView view={healthy} />));

    expect(healthy.proposals.mapEntries).toBe(0);
    expect(clean).toContain('No drift found');
    expect(clean).toContain('Nothing to propose');
    expect(clean).not.toContain('Proposed map entry');
    expect(clean).not.toContain('Still open:');
  });
});

describe('nothing can be applied', () => {
  it('cannot write, move or delete a file', () => {
    for (const file of [PROPOSALS, PROPOSAL_TYPES, VIEW, COMPONENT, DRIFT_PAGE]) {
      const source = read(file);

      for (const forbidden of [
        'writeFileSync',
        'writeFile',
        'appendFile',
        'renameSync',
        'unlink',
        'rmSync',
        'mkdirSync',
        'copyFile',
      ]) {
        expect(source, `${file} must not call ${forbidden}`).not.toContain(forbidden);
      }
    }
    // The proposal engine reaches for no filesystem or process module at all.
    expect(read(PROPOSALS)).not.toMatch(/from 'node:/);
    expect(read(PROPOSAL_TYPES)).not.toMatch(/from 'node:/);
  });

  it('runs no git command and no shell', () => {
    for (const file of [PROPOSALS, VIEW, COMPONENT, DRIFT_PAGE]) {
      const source = read(file);

      expect(source).not.toMatch(/child_process|execSync|spawnSync|spawn\(/);
      expect(source).not.toMatch(/\bgit (add|commit|checkout|apply|mv|rm)\b/);
    }
  });

  it('does not touch the coverage map it proposes edits to', () => {
    const before = statSync(path.join(process.cwd(), COVERAGE_MAP_FILE));
    const source = read(COVERAGE_MAP_FILE);

    buildDriftView();

    const after = statSync(path.join(process.cwd(), COVERAGE_MAP_FILE));
    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(after.size).toBe(before.size);
    expect(read(COVERAGE_MAP_FILE)).toBe(source);
  });

  it('writes no draft into the test directory', () => {
    const before = readdirSync(path.join(process.cwd(), TESTS_DIR)).sort();
    const view = buildDriftView();

    expect(view.testDrafts.length).toBeGreaterThan(0);
    for (const draft of view.testDrafts) {
      // The suggested path is a suggestion. Nothing created it.
      expect(existsSync(path.join(process.cwd(), draft.suggestedPath))).toBe(false);
    }
    expect(readdirSync(path.join(process.cwd(), TESTS_DIR)).sort()).toEqual(before);
  });

  it('exposes no route that generates or applies a proposal', () => {
    // There is nothing to submit: proposals are built during the page's own
    // render, so no endpoint takes a finding id, a path or a template.
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]
      );

    for (const file of walk(path.join(process.cwd(), PLATFORM_API_DIR))) {
      const source = readFileSync(file, 'utf8');
      // Item 19's routes do import from `platform/drift` — for quarantine and
      // the audit trail — so this is matched against the proposal engine's own
      // names rather than against the module path.
      expect(source, `${file} must not reach the proposal engine`).not.toMatch(
        /propose[A-Z]\w*\(|buildDriftView|TestDraftProposal|MapEntryProposal/
      );
    }
  });

  it('takes no input at all, so there is no finding id to forge', () => {
    const page = read(DRIFT_PAGE);

    expect(page).toContain('buildDriftView()');
    // The page's own signature: no props, so no route parameter, no query and
    // no body reaches the proposals. (Item 19's panel makes its own requests;
    // this is about the page that renders the proposals.)
    expect(page).toMatch(/export default async function AdminPlatformDriftPage\(\) \{/);
    expect(page).not.toMatch(/searchParams|formData|await request/);

    // The proposal view itself is still a server component with no control of
    // any kind; item 19's destructive panel is a separate file, by design.
    const source = read(COMPONENT);
    expect(source).not.toMatch(/'use client'|'use server'|onClick|onSubmit|useState|fetch\(/);
    for (const control of ['<button', '<input', '<form', '<select', '<textarea']) {
      expect(source, `${control} belongs to no part of item 18`).not.toContain(control);
    }
  });

  it('offers nothing that sounds like applying it', () => {
    const html = renderToStaticMarkup(
      <DriftReportView
        view={toDriftView(
          reportWith({
            'test-attribution': { unlisted: [testFinding({ inferredFeatures: ['zebra'] })] },
          }),
          MEASURED
        )}
      />
    );

    // The page may say what it does *not* do; it must offer no way to do it.
    expect(html).not.toMatch(/Apply|Accept|Merge|Quarantine|Save to source/);
  });
});

describe('the real repository, through the page’s own path', () => {
  const view = buildDriftView();
  const text = textOf(renderToStaticMarkup(<DriftReportView view={view} />));

  it('proposes only what the real evidence supports', () => {
    // The tree is clean, so there is no contradiction to act on. What remains
    // is the one test the graph attributes to a feature that does not list it,
    // and the features with no unit test at all.
    expect(view.ok).toBe(true);
    expect(view.proposals.mapEntries).toBe(1);
    expect(view.proposals.testDrafts).toBe(
      COVERAGE_MAP.filter((entry) => entry.unitTests.length === 0).length
    );
    expect(view.proposals.total).toBeGreaterThan(0);
  });

  it('derives that map entry from the import graph, not from a name', () => {
    const proposals: MapEntryProposal[] = view.signals.flatMap((signal) =>
      signal.groups.flatMap((group) => group.entries.flatMap((entry) => entry.proposals))
    );
    const [proposal] = proposals;

    expect(proposal.signal).toBe('test-attribution');
    expect(proposal.group).toBe('unlisted');
    expect(proposal.field).toBe('unitTests');
    // The target is a feature in the real map, and the reference a real file.
    expect(COVERAGE_MAP.map((entry) => entry.id)).toContain(proposal.featureId);
    expect(existsSync(path.join(process.cwd(), proposal.reference))).toBe(true);
    // Each path in the evidence is one the proposed feature really claims.
    const owner = COVERAGE_MAP.find((entry) => entry.id === proposal.featureId)!;
    const quoted = proposal.evidence
      .join(' ')
      .match(/[\w./-]+\.tsx?/g)!
      .filter((match) => match.startsWith('services/') || match.startsWith('lib/'));
    expect(quoted.length).toBeGreaterThan(0);
    for (const claimed of quoted) {
      expect(
        owner.codeLocations.some((location) => claimed.startsWith(location)),
        `${claimed} is not claimed by ${owner.id}`
      ).toBe(true);
    }
  });

  it('drafts a test for the real feature that has none', () => {
    const [draft] = view.testDrafts;
    const bare = COVERAGE_MAP.filter((entry) => entry.unitTests.length === 0);

    expect(draft.featureId).toBe(bare[0].id);
    expect(draft.draft).toContain(bare[0].userDescription.split('. ')[0]);
    expect(draft.draft).toContain('it.todo(');
    expect(existsSync(path.join(process.cwd(), draft.suggestedPath))).toBe(false);
  });

  it('shows it all on the page, and claims nothing is applied', () => {
    expect(text).toContain('Proposals');
    expect(text).toContain('Review only');
    expect(text).toContain('Draft tests');
    expect(text).toContain('Nothing here has been applied');
    expect(text).toContain('not written');
  });

  it('leaves the rest of the platform alone', () => {
    for (const file of [
      '_admin-panel/platform/coverage-map/map.ts',
      '_admin-panel/platform/scan/report.ts',
      '_admin-panel/platform/tests/runner.ts',
      'app/admin/(dashboard)/developer/page.tsx',
    ]) {
      expect(existsSync(path.join(process.cwd(), file)), file).toBe(true);
      expect(read(file), `${file} must not know about proposals`).not.toMatch(
        /platform\/drift|proposeFor|TestDraftProposal/
      );
    }
  });
}, 60_000);
