/**
 * `npm run platform:watch` (PLATFORM_TODO item 26).
 *
 * Mirrors `scan/cli.ts`: a thin entry point that reads the environment,
 * calls the module, prints, and exits 0. The workflow invokes this script
 * rather than an HTTP endpoint, so there is no cron-callable route to
 * protect — the admin-guarded API surface is untouched by this item.
 *
 * Environment, all optional and all read-only:
 *
 * - `PLATFORM_WATCH_BASELINE` — where the baseline lives. The workflow
 *   points it at a restored cache directory.
 * - `PLATFORM_WATCH_TRIGGER` — `schedule` or `post-merge`, for the report.
 * - `GITHUB_REF_NAME`, `GITHUB_SHA` — GitHub's own, used only for display.
 * - `GITHUB_STEP_SUMMARY` — where Actions wants the summary written.
 *
 * No command, path, category or test argument is read from anywhere but the
 * coverage map. There is nothing here that an untrusted caller can steer.
 */

import { appendFileSync } from 'node:fs';
import path from 'node:path';

import { readPerfBaseline, writePerfBaseline } from '../perf';
import { readBaseline, writeBaseline } from './baseline';
import { annotationsFor, summaryFor, WATCH_EXIT_CODE } from './notify';
import { runWatch } from './run';

function baselineFile(): string {
  const configured = process.env.PLATFORM_WATCH_BASELINE;
  if (configured !== undefined && configured.length > 0) return configured;
  return path.join(process.cwd(), '_admin-panel', 'platform', '.watch', 'baseline.json');
}

/**
 * The performance store (item 27).
 *
 * Beside the verdict baseline, in the same directory, so one restored cache
 * carries both and no second cache is needed. A separate *file* rather than
 * a wider format: see `perf/types.ts` for why item 26's file is left alone.
 */
function perfFile(): string {
  return path.join(path.dirname(baselineFile()), 'perf-baseline.json');
}

async function main(): Promise<void> {
  const file = baselineFile();
  const baseline = readBaseline(file);
  const perfPath = perfFile();
  const perfBaseline = readPerfBaseline(perfPath);

  const {
    report,
    baseline: next,
    perfBaseline: nextPerf,
  } = await runWatch({
    trigger: process.env.PLATFORM_WATCH_TRIGGER ?? 'manual',
    branch: process.env.GITHUB_REF_NAME ?? null,
    baseline,
    perfBaseline,
  });

  // Annotations first: they are the part that reaches a person.
  for (const annotation of annotationsFor(report)) {
    console.log(annotation);
  }

  const summary = summaryFor(report);
  console.log(summary);

  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile !== undefined && summaryFile.length > 0) {
    appendFileSync(summaryFile, summary, 'utf8');
  }

  // Written last, so a crash mid-run leaves the previous baseline intact
  // rather than a half-updated one that would mis-classify the next run.
  writeBaseline(file, next);
  writePerfBaseline(perfPath, nextPerf);

  process.exit(WATCH_EXIT_CODE);
}

main().catch((error: unknown) => {
  // An execution failure is not a test finding, and it must not read as one.
  const message = error instanceof Error ? error.message : String(error);
  console.log(`::error title=Scheduled run failed to execute::${message.replace(/\n/g, ' ')}`);
  console.error(error);
  process.exit(1);
});
