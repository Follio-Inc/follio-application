/**
 * Drift scan, signals 4–6: AI stages, feature flags and Prisma models
 * (PLATFORM_TODO item 7).
 *
 * The thing worth proving here is not that the numbers are right today — it is
 * that they come out of the repository. So every discovery is also run against
 * a synthetic tree written to a temp directory: a fake `MAX_TOKENS` with
 * invented keys, a fake flag module, a fake schema. If any of the three were
 * hardcoded, those assertions would return the real names instead of the fake
 * ones and fail.
 *
 * The real-tree counts are pinned as item 7 asks, so adding a stage, a flag or
 * a model is a visible diff rather than a silent one.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { COVERAGE_MAP } from '@/_admin-panel/platform/coverage-map';
import type { PlatformFeature } from '@/_admin-panel/platform/coverage-map';
import {
  DEFINITION_SITES,
  collectSourceFacts,
  delegateFor,
  discoverAiStages,
  discoverFeatureFlags,
  discoverPrismaModels,
  discoverSourceFiles,
  runDriftScan,
  scanAiStages,
  scanFeatureFlags,
  scanLiveQaPathways,
  scanPrismaModels,
  scanProductSurface,
  scanTestAttribution,
} from '@/_admin-panel/platform/scan';

/** Counts on the current tree. Item 7: adding one must be a visible diff. */
const EXPECTED = { stages: 11, flags: 1, models: 31 } as const;

function feature(overrides: Partial<PlatformFeature>): PlatformFeature {
  return {
    id: 'stub',
    name: 'Stub',
    userDescription: 'A stub feature used to exercise item-7 attribution in isolation.',
    codeLocations: ['lib/utils.ts'],
    category: 'Builder',
    status: 'shipped',
    unitTests: [],
    pathways: [],
    ...overrides,
  };
}

/**
 * A throwaway repository with only the files a discovery reads.
 *
 * The names below appear nowhere in the real tree, which is the point: a
 * scanner that returned them proves it read these files.
 */
const fakeRepos: string[] = [];

function fakeRepo(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'follio-platform-scan-'));
  fakeRepos.push(root);

  for (const [relativePath, contents] of Object.entries(files)) {
    const absolute = path.join(root, relativePath);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents, 'utf8');
  }

  return root;
}

afterAll(() => {
  for (const root of fakeRepos) rmSync(root, { recursive: true, force: true });
});

describe('definition sites', () => {
  it('points at files that exist', () => {
    for (const relativePath of [
      DEFINITION_SITES.aiClient,
      DEFINITION_SITES.featureFlags,
      DEFINITION_SITES.prismaSchema,
    ]) {
      expect(existsSync(path.join(process.cwd(), relativePath)), relativePath).toBe(true);
    }
  });
});

describe('source file discovery', () => {
  it('walks the product roots and nothing else', () => {
    const files = discoverSourceFiles();

    expect(files.length).toBeGreaterThan(400);
    expect(files).toEqual([...files].sort());
    for (const file of files) {
      expect(file).toMatch(/\.tsx?$/);
      // Tests and operator tooling are not product usage.
      expect(file.startsWith('__tests__/')).toBe(false);
      expect(file.startsWith('_admin-panel/')).toBe(false);
    }
    expect(files).toContain(DEFINITION_SITES.aiClient);
    expect(files).toContain(DEFINITION_SITES.featureFlags);
  });

  it('discovers deterministically', () => {
    expect(discoverSourceFiles()).toEqual(discoverSourceFiles());
  });
});

describe('MAX_TOKENS discovery', () => {
  const stages = discoverAiStages();

  it('reads every key out of the real budget', () => {
    expect(stages).toHaveLength(EXPECTED.stages);
    expect(stages).toEqual([
      'agentTurn',
      'contentTransform',
      'designBrief',
      'evidenceExtraction',
      'follioVoice',
      'narrativeGeneration',
      'portfolioStrategy',
      'profileUnderstanding',
      'resumeParse',
      'snapViewGeneration',
      'validation',
    ]);
  });

  it('invents nothing the budget does not define', () => {
    // These two have been proposed and do not exist on this branch. If the
    // scanner ever reports one, it stopped reading the source.
    expect(stages).not.toContain('resumeGlance');
    expect(stages).not.toContain('jdAlign');
    expect(stages.filter((stage) => /glance/i.test(stage))).toEqual([]);
  });

  it('comes from the source file, not from this scanner', () => {
    const root = fakeRepo({
      [DEFINITION_SITES.aiClient]: [
        'const MAX_TOKENS = {',
        '  zebraStage: 1,',
        "  'quoted-stage': 2,",
        '} as const;',
        'export const unrelated = { profileUnderstanding: 3 };',
      ].join('\n'),
    });

    // The fake keys, and none of the real ones — including the real key that
    // appears in the file inside a different object.
    expect(discoverAiStages(root)).toEqual(['quoted-stage', 'zebraStage']);
  });

  it('reports nothing when the budget is not where it should be', () => {
    expect(discoverAiStages(fakeRepo({ 'lib/other.ts': 'export const x = 1;' }))).toEqual([]);
  });
});

describe('feature flag discovery', () => {
  const flags = discoverFeatureFlags();

  it('reads the real flag and the helpers that gate on it', () => {
    expect(flags).toHaveLength(EXPECTED.flags);
    expect(flags[0].flag).toBe('NEXT_PUBLIC_PORTFOLIO_ENABLED');
    // `assertPortfolioEnabled` reads no env var itself — it calls
    // `isPortfolioEnabled`. Both must resolve to the flag.
    expect(flags[0].helpers).toEqual(['assertPortfolioEnabled', 'isPortfolioEnabled']);
  });

  it('comes from the flag module, not from this scanner', () => {
    const root = fakeRepo({
      [DEFINITION_SITES.featureFlags]: [
        'export function isZebraEnabled(): boolean {',
        "  return process.env.NEXT_PUBLIC_ZEBRA_ENABLED === 'true';",
        '}',
        'export function assertZebraEnabled(): void {',
        '  if (!isZebraEnabled()) throw new Error("off");',
        '}',
        'function privateHelper(): boolean {',
        "  return process.env.NEXT_PUBLIC_HIDDEN_ENABLED === 'true';",
        '}',
        'export const zebraArrow = () => privateHelper();',
      ].join('\n'),
    });

    expect(discoverFeatureFlags(root)).toEqual([
      // Read only by a non-exported helper, so no exported helper names it —
      // still a declared flag, with no helper of its own.
      { flag: 'NEXT_PUBLIC_HIDDEN_ENABLED', helpers: ['zebraArrow'] },
      { flag: 'NEXT_PUBLIC_ZEBRA_ENABLED', helpers: ['assertZebraEnabled', 'isZebraEnabled'] },
    ]);
  });

  it('reports nothing when the flag module is absent', () => {
    expect(discoverFeatureFlags(fakeRepo({ 'lib/other.ts': 'export const x = 1;' }))).toEqual([]);
  });
});

describe('Prisma model discovery', () => {
  const models = discoverPrismaModels();

  it('reads every model out of the real schema', () => {
    expect(models).toHaveLength(EXPECTED.models);
    expect(models).toContain('User');
    expect(models).toContain('Profile');
    expect(models).toEqual([...models].sort());
    // `enum` and `type` blocks are not models.
    expect(models).not.toContain('PhotoCategory');
    expect(models).not.toContain('PortfolioStatus');
  });

  it('maps a model to the Prisma client property, preserving inner caps', () => {
    expect(delegateFor('GitHubProfile')).toBe('gitHubProfile');
    expect(delegateFor('YouTubeVideo')).toBe('youTubeVideo');
    expect(delegateFor('User')).toBe('user');
  });

  it('comes from the schema file, not from this scanner', () => {
    const root = fakeRepo({
      [DEFINITION_SITES.prismaSchema]: [
        'model Zebra {',
        '  id String @id',
        '}',
        'enum NotAModel {',
        '  A',
        '}',
        '// model CommentedOut {',
        'model Giraffe {',
        '  id String @id',
        '}',
      ].join('\n'),
    });

    expect(discoverPrismaModels(root)).toEqual(['Giraffe', 'Zebra']);
  });

  it('reports nothing when the schema is absent', () => {
    expect(discoverPrismaModels(fakeRepo({ 'lib/other.ts': 'export const x = 1;' }))).toEqual([]);
  });
});

describe('source facts', () => {
  const facts = collectSourceFacts();

  it('finds a call site for every budgeted stage', () => {
    for (const stage of discoverAiStages()) {
      expect(facts.stageReferences.get(stage), `no call site for ${stage}`).toBeDefined();
    }
  });

  it('never counts the declaring module as a call site', () => {
    // `MAX_TOKENS[stage]` inside the client names no stage, so the budget's own
    // file must not appear as a user of any of its keys.
    for (const files of facts.stageReferences.values()) {
      expect(files).not.toContain(DEFINITION_SITES.aiClient);
    }
  });

  it('finds a query site for every schema model', () => {
    for (const model of discoverPrismaModels()) {
      expect(
        facts.delegateReferences.get(delegateFor(model)),
        `no query site for ${model}`
      ).toBeDefined();
    }
  });

  it('keeps every file list sorted and deduplicated', () => {
    for (const index of [facts.stageReferences, facts.envReferences, facts.delegateReferences]) {
      for (const [key, files] of index) {
        expect(files, key).toEqual([...files].sort());
        expect(new Set(files).size, key).toBe(files.length);
      }
    }
  });

  it('reads references out of the files it is given', () => {
    const facts = collectSourceFacts({
      repoRoot: fakeRepo({
        'lib/thing.ts': [
          "const used = process.env.NEXT_PUBLIC_ZEBRA_ENABLED === 'true';",
          "await callAI({ stage: 'zebraStage' });",
          'await prisma.zebra.findMany();',
          'await somethingElse.zebra.label;',
        ].join('\n'),
      }),
      files: ['lib/thing.ts'],
    });

    expect([...facts.envReferences.keys()]).toEqual(['NEXT_PUBLIC_ZEBRA_ENABLED']);
    expect([...facts.stageReferences.keys()]).toEqual(['zebraStage']);
    // A field read on the same name is not a model query.
    expect([...facts.delegateReferences.keys()]).toEqual(['zebra']);
    expect(facts.delegateReferences.get('zebra')).toEqual(['lib/thing.ts']);
  });
});

describe('scanAiStages on the real tree', () => {
  const report = scanAiStages();

  it('classifies every budgeted stage exactly once', () => {
    expect(report.summary.total).toBe(EXPECTED.stages);
    expect(report.stages).toHaveLength(EXPECTED.stages);
    expect(report.summary.mapped + report.summary.unclaimed).toBe(EXPECTED.stages);
    expect([...report.mapped, ...report.unclaimed]).toHaveLength(EXPECTED.stages);
  });

  it('finds no stale or unbudgeted reference', () => {
    expect(report.stale).toEqual([]);
    expect(report.unbudgetedStages).toEqual([]);
    expect(report.summary.unused).toBe(0);
  });

  it('leaves the shared agent runtime unclaimed rather than inventing an owner', () => {
    // `lib/agents` is deliberately claimed by no feature — see map.ts. The
    // stage it uses must therefore have no owner, not a guessed one.
    const agentTurn = report.stages.find((finding) => finding.stage === 'agentTurn');

    expect(agentTurn?.classification).toBe('unclaimed');
    expect(agentTurn?.inferredFeatures).toEqual([]);
    expect(agentTurn?.usedBy.length).toBeGreaterThan(0);
  });

  it('never requires a stage of a feature that calls no AI client', () => {
    // Item 7's note: a MAX_TOKENS key is one input, never the gate. jd-match is
    // shipped, in the AI category, and matches lexically.
    expect(report.aiFeaturesWithoutClient).toContain('jd-match');
    expect(report.aiFeaturesWithoutStage).not.toContain('jd-match');
    expect(report.stale.map((entry) => entry.featureId)).not.toContain('jd-match');
  });

  it('attributes a declared stage to the feature whose code calls it', () => {
    const follioVoice = report.stages.find((finding) => finding.stage === 'follioVoice');

    expect(follioVoice?.declaredFeatures).toContain('follio-voice');
    expect(follioVoice?.inferredFeatures).toContain('follio-voice');
    expect(follioVoice?.classification).toBe('mapped');
  });

  it('produces an identical report on a second run', () => {
    expect(scanAiStages()).toEqual(report);
  }, 30_000);
});

describe('scanAiStages on synthetic input', () => {
  const facts = collectSourceFacts({
    repoRoot: process.cwd(),
    files: [DEFINITION_SITES.aiClient, 'lib/agents/runtime.ts'],
  });

  it('reports a feature declaring a stage the budget does not define', () => {
    const report = scanAiStages({
      stages: ['agentTurn'],
      features: [
        // `resumeGlance` does not exist on this branch and never has.
        feature({
          id: 'owner',
          codeLocations: ['lib/agents'],
          aiStages: ['agentTurn', 'resumeGlance'],
        }),
      ],
      sourceFacts: facts,
    });

    expect(report.stale).toEqual([
      { featureId: 'owner', stage: 'resumeGlance', reason: 'unknown-stage' },
    ]);
  });

  it('reports a feature declaring a stage its own code never calls', () => {
    const report = scanAiStages({
      stages: ['agentTurn'],
      // `lib/agents/runtime.ts` is the only call site and this feature does not
      // claim it, so the declaration has nothing behind it.
      features: [
        feature({ id: 'owner', codeLocations: ['lib/utils.ts'], aiStages: ['agentTurn'] }),
      ],
      sourceFacts: facts,
    });

    expect(report.stale).toEqual([
      { featureId: 'owner', stage: 'agentTurn', reason: 'no-usage-link' },
    ]);
  });

  it('reports a budgeted stage nothing calls', () => {
    const report = scanAiStages({
      stages: ['neverCalled'],
      features: [feature({ id: 'owner' })],
      sourceFacts: facts,
    });

    expect(report.unused.map((finding) => finding.stage)).toEqual(['neverCalled']);
    expect(report.summary.unused).toBe(1);
    expect(report.stale).toEqual([]);
  });

  it('reports a call site naming a stage with no budget', () => {
    const report = scanAiStages({
      stages: [],
      features: [feature({ id: 'owner', codeLocations: ['lib/agents'] })],
      sourceFacts: facts,
    });

    expect(report.unbudgetedStages).toEqual(['agentTurn']);
    expect(report.summary.total).toBe(0);
  });

  it('is order-independent across features', () => {
    const features = [
      feature({ id: 'zulu', codeLocations: ['lib/agents'], aiStages: ['agentTurn'] }),
      feature({ id: 'alpha', codeLocations: ['lib/agents/runtime.ts'], aiStages: ['agentTurn'] }),
    ];

    const forward = scanAiStages({ stages: ['agentTurn'], features, sourceFacts: facts });
    const reversed = scanAiStages({
      stages: ['agentTurn'],
      features: [...features].reverse(),
      sourceFacts: facts,
    });

    expect(forward.stages[0].declaredFeatures).toEqual(['alpha', 'zulu']);
    expect(forward.stages[0].inferredFeatures).toEqual(['alpha', 'zulu']);
    expect(reversed).toEqual(forward);
  });
});

describe('scanFeatureFlags on the real tree', () => {
  const report = scanFeatureFlags();

  it('finds the one declared flag and no drift', () => {
    expect(report.summary.total).toBe(EXPECTED.flags);
    expect(report.stale).toEqual([]);
    expect(report.summary.unenforced).toBe(0);
  });

  it('keeps portfolio as the flag-gated feature', () => {
    const finding = report.flags.find((entry) => entry.flag === 'NEXT_PUBLIC_PORTFOLIO_ENABLED');

    expect(finding?.declaredFeatures).toEqual(['portfolio']);
    expect(finding?.classification).toBe('mapped');
    expect(finding?.enforcedIn.length).toBeGreaterThan(1);
    expect(finding?.enforcedIn).not.toContain(DEFINITION_SITES.featureFlags);
  });

  it('records partial gating without calling it drift', () => {
    // `public-follio` gates one door on the portfolio flag and deliberately
    // sets no `flag`, because `flag` means the whole feature is off.
    expect(report.partiallyGated.map((entry) => entry.featureId)).toContain('public-follio');
    expect(COVERAGE_MAP.find((entry) => entry.id === 'public-follio')?.flag).toBeUndefined();
    expect(report.stale.map((entry) => entry.featureId)).not.toContain('public-follio');
  });

  it('produces an identical report on a second run', () => {
    expect(scanFeatureFlags()).toEqual(report);
  }, 30_000);
});

describe('scanFeatureFlags on synthetic input', () => {
  const facts = collectSourceFacts({
    repoRoot: process.cwd(),
    files: [DEFINITION_SITES.featureFlags, 'lib/active-profile.ts'],
  });

  it('reports a feature naming a flag the flag module does not declare', () => {
    const report = scanFeatureFlags({
      flags: [{ flag: 'NEXT_PUBLIC_REAL_ENABLED', helpers: [] }],
      features: [feature({ id: 'owner', status: 'flagged', flag: 'NEXT_PUBLIC_GHOST_ENABLED' })],
      sourceFacts: facts,
    });

    expect(report.stale).toEqual([
      { featureId: 'owner', flag: 'NEXT_PUBLIC_GHOST_ENABLED', reason: 'unknown-flag' },
    ]);
  });

  it('reports a feature naming a flag its own code never gates on', () => {
    const report = scanFeatureFlags({
      flags: [{ flag: 'NEXT_PUBLIC_PORTFOLIO_ENABLED', helpers: ['isPortfolioEnabled'] }],
      features: [
        feature({
          id: 'owner',
          codeLocations: ['lib/utils.ts'],
          status: 'flagged',
          flag: 'NEXT_PUBLIC_PORTFOLIO_ENABLED',
        }),
      ],
      sourceFacts: facts,
    });

    expect(report.stale).toEqual([
      {
        featureId: 'owner',
        flag: 'NEXT_PUBLIC_PORTFOLIO_ENABLED',
        reason: 'no-enforcement-link',
      },
    ]);
  });

  it('reports a declared flag nothing outside the flag module reads', () => {
    const report = scanFeatureFlags({
      flags: [{ flag: 'NEXT_PUBLIC_UNUSED_ENABLED', helpers: [] }],
      features: [feature({ id: 'owner' })],
      sourceFacts: facts,
    });

    expect(report.unenforced.map((finding) => finding.flag)).toEqual([
      'NEXT_PUBLIC_UNUSED_ENABLED',
    ]);
    expect(report.unclaimed.map((finding) => finding.flag)).toEqual(['NEXT_PUBLIC_UNUSED_ENABLED']);
    expect(report.stale).toEqual([]);
  });

  it('finds enforcement through a helper import, not only a direct env read', () => {
    const report = scanFeatureFlags({
      flags: [{ flag: 'NEXT_PUBLIC_PORTFOLIO_ENABLED', helpers: ['isPortfolioEnabled'] }],
      // lib/active-profile.ts imports the helper; it never reads the env var.
      features: [feature({ id: 'owner', codeLocations: ['lib/active-profile.ts'] })],
      sourceFacts: facts,
    });

    expect(report.flags[0].enforcedIn).toEqual(['lib/active-profile.ts']);
    expect(report.flags[0].inferredFeatures).toEqual(['owner']);
  });
});

describe('scanPrismaModels on the real tree', () => {
  const report = scanPrismaModels();

  it('classifies every schema model exactly once', () => {
    expect(report.summary.total).toBe(EXPECTED.models);
    expect(report.models).toHaveLength(EXPECTED.models);
    expect(report.summary.mapped + report.summary.unclaimed).toBe(EXPECTED.models);
    expect(new Set(report.models.map((finding) => finding.model)).size).toBe(EXPECTED.models);
  });

  it('finds no stale reference and no unqueried model', () => {
    expect(report.stale).toEqual([]);
    expect(report.summary.unused).toBe(0);
  });

  it('names the model no product feature queries', () => {
    // `Admin` is reached only from the excluded admin surfaces.
    expect(report.unclaimed.map((finding) => finding.model)).toEqual(['Admin']);
    expect(report.unclaimed[0].usedBy.length).toBeGreaterThan(0);
  });

  it('leaves the shared tables declared by nobody, and says so', () => {
    const undeclared = report.undeclared.map((finding) => finding.model);

    expect(undeclared).toContain('Profile');
    expect(undeclared).toContain('User');
    // Reported as a gap, never as a contradiction.
    expect(report.stale).toEqual([]);
  });

  it('produces an identical report on a second run', () => {
    expect(scanPrismaModels()).toEqual(report);
  }, 30_000);
});

describe('scanPrismaModels on synthetic input', () => {
  const facts = collectSourceFacts({
    repoRoot: process.cwd(),
    files: ['lib/share-token.ts'],
  });

  it('reports a feature declaring a model the schema does not have', () => {
    const report = scanPrismaModels({
      models: ['ShareToken'],
      features: [
        feature({
          id: 'owner',
          codeLocations: ['lib/share-token.ts'],
          prismaModels: ['ShareToken', 'ResumeGlance'],
        }),
      ],
      sourceFacts: facts,
    });

    expect(report.stale).toEqual([
      { featureId: 'owner', model: 'ResumeGlance', reason: 'unknown-model' },
    ]);
  });

  it('reports a feature declaring a model its own code never queries', () => {
    const report = scanPrismaModels({
      models: ['ShareToken'],
      features: [
        feature({ id: 'owner', codeLocations: ['lib/utils.ts'], prismaModels: ['ShareToken'] }),
      ],
      sourceFacts: facts,
    });

    expect(report.stale).toEqual([
      { featureId: 'owner', model: 'ShareToken', reason: 'no-usage-link' },
    ]);
  });

  it('reports a schema model no query names', () => {
    const report = scanPrismaModels({
      models: ['NeverQueried'],
      features: [feature({ id: 'owner' })],
      sourceFacts: facts,
    });

    expect(report.unused.map((finding) => finding.model)).toEqual(['NeverQueried']);
    expect(report.unclaimed.map((finding) => finding.model)).toEqual(['NeverQueried']);
    expect(report.stale).toEqual([]);
  });

  it('is order-independent across features and models', () => {
    const models = ['ShareToken', 'Profile'];
    const features = [
      feature({ id: 'zulu', codeLocations: ['lib/share-token.ts'] }),
      feature({ id: 'alpha', codeLocations: ['lib'] }),
    ];

    const forward = scanPrismaModels({ models, features, sourceFacts: facts });
    const reversed = scanPrismaModels({
      models: [...models].reverse(),
      features: [...features].reverse(),
      sourceFacts: facts,
    });

    expect(forward.models.map((finding) => finding.model)).toEqual(['Profile', 'ShareToken']);
    expect(forward.models[1].inferredFeatures).toEqual(['alpha', 'zulu']);
    expect(reversed).toEqual(forward);
  });
});

// Each of these runs the whole drift scan, which since item 8 parses the
// ~670-file source tree to classify reachability. The first call in a worker
// takes a couple of seconds, so the suite gets room beyond the 5s default; the
// assertions are unchanged.
describe('drift report integration', { timeout: 30_000 }, () => {
  const report = runDriftScan();

  it('carries the three item-7 signals after the existing three', () => {
    // The first six in order; item 8 appended its own signals after them,
    // which is the point of the discriminated union.
    expect(report.signals.slice(0, 6).map((signal) => signal.signal)).toEqual([
      'product-surface',
      'test-attribution',
      'live-qa-pathways',
      'ai-stages',
      'feature-flags',
      'prisma-models',
    ]);
  });

  it('leaves the three landed signals byte-identical', () => {
    // Items 4–6's baselines must not move because item 7 landed.
    expect(report.signals.find((signal) => signal.signal === 'product-surface')).toEqual(
      scanProductSurface()
    );
    expect(report.signals.find((signal) => signal.signal === 'test-attribution')).toEqual(
      scanTestAttribution()
    );
    expect(report.signals.find((signal) => signal.signal === 'live-qa-pathways')).toEqual(
      scanLiveQaPathways()
    );
  });

  it('keeps the product-surface baseline', () => {
    const surface = report.signals.find((signal) => signal.signal === 'product-surface');

    expect(surface?.signal === 'product-surface' && surface.summary).toEqual({
      total: 146,
      mapped: 127,
      excluded: 19,
      unmapped: 0,
      pages: 44,
      routes: 102,
    });
  });

  it('keeps the Live QA baseline', () => {
    const pathways = report.signals.find((signal) => signal.signal === 'live-qa-pathways');

    expect(pathways?.signal === 'live-qa-pathways' && pathways.summary).toMatchObject({
      total: 9,
      mapped: 9,
      unmapped: 0,
      missingSpec: 0,
      orphanSpecs: 0,
    });
    expect(pathways?.signal === 'live-qa-pathways' && pathways.stale).toEqual([]);
  });

  it('keeps test attribution free of contradictions', () => {
    const tests = report.signals.find((signal) => signal.signal === 'test-attribution');

    expect(tests?.signal === 'test-attribution' && tests.stale).toEqual([]);
    expect(tests?.signal === 'test-attribution' && tests.misattributed).toEqual([]);
    expect(tests?.signal === 'test-attribution' && tests.summary.unresolvable).toBe(0);
  });

  it('reports no drift on the current tree', () => {
    expect(report.ok).toBe(true);
  });

  it('does not fail the scan for unclaimed stages, models or partial gating', () => {
    const aiStages = report.signals.find((signal) => signal.signal === 'ai-stages');
    const prisma = report.signals.find((signal) => signal.signal === 'prisma-models');
    const flags = report.signals.find((signal) => signal.signal === 'feature-flags');

    // Each of these is non-empty on the current tree, and `ok` is still true.
    expect(aiStages?.signal === 'ai-stages' && aiStages.unclaimed.length).toBeGreaterThan(0);
    expect(prisma?.signal === 'prisma-models' && prisma.unclaimed.length).toBeGreaterThan(0);
    expect(flags?.signal === 'feature-flags' && flags.partiallyGated.length).toBeGreaterThan(0);
    expect(report.ok).toBe(true);
  });

  it('fails the scan for a stale stage, flag or model reference', () => {
    for (const overrides of [
      { aiStages: ['resumeGlance'] },
      { status: 'flagged' as const, flag: 'NEXT_PUBLIC_GHOST_ENABLED' },
      { prismaModels: ['ResumeGlance'] },
    ]) {
      const drifted = runDriftScan({
        features: [...COVERAGE_MAP, feature({ id: 'ghost', ...overrides })],
      });

      expect(drifted.ok, JSON.stringify(overrides)).toBe(false);
    }
  }, 30_000);

  it('produces an identical report on a second run', () => {
    expect(runDriftScan()).toEqual(report);
  }, 30_000);
});
