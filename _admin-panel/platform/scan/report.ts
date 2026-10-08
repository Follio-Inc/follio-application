import { scanProductSurface, type SurfaceScanOptions } from './surface';
import { scanTestAttribution, type TestScanOptions } from './tests';
import type { DriftReport, SurfaceScanReport, TestScanReport } from './types';

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

export type DriftScanOptions = SurfaceScanOptions & TestScanOptions;

/** Runs every signal implemented so far. Items 6–8 add to this list. */
export function runDriftScan(options: DriftScanOptions = {}): DriftReport {
  const surface = scanProductSurface(options);
  const tests = scanTestAttribution(options);

  return {
    signals: [surface, tests],
    // Drift means the map contradicts the repository. Unmapped surface and a
    // `unitTests` entry the graph cannot support are both contradictions.
    // `uncategorized` and `unlisted` tests are gaps, tracked but not failures.
    ok:
      surface.unmapped.length === 0 && tests.stale.length === 0 && tests.misattributed.length === 0,
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

function formatSignal(signal: DriftReport['signals'][number]): string[] {
  return signal.signal === 'product-surface'
    ? formatSurfaceSignal(signal)
    : formatTestSignal(signal);
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
