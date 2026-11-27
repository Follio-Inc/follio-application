import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

import { canRunDeveloperSuites } from '../../modules/developer/guard';
import { getLiveQaPathway, listLiveQaPathways } from '../../modules/developer/live-qa/catalog';
import { getLiveQaRoot } from '../../modules/developer/live-qa/fixtures';
import { buildLiveQaCatalog, runLiveQa } from '../../modules/developer/live-qa/runner';
import type { LiveQaRunHooks } from '../../modules/developer/live-qa/runner';
import type { LiveQaPathway, LiveQaRunResult } from '../../modules/developer/live-qa/types';
import { busyDetailFor, withRun } from './execution';
import type { RunLease } from './execution';
import { recordLiveQaRun } from './history';
import type { HistoryOptions } from './history';
import type {
  PathwayArtifact,
  PathwayCaseResult,
  PathwayRunOutcome,
  PathwayRunResult,
  PathwayRunTotals,
  RunnablePathway,
} from './live-qa-types';

/**
 * Running one Live QA pathway and reading its `report.json`
 * (PLATFORM_TODO item 14).
 *
 * Server-only. Everything that already exists is reused rather than rebuilt:
 * the catalog (`getLiveQaPathway`, `listLiveQaPathways`), the runner
 * (`runLiveQa`), the auth probe (`buildLiveQaCatalog().defaults`), the
 * Playwright config and its `json` reporter, and the gate
 * (`canRunDeveloperSuites`). There is no second catalog, no second Playwright
 * invocation and no second artifacts convention here.
 *
 * What item 14 adds is the **structured read**. The existing runner decides
 * pass or fail by matching `✓` and `✘` in Playwright's list output; this reads
 * `report.json`, which `live-qa/playwright.config.ts` has been writing all
 * along (`['json', { outputFile: … 'report.json' }]`). Nothing is scraped.
 *
 * One pathway per run, as item 14 says. Item 15 put that run in the console's
 * one execution slot — the same slot the Vitest runner uses, so the two cannot
 * run at once — and gave it a lifecycle and a cancel that stops Playwright and
 * its browsers. Item 16 records each finished run in the local history store.
 */

/** Where the reporter puts the report, inside the run's artifacts directory. */
const REPORT_FILENAME = 'report.json';

/** The only directory an artifact may be served from. */
const ARTIFACTS_DIRNAME = '.artifacts';

const MAX_RUNNER_OUTPUT = 4_000;

/** Whether `LIVE_QA_STORAGE_STATE` points at a session file that exists. */
export function isLiveQaAuthConfigured(): boolean {
  // The same probe the existing catalog endpoint reports, rather than a second
  // reading of the same env var.
  return buildLiveQaCatalog().defaults.storageStateConfigured;
}

function blockedReasonFor(pathway: LiveQaPathway, authConfigured: boolean): string | null {
  if (pathway.requiresAuth && !authConfigured) {
    return 'Needs a stored browser session. Run `npm run live-qa:auth` and set LIVE_QA_STORAGE_STATE.';
  }
  return null;
}

/** Every catalog pathway, with whether it can run right now. */
export function listRunnablePathways(
  pathways: LiveQaPathway[] = listLiveQaPathways(),
  authConfigured: boolean = isLiveQaAuthConfigured()
): RunnablePathway[] {
  return pathways.map((pathway) => {
    const blockedReason = blockedReasonFor(pathway, authConfigured);

    return {
      id: pathway.id,
      title: pathway.title,
      area: pathway.area,
      stability: pathway.stability,
      requiresAuth: pathway.requiresAuth,
      fixtureKind: pathway.fixtureKind,
      runnable: blockedReason === null,
      blockedReason,
    };
  });
}

/** Repo-relative POSIX path for an absolute one. */
function toRelative(absolute: string, root: string): string {
  const normalized = absolute.replace(/\\/g, '/');
  const base = root.replace(/\\/g, '/').replace(/\/$/, '');

  return normalized.startsWith(`${base}/`) ? normalized.slice(base.length + 1) : normalized;
}

/** The same substitution through a multi-line error or stack. */
function relativize(text: string, roots: string[]): string {
  let output = text;
  for (const root of roots) {
    const normalized = root.replace(/\\/g, '/');
    for (const form of [`file:///${normalized}/`, `${normalized}/`, `${root}\\`]) {
      output = output.split(form).join('');
    }
  }
  return output;
}

/**
 * An attachment's path relative to the Live QA root, or null.
 *
 * Null for an attachment with no file, and — deliberately — for one whose file
 * resolves outside the artifacts directory. Such a file is still reported, just
 * without a link: the artifact route serves nothing it cannot contain.
 */
export function artifactPathFor(absolute: string | undefined, liveQaRoot: string): string | null {
  if (!absolute) return null;

  const resolvedRoot = path.resolve(liveQaRoot);
  const artifactsRoot = path.join(resolvedRoot, ARTIFACTS_DIRNAME);
  const resolved = path.resolve(absolute);
  const inside = `${artifactsRoot}${path.sep}`;

  if (resolved !== artifactsRoot && !resolved.startsWith(inside)) return null;

  return toRelative(resolved, resolvedRoot);
}

/**
 * Resolves an artifact the browser asked for, or null when it may not have it.
 *
 * The containment check the serving route depends on: the path is joined to the
 * Live QA root, resolved — which collapses any `..` — and then required to sit
 * inside `.artifacts`. `realpathSync` closes the symlink route to the same
 * escape. Null means refuse, never "try anyway".
 */
export function resolveArtifactRequest(
  relativePath: string,
  liveQaRoot: string = getLiveQaRoot()
): string | null {
  if (!relativePath || relativePath.includes('\0')) return null;

  const resolvedRoot = path.resolve(liveQaRoot);
  const artifactsRoot = path.join(resolvedRoot, ARTIFACTS_DIRNAME);
  const candidate = path.resolve(resolvedRoot, relativePath);

  if (!candidate.startsWith(`${artifactsRoot}${path.sep}`)) return null;
  if (!existsSync(candidate)) return null;

  // A symlink inside the artifacts directory must not point out of it.
  let real: string;
  try {
    real = realpathSync(candidate);
  } catch {
    return null;
  }
  if (!real.startsWith(`${realpathSync(artifactsRoot)}${path.sep}`)) return null;

  return real;
}

/** Shape of the Playwright JSON report, limited to what is read. */
type RawReport = {
  suites?: unknown;
  errors?: unknown;
  stats?: unknown;
};

const asNumber = (value: unknown): number => (typeof value === 'number' ? value : 0);
const asRounded = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function parseTotals(stats: unknown): PathwayRunTotals {
  const record = isRecord(stats) ? stats : {};

  return {
    expected: asNumber(record.expected),
    unexpected: asNumber(record.unexpected),
    flaky: asNumber(record.flaky),
    skipped: asNumber(record.skipped),
    durationMs: asRounded(record.duration) ?? 0,
  };
}

function parseArtifacts(attachments: unknown, liveQaRoot: string): PathwayArtifact[] {
  if (!Array.isArray(attachments)) return [];

  return attachments.filter(isRecord).map((attachment) => ({
    name: typeof attachment.name === 'string' ? attachment.name : 'attachment',
    contentType:
      typeof attachment.contentType === 'string'
        ? attachment.contentType
        : 'application/octet-stream',
    path: artifactPathFor(
      typeof attachment.path === 'string' ? attachment.path : undefined,
      liveQaRoot
    ),
  }));
}

function locationOf(value: unknown, roots: string[]): string | null {
  if (!isRecord(value) || typeof value.file !== 'string') return null;
  const line = asRounded(value.line);
  const column = asRounded(value.column);

  return `${relativize(value.file.replace(/\\/g, '/'), roots)}${line === null ? '' : `:${line}`}${
    column === null ? '' : `:${column}`
  }`;
}

/**
 * One spec's last attempt, turned into a case result.
 *
 * The last attempt is the one that decided the outcome — Playwright appends a
 * result per retry, and `retry` on that entry says how many there were.
 */
function parseCase(
  spec: Record<string, unknown>,
  suiteTitles: string[],
  liveQaRoot: string,
  roots: string[]
): PathwayCaseResult[] {
  const tests = Array.isArray(spec.tests) ? spec.tests.filter(isRecord) : [];

  return tests.map((test) => {
    const attempts = Array.isArray(test.results) ? test.results.filter(isRecord) : [];
    const last = attempts.at(-1);
    const error = isRecord(last?.error) ? last.error : undefined;
    const rawMessage = typeof error?.message === 'string' ? error.message : '';
    const rawStack = typeof error?.stack === 'string' ? error.stack : '';
    const message = relativize(rawMessage, roots).trim();
    const [firstLine, ...restOfMessage] = message.split('\n');
    const stackBody = relativize(rawStack, roots).trim();

    return {
      name: typeof spec.title === 'string' ? spec.title : '',
      suite: suiteTitles,
      status: typeof test.status === 'string' ? test.status : 'unknown',
      attemptStatus: typeof last?.status === 'string' ? last.status : null,
      durationMs: asRounded(last?.duration),
      retries: asNumber(last?.retry),
      error: firstLine ? firstLine : null,
      // Playwright's `stack` repeats the message; prefer it, and fall back to
      // the remainder of a multi-line message when there is no stack.
      stack: stackBody ? stackBody : restOfMessage.length > 0 ? restOfMessage.join('\n') : null,
      location: locationOf(last?.errorLocation, roots),
      artifacts: parseArtifacts(last?.attachments, liveQaRoot),
    };
  });
}

/** Walks the report's nested suites, collecting cases for one pathway. */
function collectCases(
  suites: unknown,
  pathwayId: string,
  liveQaRoot: string,
  roots: string[],
  titles: string[] = []
): PathwayCaseResult[] {
  if (!Array.isArray(suites)) return [];

  return suites.filter(isRecord).flatMap((suite) => {
    const title = typeof suite.title === 'string' ? suite.title : '';
    // A file-level suite is titled with the spec filename; a `describe` suite
    // is titled with the pathway id, which is the convention every pathway
    // spec follows.
    const nextTitles = title && !title.endsWith('.spec.ts') ? [...titles, title] : titles;
    const belongs = nextTitles.includes(pathwayId);

    const specs = Array.isArray(suite.specs) ? suite.specs.filter(isRecord) : [];
    const own = belongs
      ? specs.flatMap((spec) => parseCase(spec, nextTitles, liveQaRoot, roots))
      : [];

    return [...own, ...collectCases(suite.suites, pathwayId, liveQaRoot, roots, nextTitles)];
  });
}

/** Turns a report into the cases, totals and errors for one pathway. */
export function parsePathwayReport(
  raw: string,
  pathwayId: string,
  options: { liveQaRoot?: string; repoRoot?: string } = {}
): {
  cases: PathwayCaseResult[];
  totals: PathwayRunTotals;
  errors: string[];
  startedAt: string | null;
} | null {
  let report: RawReport;
  try {
    report = JSON.parse(raw) as RawReport;
  } catch {
    return null;
  }

  if (!isRecord(report) || !Array.isArray(report.suites)) return null;

  const liveQaRoot = options.liveQaRoot ?? getLiveQaRoot();
  const roots = [options.repoRoot ?? process.cwd(), liveQaRoot];
  const stats = isRecord(report.stats) ? report.stats : {};

  return {
    cases: collectCases(report.suites, pathwayId, liveQaRoot, roots),
    totals: parseTotals(report.stats),
    errors: (Array.isArray(report.errors) ? report.errors.filter(isRecord) : [])
      .map((entry) => (typeof entry.message === 'string' ? relativize(entry.message, roots) : ''))
      .map((message) => message.trim())
      .filter((message) => message.length > 0),
    startedAt: typeof stats.startTime === 'string' ? stats.startTime : null,
  };
}

export type RunPathwayOptions = {
  pathways?: LiveQaPathway[];
  /** Gate result. Defaults to the real `canRunDeveloperSuites()`. */
  canRun?: boolean;
  /** Auth probe result. Defaults to the real one. */
  authConfigured?: boolean;
  /** The existing Live QA runner. The seam a test replaces. */
  run?: (pathwayId: string, hooks: LiveQaRunHooks) => Promise<LiveQaRunResult>;
  /** Reads the report. Defaults to reading `<artifactsDir>/report.json`. */
  readReport?: (reportPath: string) => string;
  liveQaRoot?: string;
  repoRoot?: string;
  /**
   * Where and whether to record the run in local history (item 16).
   *
   * Writing is off under `NODE_ENV=test` by default, so the repository's own
   * tests cannot write into the real store.
   */
  history?: HistoryOptions;
};

function refuse(
  pathway: LiveQaPathway | undefined,
  pathwayId: string,
  outcome: PathwayRunOutcome,
  detail: string,
  authConfigured: boolean
): PathwayRunResult {
  return {
    outcome,
    ran: false,
    pathwayId,
    pathwayTitle: pathway?.title ?? '',
    requiresAuth: pathway?.requiresAuth ?? false,
    authConfigured,
    baseUrl: null,
    startedAt: null,
    durationMs: 0,
    exitCode: null,
    totals: null,
    cases: [],
    reportErrors: [],
    detail,
    runnerOutput: null,
    artifactsDir: null,
  };
}

/** Runs one catalog pathway and reads its report. */
export async function runPathway(
  pathwayId: string,
  options: RunPathwayOptions = {}
): Promise<PathwayRunResult> {
  const catalog = options.pathways ?? listLiveQaPathways();
  const pathway = catalog.find((entry) => entry.id === pathwayId) ?? getLiveQaPathway(pathwayId);
  const authConfigured = options.authConfigured ?? isLiveQaAuthConfigured();

  if (!pathway || !catalog.some((entry) => entry.id === pathwayId)) {
    return refuse(
      undefined,
      pathwayId,
      'unknown-pathway',
      'No pathway by that id is in the Live QA catalog.',
      authConfigured
    );
  }

  if (!(options.canRun ?? canRunDeveloperSuites())) {
    return refuse(
      pathway,
      pathwayId,
      'gate-closed',
      'Running Live QA is local-only: it needs DEVTOOLS_ENABLED=true and is refused in production.',
      authConfigured
    );
  }

  // Item 14's done condition: a pathway that needs a stored session, with none
  // configured, is **skipped** and not run. Playwright would otherwise sign in
  // as nobody and fail, which would read as a broken product.
  if (pathway.requiresAuth && !authConfigured) {
    return refuse(
      pathway,
      pathwayId,
      'skipped-auth-not-configured',
      'skipped — auth not configured. This pathway signs in first, and LIVE_QA_STORAGE_STATE does not point at a saved session. Run `npm run live-qa:auth` to create one.',
      authConfigured
    );
  }

  // Nothing above this line spawns anything, so an unknown pathway, a closed
  // gate or a missing session is answered without taking the lock.
  return withRun(
    { runner: 'live-qa', targetId: pathwayId },
    (active) => refuse(pathway, pathwayId, 'busy', busyDetailFor(active), authConfigured),
    async (lease) => {
      const startedAt = new Date().toISOString();
      const result = await runUnderLease(pathway, pathwayId, authConfigured, options, lease);

      // One place, after the run has a final outcome. A pathway skipped for a
      // missing session never gets here, so it is never recorded (item 16).
      recordLiveQaRun(
        result,
        { runId: lease.runId, startedAt },
        { repoRoot: options.repoRoot, ...options.history }
      );

      return result;
    }
  );
}

/**
 * Runs the pathway, holding the console's one execution slot.
 *
 * Split out so `runPathway` reads as its sequence of refusals followed by one
 * guarded run. The lock is released by the caller's `finally`, whatever
 * happens in here.
 */
async function runUnderLease(
  pathway: LiveQaPathway,
  pathwayId: string,
  authConfigured: boolean,
  options: RunPathwayOptions,
  lease: RunLease
): Promise<PathwayRunResult> {
  const liveQaRoot = options.liveQaRoot ?? getLiveQaRoot();
  const run =
    options.run ??
    ((id: string, hooks: LiveQaRunHooks) =>
      runLiveQa({ pathwayIds: [id], triageWithAi: false }, hooks));

  lease.advance('starting');
  const outcome = await run(pathwayId, {
    onProcess: (control) => lease.attachProcess(control),
    // Playwright is up. Reported because the process reported it.
    onStarted: () => lease.advance('running'),
  });

  const runnerOutput = [outcome.stderr, outcome.stdout]
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .join('\n')
    .slice(-MAX_RUNNER_OUTPUT);

  const base = {
    pathwayId,
    pathwayTitle: pathway.title,
    requiresAuth: pathway.requiresAuth,
    authConfigured,
    baseUrl: outcome.baseUrl,
    durationMs: outcome.durationMs,
    exitCode: outcome.exitCode,
    artifactsDir: outcome.artifactsDir ? toRelative(outcome.artifactsDir, liveQaRoot) : null,
    runnerOutput: runnerOutput ? runnerOutput : null,
  };

  // Checked first, and before the report is looked for: a cancelled run was
  // killed mid-journey, so of course `report.json` is absent or partial.
  // Calling that a missing report would turn a deliberate stop into a fault.
  if (lease.cancelRequested()) {
    lease.advance('cancelled');

    return {
      ...refuse(
        pathway,
        pathwayId,
        'cancelled',
        `Cancelled after ${Math.round(outcome.durationMs / 1000)}s. Playwright and its browsers were stopped. Any screenshot or trace it had already written is still on disk.`,
        authConfigured
      ),
      ...base,
    };
  }

  if (!outcome.artifactsDir) {
    lease.advance('failed');

    return {
      ...refuse(pathway, pathwayId, 'runner-failed', 'Playwright never started.', authConfigured),
      ...base,
    };
  }

  lease.advance('reading-report');
  const reportPath = path.join(outcome.artifactsDir, REPORT_FILENAME);
  let raw: string;
  try {
    raw = (options.readReport ?? ((file) => readFileSync(file, 'utf8')))(reportPath);
  } catch {
    lease.advance('failed');

    return {
      ...refuse(
        pathway,
        pathwayId,
        'report-missing',
        'Playwright finished without writing report.json, so there is nothing to read.',
        authConfigured
      ),
      ...base,
    };
  }

  const parsed = parsePathwayReport(raw, pathwayId, {
    liveQaRoot,
    repoRoot: options.repoRoot,
  });

  if (parsed === null) {
    lease.advance('failed');

    return {
      ...refuse(
        pathway,
        pathwayId,
        'report-unreadable',
        'report.json is not in a shape this console can read.',
        authConfigured
      ),
      ...base,
    };
  }

  if (parsed.cases.length === 0) {
    // A readable report with no spec for this pathway. Nothing is known about
    // it, so neither pass nor fail would be true.
    lease.advance('failed');

    return {
      ...refuse(
        pathway,
        pathwayId,
        'pathway-not-in-report',
        parsed.errors.length > 0
          ? `Playwright reported no test for this pathway: ${parsed.errors[0]}`
          : 'Playwright reported no test for this pathway.',
        authConfigured
      ),
      ...base,
      startedAt: parsed.startedAt,
      totals: parsed.totals,
      reportErrors: parsed.errors,
    };
  }

  const failedCases = parsed.cases.filter(
    (entry) => entry.status === 'unexpected' || entry.status === 'flaky'
  );
  const skippedCases = parsed.cases.filter((entry) => entry.status === 'skipped');

  // Execution finished and the report covers this pathway. Pass or fail is the
  // result's verdict, not the lifecycle's.
  lease.advance('completed');

  return {
    ...base,
    // It ran: a pathway whose assertions failed is a result, not a broken
    // runner.
    outcome: failedCases.length > 0 ? 'failed' : 'passed',
    ran: true,
    startedAt: parsed.startedAt,
    totals: parsed.totals,
    cases: parsed.cases,
    reportErrors: parsed.errors,
    detail:
      failedCases.length > 0
        ? `${failedCases.length} of ${parsed.cases.length} ${parsed.cases.length === 1 ? 'test' : 'tests'} failed.`
        : skippedCases.length === parsed.cases.length
          ? `${parsed.cases.length} ${parsed.cases.length === 1 ? 'test was' : 'tests were'} skipped by the spec.`
          : `${parsed.cases.length} ${parsed.cases.length === 1 ? 'test' : 'tests'} passed.`,
    runnerOutput: failedCases.length > 0 ? base.runnerOutput : null,
  };
}
