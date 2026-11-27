/**
 * Reading, classifying against, and updating the CI failure baseline
 * (PLATFORM_TODO item 26).
 *
 * Pure except for two filesystem calls at the edges. Everything that decides
 * whether a failure is new is a function of a baseline and a run, so the
 * transition rules are tested with fixtures rather than by breaking a real
 * test twice.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { testIdentity as historyTestIdentity } from '../tests/history';
import type {
  Baseline,
  BaselineStatus,
  BaselineTarget,
  BaselineTest,
  ClassifiedFailure,
  FailureClass,
} from './baseline-types';

/** The format this module writes and is willing to read. */
export const BASELINE_VERSION = 1 as const;

/**
 * How many observations are kept per test.
 *
 * Five is enough to tell a regression from a flap and small enough that the
 * whole file stays a few hundred kilobytes for a repository this size. The
 * window is what makes `flaky` detectable at all: with one stored status,
 * a test that alternates looks like a fresh regression every other run.
 */
export const BASELINE_WINDOW = 5;

/**
 * How many targets the file keeps.
 *
 * Bounded so an abandoned category cannot grow the artifact forever. The
 * coverage map has 13 categories today, so this is headroom rather than a
 * limit anyone will meet.
 */
export const BASELINE_MAX_TARGETS = 50;

/** The identity rule, re-exported so callers cannot accidentally use another. */
export const testIdentity = historyTestIdentity;

/** An empty baseline, which is what a first run compares against. */
export function emptyBaseline(): Baseline {
  return { version: BASELINE_VERSION, updatedAt: new Date().toISOString(), targets: [] };
}

function isStatus(value: unknown): value is BaselineStatus {
  return (
    value === 'passed' ||
    value === 'failed' ||
    value === 'skipped' ||
    value === 'todo' ||
    value === 'unknown'
  );
}

/**
 * Parses a baseline, or returns null.
 *
 * Null means "no usable prior state", and the caller must say so rather than
 * treating an unreadable file as an empty one — the two produce the same
 * classifications but mean different things, and only one of them is worth
 * investigating.
 */
export function parseBaseline(raw: string): Baseline | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const candidate = parsed as Partial<Baseline>;
  // A future version is discarded rather than guessed at.
  if (candidate.version !== BASELINE_VERSION) return null;
  if (!Array.isArray(candidate.targets)) return null;

  const targets: BaselineTarget[] = [];
  for (const entry of candidate.targets) {
    if (typeof entry !== 'object' || entry === null) continue;
    const target = entry as Partial<BaselineTarget>;
    if (typeof target.targetId !== 'string') continue;
    if (target.runner !== 'vitest' && target.runner !== 'live-qa') continue;
    if (!Array.isArray(target.tests)) continue;

    const tests: BaselineTest[] = [];
    for (const testEntry of target.tests) {
      if (typeof testEntry !== 'object' || testEntry === null) continue;
      const test = testEntry as Partial<BaselineTest>;
      if (typeof test.id !== 'string' || typeof test.name !== 'string') continue;
      if (!Array.isArray(test.recent)) continue;

      tests.push({
        id: test.id,
        file: typeof test.file === 'string' ? test.file : null,
        suite: Array.isArray(test.suite) ? test.suite.filter((s) => typeof s === 'string') : [],
        name: test.name,
        recent: test.recent.filter(isStatus).slice(-BASELINE_WINDOW),
        lastCommit: typeof test.lastCommit === 'string' ? test.lastCommit : null,
        lastSeenAt: typeof test.lastSeenAt === 'string' ? test.lastSeenAt : '',
      });
    }

    targets.push({
      runner: target.runner,
      targetId: target.targetId,
      lastOutcome: typeof target.lastOutcome === 'string' ? target.lastOutcome : 'unknown',
      lastRunAt: typeof target.lastRunAt === 'string' ? target.lastRunAt : '',
      tests,
    });
  }

  return { version: BASELINE_VERSION, updatedAt: new Date().toISOString(), targets };
}

/** Reads the baseline from disk. Null when absent or unusable. */
export function readBaseline(file: string): Baseline | null {
  if (!existsSync(file)) return null;
  try {
    return parseBaseline(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Writes the baseline, creating its directory. */
export function writeBaseline(file: string, baseline: Baseline): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
}

/* ===========================================================================
 * The rule
 * ======================================================================== */

/**
 * Classifies one currently-failing test against what the baseline knows.
 *
 * This is the whole of item 26's "genuinely new failure", and it is
 * deliberately conservative: of the four outcomes only two are new, and the
 * two that are not cover the cases that would otherwise produce repeat
 * alerts for the same broken test.
 */
export function classifyFailure(prior: BaselineTest | undefined): FailureClass {
  // Nothing on file. A test the baseline has never seen, failing now, is as
  // new as a failure gets.
  if (prior === undefined || prior.recent.length === 0) return 'first-observed';

  // Instability is decided first, because it outranks both of the questions
  // below: a test that has failed and then passed again is unreliable
  // whichever way its most recent run went, and alerting on each flap is how
  // a notification channel stops being read.
  //
  // Recovery is the test, not "the window holds a pass and a fail". That
  // weaker rule calls every regression flaky for as long as the
  // pre-regression pass survives in the window — the label that gets a real
  // breakage waved away. A live run produced exactly that: passed, failed,
  // failed came back `flaky`.
  const firstFailure = prior.recent.indexOf('failed');
  if (firstFailure !== -1 && prior.recent.slice(firstFailure + 1).includes('passed')) {
    return 'flaky';
  }

  // Never recovered. Either it has been failing since it first broke, or it
  // was passing until now.
  const last = prior.recent[prior.recent.length - 1];
  return last === 'failed' ? 'already-failing' : 'newly-failing';
}

export function isNewFailure(classification: FailureClass): boolean {
  return classification === 'first-observed' || classification === 'newly-failing';
}

function evidenceFor(classification: FailureClass, prior: BaselineTest | undefined): string {
  if (prior === undefined || prior.recent.length === 0) {
    return 'no prior observation in the baseline';
  }
  const window = prior.recent.join(' → ');
  if (classification === 'flaky') return `already unstable: ${window}`;
  if (classification === 'already-failing') return `already failing: ${window}`;
  return `last seen ${window}`;
}

/** One observed test, in the shape both runners can be reduced to. */
export type ObservedTest = {
  file: string | null;
  suite: string[];
  name: string;
  status: BaselineStatus;
};

/**
 * Classifies every failing test in one target's results.
 *
 * Only `failed` is considered. A skipped or todo test is not a failure, and
 * a passing one obviously is not.
 */
export function classifyTarget(
  runner: 'vitest' | 'live-qa',
  targetId: string,
  observed: ObservedTest[],
  baseline: Baseline | null
): ClassifiedFailure[] {
  const priorTarget = baseline?.targets.find(
    (entry) => entry.runner === runner && entry.targetId === targetId
  );
  const priorById = new Map((priorTarget?.tests ?? []).map((test) => [test.id, test]));

  return observed
    .filter((test) => test.status === 'failed')
    .map((test) => {
      const id = testIdentity(test);
      const prior = priorById.get(id);
      const classification = classifyFailure(prior);

      return {
        runner,
        targetId,
        id,
        file: test.file,
        suite: test.suite,
        name: test.name,
        classification,
        isNew: isNewFailure(classification),
        evidence: evidenceFor(classification, prior),
      };
    });
}

/* ===========================================================================
 * Updating
 * ======================================================================== */

/**
 * Folds one target's observations into the baseline.
 *
 * A target that produced no comparable results — cancelled, broken runner,
 * missing prerequisite — must not be folded in: overwriting a known-good
 * record with an empty one would make the next genuine regression look like
 * a first observation. The caller enforces that; this function assumes it
 * has been handed real results.
 */
export function updateBaseline(
  baseline: Baseline | null,
  runner: 'vitest' | 'live-qa',
  targetId: string,
  outcome: string,
  observed: ObservedTest[],
  now: string,
  commit: string | null
): Baseline {
  const current = baseline ?? emptyBaseline();
  const priorTarget = current.targets.find(
    (entry) => entry.runner === runner && entry.targetId === targetId
  );
  const priorById = new Map((priorTarget?.tests ?? []).map((test) => [test.id, test]));

  const tests: BaselineTest[] = observed.map((test) => {
    const id = testIdentity(test);
    const prior = priorById.get(id);

    return {
      id,
      file: test.file,
      suite: test.suite,
      name: test.name,
      // Bounded: the window slides, it does not grow.
      recent: [...(prior?.recent ?? []), test.status].slice(-BASELINE_WINDOW),
      lastCommit: commit,
      lastSeenAt: now,
    };
  });

  const updated: BaselineTarget = {
    runner,
    targetId,
    lastOutcome: outcome,
    lastRunAt: now,
    tests: tests.sort((a, b) => a.id.localeCompare(b.id)),
  };

  const others = current.targets.filter(
    (entry) => !(entry.runner === runner && entry.targetId === targetId)
  );

  return {
    version: BASELINE_VERSION,
    updatedAt: now,
    targets: [...others, updated]
      .sort((a, b) => `${a.runner}:${a.targetId}`.localeCompare(`${b.runner}:${b.targetId}`))
      .slice(0, BASELINE_MAX_TARGETS),
  };
}
