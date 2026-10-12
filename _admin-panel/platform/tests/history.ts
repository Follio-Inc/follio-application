import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { RunnerKind } from './execution-types';
import type {
  FlakyEvidence,
  HistoryCommit,
  HistoryCounts,
  HistoryTestStatus,
  HistoryView,
  RunHistoryRecord,
  RunHistoryTest,
  RunSummary,
  TargetHistory,
  TestFailingState,
  TestTrend,
  TestTrendPoint,
} from './history-types';
import { HISTORY_FORMAT_VERSION, RUNS_RETAINED_PER_TARGET } from './history-types';
import type { PathwayCaseResult, PathwayRunResult } from './live-qa-types';
import type { CategoryRunResult, TestCaseResult } from './run-types';

/**
 * Local run history, last pass and flaky detection (PLATFORM_TODO item 16).
 *
 * Server-only: it writes and reads JSON files. Storage is the default already
 * decided in PLATFORM_TODO's open decisions — **local JSON under
 * `_admin-panel/platform/.runs/`, gitignored** — so there is no Prisma change,
 * no production persistence and nothing git-tracked. `.gitignore` carries the
 * directory beside the Live QA artifacts it sits next to in spirit.
 *
 * Layout: one file per run, under `<root>/<runner>/<slug>/<timestamp>-<id>.json`.
 * One file per run rather than one growing file per target, because then
 * pruning is a delete, a half-written file can only ever damage its own run,
 * and the timestamp in the name sorts chronologically — the same convention the
 * Live QA artifacts directory already uses. A file that cannot be parsed, or
 * that carries another format version, is skipped and the rest are kept.
 *
 * What is **not** here: no environment values, no auth or Clerk state, no pids,
 * no command lines, no stdout, no stacks. A record holds the opaque run id, the
 * target, the outcome, times, the commit, the reporter's totals, and one row
 * per test with its identity and verdict. Paths are repo-relative.
 *
 * Item 16's three questions, and the only three this answers:
 * - **trend** — the recent verdicts for one stable test identity.
 * - **newly-failing vs already-failing** — this run's verdict against the
 *   previous run that recorded the same test.
 * - **flaky** — a pass and a failure for the same test **at the same commit**,
 *   which is the TODO's literal rule. One failure is not flaky. A slow run is
 *   not flaky. A cancelled or broken run cannot contribute at all, because such
 *   a run is stored with no test rows in it.
 */

/** The store, relative to the repository root. */
const HISTORY_DIRNAME = path.join('_admin-panel', 'platform', '.runs');

/**
 * Runs kept per target, pruned on write.
 *
 * The TODO names no number, so this is deliberately conservative: ten runs is
 * enough for a legible trend and for same-commit evidence to accumulate within
 * a sitting, and it bounds the store at a few megabytes even if every category
 * and pathway is run ten times. Per target rather than globally, because a
 * trend and a last pass are questions about one target — a global cap would let
 * a busy category evict the history of a quiet one.
 */
export const RETAINED_PER_TARGET = RUNS_RETAINED_PER_TARGET;

export type HistoryOptions = {
  /** The store's root. Defaults to the gitignored directory in the repo. */
  root?: string;
  repoRoot?: string;
  /**
   * Whether to write at all.
   *
   * Off under `NODE_ENV=test` by default, so the repository's own unit tests —
   * which drive the runners through seams — cannot write into the real store.
   * Item 16's tests pass a temporary root and turn it back on.
   */
  enabled?: boolean;
  /** Commit probe seam. Defaults to reading git. */
  commit?: () => HistoryCommit;
  /** Clock seam, for a deterministic `finishedAt`. */
  now?: () => Date;
};

function rootFor(options: HistoryOptions): string {
  if (options.root !== undefined) return options.root;
  return path.join(options.repoRoot ?? process.cwd(), HISTORY_DIRNAME);
}

function writingEnabled(options: HistoryOptions): boolean {
  return options.enabled ?? process.env.NODE_ENV !== 'test';
}

/**
 * A filesystem-safe directory name for a target id.
 *
 * Category ids carry spaces and pathway ids carry dots, and neither belongs in
 * a path as written. Everything but `a-z`, `0-9` and `-` is replaced, so no id
 * can produce a separator, a drive letter or a `..` segment however it was
 * spelled. The real id is stored inside the record, so nothing depends on
 * reversing this.
 */
export function targetSlug(targetId: string): string {
  const slug = targetId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug === '' ? 'unnamed' : slug;
}

/** The commit a run happened at, read from git. Null sha when git cannot say. */
export function readCommit(repoRoot: string = process.cwd()): HistoryCommit {
  const git = (args: string[]) =>
    spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', windowsHide: true });

  let sha: string | null = null;
  try {
    const head = git(['rev-parse', 'HEAD']);
    const value = `${head.stdout}`.trim();
    sha = head.status === 0 && /^[0-9a-f]{7,40}$/.test(value) ? value : null;
  } catch {
    sha = null;
  }

  let dirty = false;
  try {
    const status = git(['status', '--porcelain']);
    dirty = status.status === 0 && `${status.stdout}`.trim().length > 0;
  } catch {
    dirty = false;
  }

  return { sha, dirty };
}

/** `file > suite > … > name`. Stable, and never an array position. */
export function testIdentity(test: { file: string | null; suite: string[]; name: string }): string {
  return [test.file ?? '', ...test.suite, test.name].filter((part) => part !== '').join(' > ');
}

/** Vitest's own status words, in one vocabulary. */
export function normalizeVitestStatus(status: string): HistoryTestStatus {
  if (status === 'passed') return 'passed';
  if (status === 'failed') return 'failed';
  if (status === 'skipped' || status === 'pending' || status === 'todo') return 'skipped';
  return 'unknown';
}

/**
 * Playwright's status words, in the same vocabulary.
 *
 * `flaky` means it failed and then passed on a retry, which item 14 already
 * counts as a failure for the run's verdict. The same judgement is kept here so
 * the console cannot disagree with itself, and the reporter's own word is
 * preserved separately rather than thrown away.
 */
export function normalizeLiveQaStatus(status: string): HistoryTestStatus {
  if (status === 'expected' || status === 'passed') return 'passed';
  if (status === 'unexpected' || status === 'failed' || status === 'timedOut') return 'failed';
  if (status === 'flaky') return 'failed';
  if (status === 'skipped') return 'skipped';
  return 'unknown';
}

/** Outcomes that mean nothing was executed. These are never recorded. */
const NOT_EXECUTED = new Set([
  'unknown-category',
  'unknown-pathway',
  'no-tests',
  'gate-closed',
  'busy',
  'skipped-auth-not-configured',
]);

/** Whether a result describes a run that actually happened. */
export function isRecordable(outcome: string): boolean {
  return !NOT_EXECUTED.has(outcome);
}

type RunMeta = {
  runId: string;
  startedAt: string;
};

function writeRecord(record: RunHistoryRecord, options: HistoryOptions): string | null {
  const root = rootFor(options);
  const dir = path.join(root, record.runner, targetSlug(record.targetId));

  try {
    mkdirSync(dir, { recursive: true });
    const stamp = record.startedAt.replace(/[:.]/g, '-');
    const file = path.join(dir, `${stamp}-${record.runId.slice(0, 8)}.json`);
    writeFileSync(file, JSON.stringify(record), 'utf8');
    prune(dir);

    return file;
  } catch {
    // A run's result matters more than its history. A store that cannot be
    // written is reported by the view being empty, never by failing the run.
    return null;
  }
}

/** Keeps the newest `RETAINED_PER_TARGET` files in a target's directory. */
function prune(dir: string): void {
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    // The name begins with the run's ISO timestamp, so this is chronological.
    .sort((a, b) => a.localeCompare(b));

  for (const name of files.slice(0, Math.max(0, files.length - RETAINED_PER_TARGET))) {
    rmSync(path.join(dir, name), { force: true });
  }
}

function summaryFromVitest(result: CategoryRunResult): RunHistoryRecord['summary'] {
  return {
    tests: result.totals?.tests ?? 0,
    passed: result.totals?.passed ?? 0,
    failed: result.totals?.failed ?? 0,
    skipped: result.totals?.pending ?? 0,
    files: result.totals?.files ?? null,
  };
}

function vitestTests(result: CategoryRunResult): RunHistoryTest[] {
  return result.files.flatMap((file) =>
    file.tests.map((test: TestCaseResult) => ({
      file: file.path,
      suite: test.suite,
      name: test.name,
      status: normalizeVitestStatus(test.status),
    }))
  );
}

/** Records one finished Vitest run. Returns the file written, or null. */
export function recordVitestRun(
  result: CategoryRunResult,
  meta: RunMeta,
  options: HistoryOptions = {}
): string | null {
  if (!isRecordable(result.outcome) || !writingEnabled(options)) return null;

  const now = (options.now ?? (() => new Date()))();

  return writeRecord(
    {
      version: HISTORY_FORMAT_VERSION,
      runId: meta.runId,
      runner: 'vitest',
      targetId: result.categoryId,
      outcome: result.outcome,
      ran: result.ran,
      startedAt: meta.startedAt,
      finishedAt: now.toISOString(),
      durationMs: result.durationMs,
      commit: (options.commit ?? (() => readCommit(options.repoRoot)))(),
      summary: summaryFromVitest(result),
      tests: vitestTests(result),
    },
    options
  );
}

function liveQaTests(result: PathwayRunResult): RunHistoryTest[] {
  return result.cases.map((entry: PathwayCaseResult) => ({
    file: null,
    suite: entry.suite,
    name: entry.name,
    status: normalizeLiveQaStatus(entry.status),
    ...(entry.status === 'flaky' ? { reporterFlaky: true as const } : {}),
  }));
}

/** Records one finished Live QA run. Returns the file written, or null. */
export function recordLiveQaRun(
  result: PathwayRunResult,
  meta: RunMeta,
  options: HistoryOptions = {}
): string | null {
  if (!isRecordable(result.outcome) || !writingEnabled(options)) return null;

  const now = (options.now ?? (() => new Date()))();

  return writeRecord(
    {
      version: HISTORY_FORMAT_VERSION,
      runId: meta.runId,
      runner: 'live-qa',
      targetId: result.pathwayId,
      outcome: result.outcome,
      ran: result.ran,
      startedAt: meta.startedAt,
      finishedAt: now.toISOString(),
      durationMs: result.durationMs,
      commit: (options.commit ?? (() => readCommit(options.repoRoot)))(),
      summary: {
        tests: result.cases.length,
        passed: result.totals?.expected ?? 0,
        // A retried pass counts with the failures here for the same reason it
        // does in item 14's verdict.
        failed: (result.totals?.unexpected ?? 0) + (result.totals?.flaky ?? 0),
        skipped: result.totals?.skipped ?? 0,
        files: null,
      },
      tests: liveQaTests(result),
    },
    options
  );
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Accepts a parsed record only if it is one this version understands. */
function parseRecord(raw: string): RunHistoryRecord | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(value)) return null;
  if (value.version !== HISTORY_FORMAT_VERSION) return null;
  if (typeof value.runId !== 'string' || typeof value.targetId !== 'string') return null;
  if (value.runner !== 'vitest' && value.runner !== 'live-qa') return null;
  if (typeof value.startedAt !== 'string' || !Array.isArray(value.tests)) return null;

  return value as unknown as RunHistoryRecord;
}

/**
 * Every retained run for one target, newest first.
 *
 * A missing directory is an empty list, not an error: a target that has never
 * run has no history, and saying so is the honest answer.
 */
export function readTargetRuns(
  runner: RunnerKind,
  targetId: string,
  options: HistoryOptions = {}
): RunHistoryRecord[] {
  const dir = path.join(rootFor(options), runner, targetSlug(targetId));
  if (!existsSync(dir)) return [];

  let names: string[];
  try {
    names = readdirSync(dir).filter((name) => name.endsWith('.json'));
  } catch {
    return [];
  }

  const records: RunHistoryRecord[] = [];
  for (const name of names.sort((a, b) => a.localeCompare(b))) {
    let raw: string;
    try {
      raw = readFileSync(path.join(dir, name), 'utf8');
    } catch {
      continue;
    }

    // A file this version cannot read is skipped, and every other run survives.
    const record = parseRecord(raw);
    if (record !== null) records.push(record);
  }

  return records.reverse().slice(0, RETAINED_PER_TARGET);
}

function toSummary(record: RunHistoryRecord): RunSummary {
  const { version: _version, tests: _tests, ...summary } = record;
  return summary;
}

/** Where a test stands, this run against the one before it. */
function failingState(points: TestTrendPoint[]): TestFailingState {
  const latest = points.at(-1);
  if (latest === undefined) return 'unknown';
  if (latest.status === 'passed') return 'passing';
  if (latest.status === 'skipped') return 'skipped';
  if (latest.status !== 'failed') return 'unknown';

  const previous = points.at(-2);
  if (previous === undefined) return 'first-failure';
  if (previous.status === 'passed') return 'newly-failing';
  if (previous.status === 'failed') return 'already-failing';

  // Skipped or unknown before: nothing to have regressed from.
  return 'first-failure';
}

/**
 * The most recent commit at which this test both passed and failed.
 *
 * Item 16's literal flaky rule, and the only thing that produces the label.
 * A point with no commit sha cannot be attributed to one, so it is ignored
 * here rather than guessed at.
 */
function flakyEvidence(points: TestTrendPoint[]): FlakyEvidence | null {
  const byCommit = new Map<string, TestTrendPoint[]>();
  for (const point of points) {
    if (point.commit === null) continue;
    byCommit.set(point.commit, [...(byCommit.get(point.commit) ?? []), point]);
  }

  let found: FlakyEvidence | null = null;
  for (const [commit, group] of byCommit) {
    const passes = group.filter((point) => point.status === 'passed').length;
    const failures = group.filter((point) => point.status === 'failed').length;
    if (passes === 0 || failures === 0) continue;

    // Points arrive oldest first, so the last qualifying commit is the most
    // recent one.
    found = { commit, passes, failures, dirty: group.some((point) => point.dirty) };
  }

  return found;
}

const STATE_ORDER: TestFailingState[] = [
  'newly-failing',
  'already-failing',
  'first-failure',
  'unknown',
  'skipped',
  'passing',
];

/** Turns runs into one trend per test identity. */
export function buildTrends(records: RunHistoryRecord[]): TestTrend[] {
  const seen = new Map<string, { test: RunHistoryTest; points: TestTrendPoint[] }>();

  // Oldest first, so a trend reads left to right.
  for (const record of [...records].reverse()) {
    for (const test of record.tests) {
      const id = testIdentity(test);
      const entry = seen.get(id) ?? { test, points: [] };
      entry.points.push({
        at: record.startedAt,
        status: test.status,
        commit: record.commit?.sha ?? null,
        dirty: record.commit?.dirty === true,
        reporterFlaky: test.reporterFlaky === true,
      });
      seen.set(id, entry);
    }
  }

  const trends = [...seen.entries()].map(([id, { test, points }]) => ({
    id,
    file: test.file,
    suite: test.suite,
    name: test.name,
    recent: points,
    lastPassedAt: points.filter((point) => point.status === 'passed').at(-1)?.at ?? null,
    state: failingState(points),
    flaky: flakyEvidence(points),
    reporterFlakyAt: points.filter((point) => point.reporterFlaky).at(-1)?.at ?? null,
  }));

  // Notable first, then alphabetical: deterministic, and a render cap can never
  // hide a flaky or newly-failing test behind a passing one.
  return trends.sort((a, b) => {
    if ((a.flaky === null) !== (b.flaky === null)) return a.flaky === null ? 1 : -1;
    const byState = STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state);
    return byState !== 0 ? byState : a.id.localeCompare(b.id);
  });
}

/** One target's history, from its stored runs. */
export function buildTargetHistory(
  runner: RunnerKind,
  targetId: string,
  records: RunHistoryRecord[]
): TargetHistory {
  const summaries = records.map(toSummary);

  return {
    runner,
    targetId,
    runsRecorded: records.length,
    lastRun: summaries[0] ?? null,
    // The most recent run that came out green. Never derived from anything but
    // a recorded pass.
    lastPassAt: summaries.find((run) => run.outcome === 'passed')?.startedAt ?? null,
    recent: summaries,
    tests: buildTrends(records),
  };
}

/** Targets the store holds history for, discovered from the directory tree. */
function discoverTargets(options: HistoryOptions): { runner: RunnerKind; targetId: string }[] {
  const root = rootFor(options);
  const found: { runner: RunnerKind; targetId: string }[] = [];

  for (const runner of ['vitest', 'live-qa'] as const) {
    const dir = path.join(root, runner);
    if (!existsSync(dir)) continue;

    let slugs: string[];
    try {
      slugs = readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch {
      continue;
    }

    for (const slug of slugs) {
      // The id is read from the records, never reconstructed from the slug.
      const names = readdirSync(path.join(dir, slug)).filter((name) => name.endsWith('.json'));
      for (const name of names.sort((a, b) => b.localeCompare(a))) {
        let record: RunHistoryRecord | null = null;
        try {
          record = parseRecord(readFileSync(path.join(dir, slug, name), 'utf8'));
        } catch {
          record = null;
        }
        if (record !== null) {
          found.push({ runner, targetId: record.targetId });
          break;
        }
      }
    }
  }

  return found;
}

function countsFor(targets: TargetHistory[]): HistoryCounts {
  const trends = targets.flatMap((target) => target.tests);

  return {
    targetsWithHistory: targets.filter((target) => target.runsRecorded > 0).length,
    runsRecorded: targets.reduce((total, target) => total + target.runsRecorded, 0),
    testsWithHistory: trends.length,
    flaky: trends.filter((trend) => trend.flaky !== null).length,
    newlyFailing: trends.filter((trend) => trend.state === 'newly-failing').length,
    alreadyFailing: trends.filter((trend) => trend.state === 'already-failing').length,
    withoutRecordedPass: trends.filter((trend) => trend.lastPassedAt === null).length,
  };
}

export type HistoryViewOptions = HistoryOptions & {
  /**
   * The categories and pathways the console offers, in the shapes the runners
   * already list them in, so a target that has never run is listed honestly
   * rather than left out.
   *
   * Taken as arguments rather than imported: the runners import this module to
   * record a run, so reaching back for their lists would be a cycle. Only the
   * ids are read.
   */
  categories?: { id: string }[];
  pathways?: { id: string }[];
  /** Runs listed across targets. */
  recentRunLimit?: number;
};

/** Everything the history view renders, read from the store. */
export function buildHistoryView(options: HistoryViewOptions = {}): HistoryView {
  const known: { runner: RunnerKind; targetId: string }[] = [
    ...(options.categories ?? []).map((entry) => ({
      runner: 'vitest' as const,
      targetId: entry.id,
    })),
    ...(options.pathways ?? []).map((entry) => ({
      runner: 'live-qa' as const,
      targetId: entry.id,
    })),
  ];
  const keyOf = (entry: { runner: RunnerKind; targetId: string }) =>
    `${entry.runner}:${entry.targetId}`;

  const all = [...known];
  for (const found of discoverTargets(options)) {
    // A target with history that the map no longer offers is still shown.
    if (!all.some((entry) => keyOf(entry) === keyOf(found))) all.push(found);
  }

  const targets = all
    .map((entry) =>
      buildTargetHistory(
        entry.runner,
        entry.targetId,
        readTargetRuns(entry.runner, entry.targetId, options)
      )
    )
    .sort((a, b) => {
      // Targets with history first, newest run first, then by name.
      if (a.runsRecorded > 0 !== b.runsRecorded > 0) return a.runsRecorded > 0 ? -1 : 1;
      const at = a.lastRun?.startedAt ?? '';
      const bt = b.lastRun?.startedAt ?? '';
      if (at !== bt) return at < bt ? 1 : -1;
      return `${a.runner}:${a.targetId}`.localeCompare(`${b.runner}:${b.targetId}`);
    });

  const recentRuns = targets
    .flatMap((target) => target.recent)
    .sort((a, b) => (a.startedAt === b.startedAt ? 0 : a.startedAt < b.startedAt ? 1 : -1))
    .slice(0, options.recentRunLimit ?? RETAINED_PER_TARGET);

  return {
    version: HISTORY_FORMAT_VERSION,
    root: HISTORY_DIRNAME.replace(/\\/g, '/'),
    retainedPerTarget: RETAINED_PER_TARGET,
    readAt: (options.now ?? (() => new Date()))().toISOString(),
    targets,
    recentRuns,
    counts: countsFor(targets),
  };
}
