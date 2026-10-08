import { scanAiStages, type AiStageScanOptions } from './ai-stages';
import { scanFeatureFlags, type FlagScanOptions } from './flags';
import { scanLiveQaPathways, type PathwayScanOptions } from './pathways';
import { scanPrismaModels, type PrismaScanOptions } from './prisma-models';
import { collectSourceFacts, type SourceFactsOptions } from './source-facts';
import { scanProductSurface, type SurfaceScanOptions } from './surface';
import { scanTestAttribution, type TestScanOptions } from './tests';
import type {
  AiStageScanReport,
  DriftReport,
  FlagScanReport,
  PathwayScanReport,
  PrismaScanReport,
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
  Pick<SourceFactsOptions, 'files'>;

/** Runs every signal implemented so far. Item 8 adds to this list. */
export function runDriftScan(options: DriftScanOptions = {}): DriftReport {
  // The last three signals all want references from the same ~670 source
  // files. Collected once here and handed down, so the CLI parses the tree
  // once rather than three times.
  const sourceFacts =
    options.sourceFacts ?? collectSourceFacts({ repoRoot: options.repoRoot, files: options.files });
  const withFacts = { ...options, sourceFacts };

  const surface = scanProductSurface(options);
  const tests = scanTestAttribution(options);
  const pathways = scanLiveQaPathways(options);
  const aiStages = scanAiStages(withFacts);
  const flags = scanFeatureFlags(withFacts);
  const prismaModels = scanPrismaModels(withFacts);

  return {
    signals: [surface, tests, pathways, aiStages, flags, prismaModels],
    // Drift means the map contradicts the repository. Unmapped surface, a
    // `unitTests` entry the graph cannot support, and a map reference to a
    // stage, flag or model the repository does not define are contradictions.
    // Everything the item-7 signals report beyond `stale` is a gap: an
    // unclaimed model, an unused stage and a partially gated feature are all
    // tracked without failing, as items 4–6 established for their own gaps.
    ok:
      surface.unmapped.length === 0 &&
      tests.stale.length === 0 &&
      tests.misattributed.length === 0 &&
      aiStages.stale.length === 0 &&
      flags.stale.length === 0 &&
      prismaModels.stale.length === 0,
  };
}

function formatSurfaceSignal(report: SurfaceScanReport): string[] {
  const { summary } = report;
  const lines = [
    'Signal: product surface vs coverage map',
    `  discovered  ${summary.total}  (${summary.pages} pages, ${summary.routes} API routes)`,
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

function formatSignal(signal: DriftReport['signals'][number]): string[] {
  if (signal.signal === 'product-surface') return formatSurfaceSignal(signal);
  if (signal.signal === 'test-attribution') return formatTestSignal(signal);
  if (signal.signal === 'live-qa-pathways') return formatPathwaySignal(signal);
  if (signal.signal === 'ai-stages') return formatAiStageSignal(signal);
  if (signal.signal === 'feature-flags') return formatFlagSignal(signal);
  return formatPrismaSignal(signal);
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
