import { scanAiStages, type AiStageScanOptions } from './ai-stages';
import { scanCategoryHealth, type CategoryHealthOptions } from './categories';
import { scanFeatureFlags, type FlagScanOptions } from './flags';
import { scanMapReferences, type MapReferenceScanOptions } from './map-references';
import { buildModuleGraph } from './module-graph';
import { scanLiveQaPathways, type PathwayScanOptions } from './pathways';
import { scanPrismaModels, type PrismaScanOptions } from './prisma-models';
import { scanReachability, type ReachabilityScanOptions } from './reachability';
import {
  cacheSourceFacts,
  collectSourceFacts,
  createSourceFactsSink,
  discoverSourceFiles,
  type SourceFactsOptions,
} from './source-facts';
import { scanProductSurface, type SurfaceScanOptions } from './surface';
import { scanTestAttribution, type TestScanOptions } from './tests';
import type {
  AiStageScanReport,
  CategoryHealthReport,
  DriftReport,
  FeatureContradiction,
  FlagScanReport,
  MapReferenceScanReport,
  PathwayScanReport,
  PrismaScanReport,
  ReachabilityScanReport,
  SurfaceScanReport,
  TestScanReport,
} from './types';

/**
 * Assembling and rendering the drift report.
 *
 * Output is deterministic: no timestamps, no absolute paths, and every list
 * pre-sorted by its signal. Two runs over the same tree produce byte-identical
 * text, so the report can be diffed between commits or pasted into a CI summary.
 *
 * Pure string building — no process access, so the UI (item 17) can render the
 * same report without going through the CLI.
 */

export type DriftScanOptions = SurfaceScanOptions &
  TestScanOptions &
  PathwayScanOptions &
  AiStageScanOptions &
  FlagScanOptions &
  PrismaScanOptions &
  ReachabilityScanOptions &
  MapReferenceScanOptions &
  CategoryHealthOptions &
  Pick<SourceFactsOptions, 'files'>;

/**
 * Contradictions the signals found, attributed to a feature.
 *
 * Collected so category health can say which areas are actually in trouble
 * without re-deriving anything. Only findings that name a feature appear:
 * unmapped surface belongs to nobody by definition, and a reachability
 * disagreement is about a module, not a feature.
 */
function featureContradictions(
  tests: TestScanReport,
  pathways: PathwayScanReport,
  aiStages: AiStageScanReport,
  flags: FlagScanReport,
  prismaModels: PrismaScanReport,
  mapReferences: MapReferenceScanReport
): FeatureContradiction[] {
  const found: FeatureContradiction[] = [
    ...tests.stale.map((entry) => ({
      featureId: entry.featureId,
      signal: 'test-attribution',
      detail: `${entry.testPath} (${entry.reason})`,
    })),
    ...tests.misattributed.flatMap((finding) =>
      finding.declaredFeatures.map((featureId) => ({
        featureId,
        signal: 'test-attribution',
        detail: `${finding.path} (misattributed)`,
      }))
    ),
    ...pathways.stale.map((entry) => ({
      featureId: entry.featureId,
      signal: 'live-qa-pathways',
      detail: `${entry.pathwayId} (${entry.reason})`,
    })),
    ...aiStages.stale.map((entry) => ({
      featureId: entry.featureId,
      signal: 'ai-stages',
      detail: `${entry.stage} (${entry.reason})`,
    })),
    ...flags.stale.map((entry) => ({
      featureId: entry.featureId,
      signal: 'feature-flags',
      detail: `${entry.flag} (${entry.reason})`,
    })),
    ...prismaModels.stale.map((entry) => ({
      featureId: entry.featureId,
      signal: 'prisma-models',
      detail: `${entry.model} (${entry.reason})`,
    })),
    ...mapReferences.missing
      .filter((finding) => finding.featureId !== null)
      .map((finding) => ({
        featureId: finding.featureId!,
        signal: 'map-references',
        detail: `${finding.path} (missing)`,
      })),
  ];

  return found.sort(
    (a, b) =>
      a.featureId.localeCompare(b.featureId) ||
      a.signal.localeCompare(b.signal) ||
      a.detail.localeCompare(b.detail)
  );
}

/** Runs every signal implemented so far. */
export function runDriftScan(options: DriftScanOptions = {}): DriftReport {
  // Signals 4–6 want references from the same ~670 source files, and signals
  // 7–8 want the module graph over those same files. One pass produces both:
  // the graph parses each file and hands the tree to the facts sink, so the
  // CLI parses the tree once rather than nine times. A cached graph never
  // calls the sink, which is why the facts fall back to their own cached pass.
  const repoRoot = options.repoRoot ?? process.cwd();
  const sink = createSourceFactsSink({ repoRoot, files: options.files });
  const graph = options.graph ?? buildModuleGraph({ ...options, onSourceFile: sink.accept });

  let sourceFacts = options.sourceFacts;
  if (!sourceFacts) {
    if (sink.used && options.files === undefined && options.sources === undefined) {
      sourceFacts = sink.finish(discoverSourceFiles(repoRoot));
      // Both passes are memoised per repo root, so priming this one keeps a
      // later standalone `collectSourceFacts()` from parsing the tree again.
      cacheSourceFacts(repoRoot, sourceFacts);
    } else {
      sourceFacts = collectSourceFacts({ repoRoot, files: options.files });
    }
  }

  const shared = { ...options, sourceFacts, graph };

  const surface = scanProductSurface(options);
  const tests = scanTestAttribution(options);
  const pathways = scanLiveQaPathways(options);
  const aiStages = scanAiStages(shared);
  const flags = scanFeatureFlags(shared);
  const prismaModels = scanPrismaModels(shared);
  const reachability = scanReachability(shared);
  const mapReferences = scanMapReferences(shared);
  const categoryHealth = scanCategoryHealth({
    ...options,
    contradictions:
      options.contradictions ??
      featureContradictions(tests, pathways, aiStages, flags, prismaModels, mapReferences),
  });

  return {
    signals: [
      surface,
      tests,
      pathways,
      aiStages,
      flags,
      prismaModels,
      reachability,
      mapReferences,
      categoryHealth,
    ],
    // Drift means the map contradicts the repository. Unmapped surface, a
    // `unitTests` entry the graph cannot support, a map reference to a stage,
    // flag or model the repository does not define, a reachability record the
    // graph disproves, and a `codeLocations` path that is not on disk are all
    // contradictions.
    //
    // So are all three of signal 3's: a feature claiming a pathway id the
    // catalog does not define, a catalogued pathway whose spec file is not on
    // disk, and a spec file under `pathways/` the catalog never names — the
    // last one can never run through the catalog, so it is invisible rather
    // than merely unowned. Items 6 and 8 both said these fail the scan and the
    // expression did not include them, which is the bug PLATFORM_TODO item 17a
    // fixes. Keeping them here rather than in the Drift page is what lets the
    // page pass this flag straight through.
    //
    // Everything else the signals report is a gap, tracked without failing: an
    // unclaimed model, an unused stage, a partially gated feature, a module
    // that has gone dead, a feature owning dead code, a catalogued pathway
    // nobody owns, a feature with no pathway, and a category with no pathway
    // or lab. Category health never fails the scan — a product gap is not a
    // defect, and failing on it would reward writing a pathway to quiet a
    // number rather than to test something.
    ok:
      surface.unmapped.length === 0 &&
      tests.stale.length === 0 &&
      tests.misattributed.length === 0 &&
      pathways.stale.length === 0 &&
      pathways.missingSpec.length === 0 &&
      pathways.orphanSpecs.length === 0 &&
      aiStages.stale.length === 0 &&
      flags.stale.length === 0 &&
      prismaModels.stale.length === 0 &&
      reachability.disagreements.length === 0 &&
      mapReferences.missing.length === 0,
  };
}

function formatSurfaceSignal(report: SurfaceScanReport): string[] {
  const { summary } = report;
  const lines = [
    'Signal: product surface vs coverage map',
    `  discovered  ${summary.total}  (${summary.pages} pages, ${summary.routes} route handlers)`,
    `  mapped      ${summary.mapped}`,
    `  excluded    ${summary.excluded}`,
    `  unmapped    ${summary.unmapped}`,
  ];

  if (report.unmapped.length > 0) {
    lines.push(
      '',
      `Unmapped — each needs a feature codeLocation or an EXCLUDED entry (${report.unmapped.length}):`
    );
    for (const finding of report.unmapped) {
      lines.push(`  ${finding.kind.padEnd(5)} ${finding.path}`);
    }
  }

  if (report.excluded.length > 0) {
    lines.push('', `Excluded on purpose (${report.excluded.length}):`);
    for (const finding of report.excluded) {
      lines.push(`  ${finding.path}  ← ${finding.matchedBy}`);
    }
  }

  return lines;
}

function formatTestSignal(report: TestScanReport): string[] {
  const { summary } = report;
  const lines = [
    'Signal: test attribution via the import graph',
    `  tests          ${summary.total}`,
    `  mapped         ${summary.mapped}   (graph and map agree)`,
    `  unlisted       ${summary.unlisted}   (graph finds a feature the map does not list)`,
    `  misattributed  ${summary.misattributed}   (map lists a feature the graph rejects)`,
    `  uncategorized  ${summary.uncategorized}   (reaches no feature code)`,
    `  dead-code      ${summary.deadCode}   (reaches only orphaned code)`,
    `  source-text    ${summary.sourceText}   (asserts on source, not behavior)`,
    `  unresolvable   ${summary.unresolvable}   (reaches no repo path at all)`,
  ];

  if (report.tests.some((finding) => finding.unresolved.length > 0)) {
    lines.push('', 'Specifiers that resolved to nothing on disk:');
    for (const finding of report.tests.filter((test) => test.unresolved.length > 0)) {
      lines.push(`  ${finding.path}  →  ${finding.unresolved.join(', ')}`);
    }
  }

  if (report.stale.length > 0) {
    lines.push('', `Stale coverage-map unitTests entries (${report.stale.length}):`);
    for (const entry of report.stale) {
      lines.push(`  ${entry.featureId}  ←  ${entry.testPath}  (${entry.reason})`);
    }
  }

  if (report.misattributed.length > 0) {
    lines.push('', `Misattributed tests (${report.misattributed.length}):`);
    for (const finding of report.misattributed) {
      lines.push(
        `  ${finding.path}`,
        `    map says    ${finding.declaredFeatures.join(', ') || '—'}`,
        `    graph says  ${finding.inferredFeatures.join(', ') || '—'}`
      );
    }
  }

  if (report.unlisted.length > 0) {
    lines.push(
      '',
      `Unlisted tests — the graph knows where these belong (${report.unlisted.length}):`
    );
    for (const finding of report.unlisted) {
      lines.push(`  ${finding.path}  →  ${finding.inferredFeatures.join(', ')}`);
    }
  }

  if (report.deadCode.length > 0) {
    lines.push('', `Tests covering orphaned code (${report.deadCode.length}):`);
    for (const finding of report.deadCode) {
      lines.push(`  ${finding.path}`);
    }
  }

  if (report.uncategorized.length > 0) {
    lines.push('', `Uncategorized tests (${report.uncategorized.length}):`);
    for (const finding of report.uncategorized) {
      lines.push(`  ${finding.path}`);
    }
  }

  return lines;
}

function formatPathwaySignal(report: PathwayScanReport): string[] {
  const { summary } = report;
  const lines = [
    'Signal: Live QA pathways vs coverage map',
    `  pathways       ${summary.total}`,
    `  mapped         ${summary.mapped}   (a feature claims it)`,
    `  unmapped       ${summary.unmapped}   (catalogued, no feature claims it)`,
    `  missing spec   ${summary.missingSpec}   (catalog entry, no file on disk)`,
    `  orphan specs   ${summary.orphanSpecs}   (file on disk, no catalog entry)`,
  ];

  if (report.stale.length > 0) {
    lines.push('', `Stale coverage-map pathway references (${report.stale.length}):`);
    for (const entry of report.stale) {
      lines.push(`  ${entry.featureId}  ←  ${entry.pathwayId}  (${entry.reason})`);
    }
  }

  if (report.missingSpec.length > 0) {
    lines.push('', `Catalog entries with no spec file (${report.missingSpec.length}):`);
    for (const finding of report.missingSpec) {
      lines.push(`  ${finding.id}  →  ${finding.spec}`);
    }
  }

  if (report.orphanSpecs.length > 0) {
    lines.push('', `Spec files absent from the catalog (${report.orphanSpecs.length}):`);
    for (const specPath of report.orphanSpecs) lines.push(`  ${specPath}`);
  }

  if (report.unmapped.length > 0) {
    lines.push('', `Pathways no feature claims (${report.unmapped.length}):`);
    for (const finding of report.unmapped) {
      lines.push(`  ${finding.id}  (area ${finding.area})`);
    }
  }

  lines.push(
    '',
    `Features with no Live QA pathway (${report.featuresWithoutPathway.length} of ${summary.featuresWithPathway + summary.featuresWithoutPathway}) — recorded gaps, not drift:`
  );
  for (const featureId of report.featuresWithoutPathway) lines.push(`  ${featureId}`);

  return lines;
}

function formatAiStageSignal(report: AiStageScanReport): string[] {
  const { summary } = report;
  const lines = [
    'Signal: AI stages vs coverage map',
    `  stages         ${summary.total}   (keys in the AI token budget)`,
    `  mapped         ${summary.mapped}   (its call site is in a feature's codeLocations)`,
    `  unclaimed      ${summary.unclaimed}   (budgeted, called from code no feature claims)`,
    `  declared       ${summary.declared}   (a feature's aiStages names it)`,
    `  unused         ${summary.unused}   (budgeted, no call site names it)`,
  ];

  if (report.stale.length > 0) {
    lines.push('', `Stale coverage-map aiStages entries (${report.stale.length}):`);
    for (const entry of report.stale) {
      lines.push(`  ${entry.featureId}  ←  ${entry.stage}  (${entry.reason})`);
    }
  }

  if (report.unclaimed.length > 0) {
    lines.push(
      '',
      `Stages called from code no feature claims (${report.unclaimed.length}) — gaps, not drift:`
    );
    for (const finding of report.unclaimed) {
      lines.push(`  ${finding.stage}  →  ${finding.usedBy.join(', ') || 'no call site'}`);
    }
  }

  if (report.undeclared.length > 0) {
    lines.push(
      '',
      `Stages owned in code but named in no feature's aiStages (${report.undeclared.length}) — gaps, not drift:`
    );
    for (const finding of report.undeclared) {
      lines.push(`  ${finding.stage}  →  ${finding.inferredFeatures.join(', ')}`);
    }
  }

  if (report.unused.length > 0) {
    lines.push('', `Budgeted stages nothing calls (${report.unused.length}):`);
    for (const finding of report.unused) lines.push(`  ${finding.stage}`);
  }

  if (report.unbudgetedStages.length > 0) {
    lines.push(
      '',
      `Call sites naming a stage with no budget (${report.unbudgetedStages.length}) — they run on the default allowance:`
    );
    for (const stage of report.unbudgetedStages) lines.push(`  ${stage}`);
  }

  lines.push(
    '',
    `Features calling the AI client with no declared stage (${report.aiFeaturesWithoutStage.length} of ${summary.aiFeatures}) — gaps, not drift:`
  );
  for (const featureId of report.aiFeaturesWithoutStage) lines.push(`  ${featureId}`);

  lines.push(
    '',
    `AI-category features that call no AI client (${report.aiFeaturesWithoutClient.length}) — deterministic, no token budget expected:`
  );
  for (const featureId of report.aiFeaturesWithoutClient) lines.push(`  ${featureId}`);

  return lines;
}

function formatFlagSignal(report: FlagScanReport): string[] {
  const { summary } = report;
  const lines = [
    'Signal: feature flags vs coverage map',
    `  flags          ${summary.total}   (declared by the flag module)`,
    `  mapped         ${summary.mapped}   (enforced in a feature's codeLocations)`,
    `  unclaimed      ${summary.unclaimed}   (declared, enforced in no feature's code)`,
    `  declared       ${summary.declared}   (a feature's flag field names it)`,
    `  unenforced     ${summary.unenforced}   (declared, nothing outside the flag module reads it)`,
    `  gated features ${summary.gatedFeatures}   (carry a flag in the map)`,
  ];

  if (report.stale.length > 0) {
    lines.push('', `Stale coverage-map flag references (${report.stale.length}):`);
    for (const entry of report.stale) {
      lines.push(`  ${entry.featureId}  ←  ${entry.flag}  (${entry.reason})`);
    }
  }

  lines.push('', 'Declared flags:');
  for (const finding of report.flags) {
    lines.push(
      `  ${finding.flag}`,
      `    helpers      ${finding.helpers.join(', ') || '—'}`,
      `    declared by  ${finding.declaredFeatures.join(', ') || '— (no feature names it)'}`,
      `    enforced in  ${finding.enforcedIn.length} files, owned by ${finding.inferredFeatures.length} features`
    );
  }

  if (report.partiallyGated.length > 0) {
    lines.push(
      '',
      `Features gating on a flag they do not declare (${report.partiallyGated.length}) — partial gating, not drift:`
    );
    for (const entry of report.partiallyGated) {
      lines.push(`  ${entry.featureId}  ←  ${entry.flag}`);
    }
  }

  return lines;
}

function formatPrismaSignal(report: PrismaScanReport): string[] {
  const { summary } = report;
  const lines = [
    'Signal: Prisma models vs coverage map',
    `  models         ${summary.total}   (declared in the schema)`,
    `  mapped         ${summary.mapped}   (queried from a feature's codeLocations)`,
    `  unclaimed      ${summary.unclaimed}   (in the schema, queried by no feature's code)`,
    `  declared       ${summary.declared}   (a feature's prismaModels names it)`,
    `  unused         ${summary.unused}   (no query in product source names it)`,
  ];

  if (report.stale.length > 0) {
    lines.push('', `Stale coverage-map prismaModels entries (${report.stale.length}):`);
    for (const entry of report.stale) {
      lines.push(`  ${entry.featureId}  ←  ${entry.model}  (${entry.reason})`);
    }
  }

  if (report.unclaimed.length > 0) {
    lines.push(
      '',
      `Models queried only from code no feature claims (${report.unclaimed.length}) — gaps, not drift:`
    );
    for (const finding of report.unclaimed) {
      lines.push(`  ${finding.model}  →  ${finding.usedBy.join(', ') || 'no query site'}`);
    }
  }

  if (report.undeclared.length > 0) {
    lines.push(
      '',
      `Models owned in code but named in no feature's prismaModels (${report.undeclared.length}) — shared tables, by decision:`
    );
    for (const finding of report.undeclared) {
      lines.push(`  ${finding.model}  →  ${finding.inferredFeatures.length} features query it`);
    }
  }

  if (report.unused.length > 0) {
    lines.push(
      '',
      `Models with no query in product source (${report.unused.length}) — written through a relation, or unused:`
    );
    for (const finding of report.unused) lines.push(`  ${finding.model}`);
  }

  return lines;
}

function formatReachabilitySignal(report: ReachabilityScanReport): string[] {
  const { summary } = report;
  const lines = [
    'Signal: reachability classes vs coverage map',
    `  modules        ${summary.modules}   (classified from ${summary.entryPoints} framework entry points)`,
    `  live           ${summary.live}   (a reachable consumer uses an export, or it is an entry point)`,
    `  call-unused    ${summary.moduleReachableCallUnused}   (reachable, nothing uses an export)`,
    `  orphan         ${summary.orphan}   (no entry point reaches it)`,
    `  records        ${summary.records}   (${summary.recordsInAgreement} in agreement with the repository)`,
  ];

  if (report.disagreements.length > 0) {
    lines.push('', `Records the repository contradicts (${report.disagreements.length}):`);
    for (const finding of report.disagreements) {
      lines.push(
        `  ${finding.path}  (${finding.disagreements.join(', ')})`,
        `    recorded  ${finding.recordedClass}`,
        `    computed  ${finding.computedClasses.join(', ') || '— (no module under this path)'}`
      );
      if (finding.lostImporters.length > 0) {
        lines.push(`    lost importers    ${finding.lostImporters.join(', ')}`);
      }
      if (finding.gainedImporters.length > 0) {
        lines.push(`    gained importers  ${finding.gainedImporters.join(', ')}`);
      }
      if (!finding.entryChainValid) {
        lines.push(
          `    recorded chain    ${finding.recordedEntryChain.join(' → ') || '— (none)'}`,
          `    repository chain  ${finding.derivedEntryChain.join(' → ') || '— (none)'}`
        );
      }
    }
  }

  lines.push('', `Recorded classes (${report.records.length}):`);
  for (const finding of report.records) {
    lines.push(
      `  ${finding.recordedClass.padEnd(29)} ${finding.path}  (modules ${finding.moduleCount}, importers ${finding.derivedImporters.length})`
    );
  }

  if (report.deadEnds.length > 0) {
    lines.push(
      '',
      `Dead ends — unreachable code another unreachable module still imports (${report.deadEnds.length}):`
    );
    for (const entry of report.deadEnds) {
      lines.push(`  ${entry.path}  ←  ${entry.importedBy.join(', ')}`);
    }
  }

  if (report.unrecordedCallUnused.length > 0) {
    lines.push(
      '',
      `Reachable but unused, not yet recorded (${report.unrecordedCallUnused.length}) — gaps, not drift:`
    );
    for (const modulePath of report.unrecordedCallUnused) lines.push(`  ${modulePath}`);
  }

  if (report.unrecordedOrphans.length > 0) {
    lines.push(
      '',
      `Unreachable, not yet recorded (${report.unrecordedOrphans.length}) — gaps, not drift:`
    );
    for (const modulePath of report.unrecordedOrphans) lines.push(`  ${modulePath}`);
  }

  return lines;
}

function formatMapReferenceSignal(report: MapReferenceScanReport): string[] {
  const { summary } = report;
  const lines = [
    'Signal: coverage-map references vs the tree',
    `  references     ${summary.total}   (${summary.codeLocations} codeLocations, ${summary.excluded} excluded)`,
    `  present        ${summary.present}`,
    `  orphaned       ${summary.orphaned}   (on disk, every module unreachable)`,
    `  missing        ${summary.missing}   (not on disk)`,
    `  labs declared  ${summary.labsDeclared}   (ids only; whether a lab is built is the Labs page's answer)`,
  ];

  if (report.missing.length > 0) {
    lines.push('', `Paths the map names that are not on disk (${report.missing.length}):`);
    for (const finding of report.missing) {
      lines.push(`  ${finding.featureId ?? '(excluded)'}  ←  ${finding.path}`);
      if (finding.moveCandidates.length === 0) {
        lines.push('    no move candidate: nothing on disk shares the name');
        continue;
      }
      lines.push(
        `    advisory move candidates (${finding.moveCandidates.length} of ${finding.moveCandidatesConsidered}) — evidence only, never applied:`
      );
      for (const candidate of finding.moveCandidates) {
        lines.push(
          `      ${candidate.path}  [${candidate.strength}: ${candidate.evidence.join('; ')}]`
        );
      }
    }
  }

  if (report.orphaned.length > 0) {
    lines.push(
      '',
      `Mapped code no entry point reaches (${report.orphaned.length}) — gaps, not drift:`
    );
    for (const finding of report.orphaned) {
      lines.push(
        `  ${finding.featureId ?? '(excluded)'}  ←  ${finding.path}  (modules ${finding.moduleCount}, all unreachable)`
      );
    }
  }

  if (report.labsDeclared.length > 0) {
    lines.push('', `Declared labs (${report.labsDeclared.length}) — listed, not checked:`);
    for (const entry of report.labsDeclared) lines.push(`  ${entry}`);
  }

  return lines;
}

function formatCategorySignal(report: CategoryHealthReport): string[] {
  const { summary } = report;
  const lines = [
    'Signal: category health',
    `  categories     ${summary.categories}   (${summary.features} features)`,
    `  large          ${summary.large}   (at or above ${summary.largeThreshold} features)`,
    `  balanced       ${summary.balanced}`,
    `  thin           ${summary.thin}   (below ${summary.thinThreshold} features)`,
    `  empty          ${summary.empty}   (no feature uses the category)`,
    '',
    `  ${'category'.padEnd(16)} ${'size'.padEnd(9)} feat  shipped  flagged  tested  pathway  lab  contradictions`,
  ];

  for (const finding of report.categories) {
    lines.push(
      `  ${finding.category.padEnd(16)} ${finding.size.padEnd(9)} ` +
        `${String(finding.features.length).padEnd(5)} ` +
        `${String(finding.shipped).padEnd(8)} ` +
        `${String(finding.flagged).padEnd(8)} ` +
        `${String(finding.featuresWithTests).padEnd(7)} ` +
        `${String(finding.featuresWithPathway).padEnd(8)} ` +
        `${String(finding.featuresWithLab).padEnd(4)} ` +
        `${finding.contradictions}`
    );
  }

  const withSuggestion = report.categories.filter((finding) => finding.regroup !== null);
  if (withSuggestion.length > 0) {
    lines.push('', `Suggested regroups (${withSuggestion.length}) — advisory:`);
    for (const finding of withSuggestion) {
      lines.push(`  ${finding.category}: ${finding.regroup}`);
    }
  }

  lines.push(
    '',
    `No Live QA pathway (${report.withoutPathway.length} of ${summary.categories}): ${report.withoutPathway.join(', ') || '—'}`,
    `No unit test (${report.withoutTests.length} of ${summary.categories}): ${report.withoutTests.join(', ') || '—'}`,
    `No lab (${report.withoutLab.length} of ${summary.categories}): ${report.withoutLab.join(', ') || '—'}`,
    'These are product gaps, recorded and never failed.'
  );

  return lines;
}

function formatSignal(signal: DriftReport['signals'][number]): string[] {
  if (signal.signal === 'product-surface') return formatSurfaceSignal(signal);
  if (signal.signal === 'test-attribution') return formatTestSignal(signal);
  if (signal.signal === 'live-qa-pathways') return formatPathwaySignal(signal);
  if (signal.signal === 'ai-stages') return formatAiStageSignal(signal);
  if (signal.signal === 'feature-flags') return formatFlagSignal(signal);
  if (signal.signal === 'prisma-models') return formatPrismaSignal(signal);
  if (signal.signal === 'reachability') return formatReachabilitySignal(signal);
  if (signal.signal === 'map-references') return formatMapReferenceSignal(signal);
  return formatCategorySignal(signal);
}

/** Renders the report as the text the CLI prints. */
export function formatDriftReport(report: DriftReport): string {
  const lines = ['Follio Developer Platform — drift scan', ''];

  for (const signal of report.signals) {
    lines.push(...formatSignal(signal), '');
  }

  lines.push(
    report.ok
      ? 'No drift found: the coverage map matches the repository.'
      : 'Drift found: see the findings above.'
  );

  return lines.join('\n');
}
