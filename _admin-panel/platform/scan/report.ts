import { scanProductSurface, type SurfaceScanOptions } from './surface';
import type { DriftReport, SurfaceScanReport } from './types';

/**
 * Assembling and rendering the drift report.
 *
 * Output is deterministic: no timestamps, no absolute paths, and every list
 * pre-sorted by the scan. Two runs over the same tree produce byte-identical
 * text, so the report can be diffed between commits or pasted into a CI summary.
 *
 * Pure string building — no process access, so the UI (item 17) can render the
 * same report without going through the CLI.
 */

/** Runs every signal implemented so far. Items 5–8 add to this list. */
export function runDriftScan(options: SurfaceScanOptions = {}): DriftReport {
  const signals = [scanProductSurface(options)];

  return {
    signals,
    ok: signals.every((signal) => signal.unmapped.length === 0),
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

/** Renders the report as the text the CLI prints. */
export function formatDriftReport(report: DriftReport): string {
  const lines = ['Follio Developer Platform — drift scan', ''];

  for (const signal of report.signals) {
    lines.push(...formatSurfaceSignal(signal), '');
  }

  lines.push(
    report.ok
      ? 'No drift found: every page and API route is mapped or explicitly excluded.'
      : 'Drift found: see unmapped paths above.'
  );

  return lines.join('\n');
}
