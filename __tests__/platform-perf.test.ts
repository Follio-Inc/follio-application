/**
 * Performance baselines and regression flags (PLATFORM_TODO item 27).
 *
 * The item's risk is crying wolf. A rule that flags ordinary variance gets
 * switched off within a week, and then real slowdowns land unnoticed — so
 * most of this file is the cases that must **not** be flagged: noise, a
 * single slow run, a failed test's duration, a cancelled run, a missing
 * prerequisite, and the first few observations of anything.
 *
 * Fixtures throughout. Nothing here sleeps: a test that measures itself
 * measures the machine it runs on, and the thresholds were chosen from real
 * measurement recorded in `perf/types.ts` rather than from a benchmark here.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  PERF_FLOOR_MS,
  PERF_MAX_SERIES,
  PERF_MIN_SAMPLES,
  PERF_RELATIVE,
  PERF_VERSION,
  PERF_WINDOW,
  applyObservations,
  classifyDuration,
  emptyPerfBaseline,
  median,
  observeComparison,
  observeLiveQa,
  observeResumeLab,
  observeVitest,
  parsePerfBaseline,
  perfStageId,
  perfTestId,
  readPerfBaseline,
  recordObservations,
  summarizeFlags,
  testIdentity,
  writePerfBaseline,
} from '@/_admin-panel/platform/perf';
import type { PerfBaseline, PerfObservation } from '@/_admin-panel/platform/perf';
import { testIdentity as historyTestIdentity } from '@/_admin-panel/platform/tests/history';

const PERF_DIR = '_admin-panel/platform/perf';

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function codeOf(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'platform-perf-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A comparable observation. */
function obs(
  id: string,
  durationMs: number | null,
  reason?: PerfObservation['reason']
): PerfObservation {
  return { id, source: 'vitest', label: id, durationMs, reason };
}

/** A baseline holding one series with the given samples. */
function withSamples(id: string, samples: number[]): PerfBaseline {
  return {
    version: PERF_VERSION,
    updatedAt: '2026-10-14T00:00:00.000Z',
    series: [
      {
        id,
        source: 'vitest',
        label: id,
        samples,
        lastCommit: 'abc1234',
        lastSeenAt: '2026-10-14T00:00:00.000Z',
      },
    ],
  };
}

describe('the thresholds are the measured ones', () => {
  it('uses both a relative and an absolute test', () => {
    expect(PERF_RELATIVE).toBe(2);
    expect(PERF_FLOOR_MS).toBe(50);
    expect(PERF_MIN_SAMPLES).toBe(3);
    expect(PERF_WINDOW).toBe(10);
  });

  it('records where the numbers came from', () => {
    // Not a round number someone liked: the file carries the measurement
    // that produced it, so a future change has to argue with the data.
    const types = read(`${PERF_DIR}/types.ts`);

    expect(types).toContain('97 comparable tests over 7 runs');
    expect(types).toContain('0 / 97');
    expect(types).toContain('51 of 97');
  });
});

describe('the baseline statistic', () => {
  it('is a median, so one cold run cannot set it', () => {
    // The real spread the measurement found. Mean 39, median 29 — and only
    // one of those describes a warm run.
    expect(median([66, 22, 29])).toBe(29);
    expect(median([66, 22, 29, 25])).toBe(27);
    expect(median([5])).toBe(5);
    expect(median([])).toBe(0);
  });

  it('is not an average', () => {
    const source = codeOf(read(`${PERF_DIR}/baseline.ts`));

    expect(source).not.toMatch(/reduce\([^)]*\+[^)]*\)\s*\/\s*\w+\.length/);
    expect(source).not.toMatch(/\bmean\b|\baverage\b/i);
  });

  it('is the median of the window, not the previous run', () => {
    // The distinction a mutation exposed: with a uniform window the two are
    // identical, so uniform fixtures prove nothing. Here one noisy run sits
    // at the end — median 100, last sample 400.
    const window = [100, 100, 400];
    expect(median(window)).toBe(100);
    expect(window[window.length - 1]).toBe(400);

    // Against the median this is a regression; against the previous run it
    // would be "within baseline", and a single slow run would have silently
    // raised the bar for everything after it.
    const flag = classifyDuration(obs('t', 350), window);
    expect(flag.baselineMs).toBe(100);
    expect(flag.classification).toBe('regression');
    expect(flag.deltaMs).toBe(250);

    // And in the other direction: a recovery after one slow run is not an
    // improvement, because the median never moved.
    const recovered = classifyDuration(obs('t', 100), window);
    expect(recovered.baselineMs).toBe(100);
    expect(recovered.classification).toBe('within-baseline');
  });

  it('is unmoved by a single extreme sample', () => {
    // One pathological run in an otherwise steady series must not become the
    // truth the next ten runs are judged against.
    const steady = [100, 100, 100, 100];
    const withOutlier = [100, 100, 100, 100, 9000];

    expect(median(steady)).toBe(100);
    expect(median(withOutlier)).toBe(100);

    // A mean would have moved to 1880 and hidden a real 3× slowdown.
    const flag = classifyDuration(obs('t', 300), withOutlier);
    expect(flag.baselineMs).toBe(100);
    expect(flag.classification).toBe('regression');
  });

  it('compares against the window before the observation, not including it', () => {
    // Folding the new value in first would let a regression lift its own
    // baseline and mask itself.
    const flag = classifyDuration(obs('t', 1000), [10, 10, 10]);

    expect(flag.baselineMs).toBe(10);
    expect(flag.classification).toBe('regression');
  });
});

describe('what is and is not a regression', () => {
  it('never calls the first observation one', () => {
    const flag = classifyDuration(obs('t', 9999), []);

    expect(flag.classification).toBe('baseline-created');
    expect(flag.baselineMs).toBeNull();
    expect(flag.evidence).toContain('Nothing to compare');
  });

  it('keeps too-few samples pending, and says how few', () => {
    for (const samples of [[10], [10, 12]]) {
      const flag = classifyDuration(obs('t', 5000), samples);
      expect(flag.classification).toBe('insufficient-baseline');
      expect(flag.evidence).toContain(`${samples.length}/${PERF_MIN_SAMPLES}`);
      expect(flag.deltaMs).toBeNull();
    }
  });

  it('ignores ordinary variance', () => {
    // The worst noise the measurement saw at this scale: 29 → 66 ms.
    expect(classifyDuration(obs('t', 66), [29, 22, 29, 25]).classification).toBe('within-baseline');
    // And a tiny test wobbling by a millisecond.
    expect(classifyDuration(obs('t', 1), [0, 0, 0]).classification).toBe('within-baseline');
    expect(classifyDuration(obs('t', 3), [1, 1, 1]).classification).toBe('within-baseline');
  });

  it('ignores a big ratio that is a small number of milliseconds', () => {
    // 1 ms → 10 ms is ten times slower and nobody cares. Without the floor
    // this is a regression, which is why the floor exists.
    const flag = classifyDuration(obs('t', 10), [1, 1, 1]);

    expect(flag.ratio).toBe(10);
    expect(flag.classification).toBe('within-baseline');
  });

  it('ignores a big delta that is a small ratio', () => {
    // 1000 ms → 1060 ms is 60 ms slower and 1.06×. Without the relative
    // test every slow-but-steady test would flag on normal drift.
    const flag = classifyDuration(obs('t', 1060), [1000, 1000, 1000]);

    expect(flag.deltaMs).toBe(60);
    expect(flag.classification).toBe('within-baseline');
  });

  it('flags a slowdown that clears both thresholds', () => {
    const flag = classifyDuration(obs('t', 300), [100, 100, 100]);

    expect(flag.classification).toBe('regression');
    expect(flag.currentMs).toBe(300);
    expect(flag.baselineMs).toBe(100);
    expect(flag.deltaMs).toBe(200);
    expect(flag.ratio).toBe(3);
    expect(flag.samples).toBe(3);
  });

  it('tells an improvement from a regression', () => {
    const faster = classifyDuration(obs('t', 100), [300, 300, 300]);

    expect(faster.classification).toBe('improved');
    expect(faster.deltaMs).toBe(-200);
    expect(faster.evidence).toContain('Improved');

    const slower = classifyDuration(obs('t', 300), [100, 100, 100]);
    expect(slower.classification).toBe('regression');
    expect(slower.evidence).toContain('Regression');
  });

  it('does not divide by a zero baseline', () => {
    // Half the repository's tests report 0 ms. A ratio there is undefined,
    // so the relative test cannot pass and only noise-free absolute moves
    // would ever qualify — which at 0 ms they do not.
    const flag = classifyDuration(obs('t', 500), [0, 0, 0]);

    expect(flag.ratio).toBeNull();
    expect(flag.classification).toBe('within-baseline');
  });

  it('puts the numbers in the evidence, always', () => {
    const flag = classifyDuration(obs('t', 300), [100, 100, 100]);

    expect(flag.evidence).toContain('300 ms');
    expect(flag.evidence).toContain('100 ms');
    expect(flag.evidence).toContain('+200 ms');
    expect(flag.evidence).toContain('3×');
    // A badge with no figures is not a finding.
    expect(flag.evidence).not.toBe('regression');
  });
});

describe('what is not a timing sample at all', () => {
  it('rejects an observation with no duration', () => {
    const flag = classifyDuration(obs('t', null, 'test-failed'), [10, 10, 10]);

    expect(flag.classification).toBe('not-comparable');
    expect(flag.reason).toBe('test-failed');
    expect(flag.currentMs).toBeNull();
    expect(flag.evidence).toContain('test-failed');
  });

  it('never records one into the window', () => {
    // A test that throws in its first line is fast. Letting that duration in
    // would drag the median down and make the next healthy run a regression.
    const { baseline } = applyObservations(
      withSamples('t', [100, 100, 100]),
      [obs('t', null, 'test-failed')],
      '2026-10-14T00:00:00.000Z',
      'abc'
    );

    expect(baseline.series[0].samples).toEqual([100, 100, 100]);
  });

  it('treats a failed test as a verdict, not a timing', () => {
    const result = {
      outcome: 'failed',
      ran: true,
      categoryId: 'Builder',
      filesRequested: [],
      filesReported: [],
      filesNotReported: [],
      totals: null,
      files: [
        {
          path: '__tests__/a.test.ts',
          status: 'failed',
          durationMs: 5,
          message: null,
          tests: [
            { name: 'ok', suite: ['s'], status: 'passed', durationMs: 20, failures: [] },
            { name: 'bad', suite: ['s'], status: 'failed', durationMs: 3, failures: [] },
            { name: 'skip', suite: ['s'], status: 'skipped', durationMs: null, failures: [] },
          ],
        },
      ],
      durationMs: 10,
      exitCode: 1,
      detail: '',
    } as never;

    const observations = observeVitest(result);
    const byName = new Map(observations.map((entry) => [entry.label, entry]));

    expect(byName.get('s › ok')?.durationMs).toBe(20);
    expect(byName.get('s › bad')?.durationMs).toBeNull();
    expect(byName.get('s › bad')?.reason).toBe('test-failed');
    expect(byName.get('s › skip')?.reason).toBe('test-skipped');
  });

  it.each([
    ['cancelled', 'run-cancelled'],
    ['runner-failed', 'runner-failed'],
    ['timed-out', 'runner-failed'],
    ['report-unreadable', 'runner-failed'],
    ['no-tests', 'runner-failed'],
  ])('treats a %s run as %s rather than timing', (outcome, reason) => {
    const observations = observeVitest({
      outcome,
      ran: false,
      categoryId: 'Builder',
      filesRequested: [],
      filesReported: [],
      filesNotReported: [],
      totals: null,
      files: [],
      durationMs: 10,
      exitCode: null,
      detail: '',
    } as never);

    expect(observations).toHaveLength(1);
    expect(observations[0].durationMs).toBeNull();
    expect(observations[0].reason).toBe(reason);
  });

  it('keeps a functional pass and a performance regression separate', () => {
    // The case the item exists for: the test passed, and it got slower.
    const flag = classifyDuration(obs('t', 400), [100, 100, 100]);

    expect(flag.classification).toBe('regression');
    // Nothing in a flag says anything about pass or fail.
    expect(Object.keys(flag)).not.toContain('status');
    expect(JSON.stringify(flag)).not.toMatch(/passed|failed/);
  });
});

describe('Live QA', () => {
  const pathwayResult = (overrides: Record<string, unknown> = {}) =>
    ({
      outcome: 'passed',
      ran: true,
      pathwayId: 'public.landing',
      pathwayTitle: 'Landing',
      requiresAuth: false,
      authConfigured: true,
      baseUrl: 'http://localhost:3000',
      startedAt: null,
      durationMs: 100,
      exitCode: 0,
      totals: null,
      cases: [
        {
          name: 'loads',
          suite: ['public.landing'],
          status: 'expected',
          attemptStatus: 'passed',
          durationMs: 900,
          retries: 0,
          error: null,
          stack: null,
          location: null,
          artifacts: [],
        },
      ],
      reportErrors: [],
      detail: '',
      ...overrides,
    }) as never;

  it('uses the last attempt’s duration and says when it retried', () => {
    const observations = observeLiveQa(
      pathwayResult({
        cases: [
          {
            name: 'loads',
            suite: ['public.landing'],
            status: 'expected',
            attemptStatus: 'passed',
            durationMs: 900,
            retries: 2,
            error: null,
            stack: null,
            location: null,
            artifacts: [],
          },
        ],
      })
    );

    expect(observations[0].durationMs).toBe(900);
    // The ambiguity is in the label, not hidden inside the number.
    expect(observations[0].label).toContain('retried 2×');
    expect(read(`${PERF_DIR}/observe.ts`)).toContain('last attempt');
  });

  it('never compares a missing auth state', () => {
    const observations = observeLiveQa(
      pathwayResult({ outcome: 'skipped-auth-not-configured', ran: false, cases: [] })
    );

    expect(observations[0].durationMs).toBeNull();
    expect(observations[0].reason).toBe('prerequisite-missing');
  });

  it('never compares an infrastructure failure', () => {
    for (const outcome of ['runner-failed', 'report-missing', 'unknown-pathway']) {
      const observations = observeLiveQa(pathwayResult({ outcome, ran: false, cases: [] }));
      expect(observations[0].durationMs, outcome).toBeNull();
      expect(observations[0].reason, outcome).toBe(
        outcome === 'report-missing' || outcome === 'runner-failed' || outcome === 'unknown-pathway'
          ? 'runner-failed'
          : 'prerequisite-missing'
      );
    }
  });

  it('never compares a flaky pass, whose timing is the retry’s', () => {
    const observations = observeLiveQa(
      pathwayResult({
        cases: [
          {
            name: 'loads',
            suite: ['public.landing'],
            status: 'flaky',
            attemptStatus: 'passed',
            durationMs: 900,
            retries: 1,
            error: null,
            stack: null,
            location: null,
            artifacts: [],
          },
        ],
      })
    );

    expect(observations[0].durationMs).toBeNull();
    expect(observations[0].reason).toBe('test-failed');
  });
});

describe('Resume Lab stages', () => {
  const labResult = (overrides: Record<string, unknown> = {}) =>
    ({
      outcome: 'parsed',
      source: 'fixture',
      inputLabel: 'alex-morgan',
      timing: {
        stages: [
          { id: 'input', label: 'Read the input', ms: 1, detail: '' },
          { id: 'extract', label: 'Extract text', ms: 38, detail: '' },
          { id: 'agent', label: 'Resume parse agent', ms: 23336, detail: '' },
          { id: 'agent:parse-resume-ai', label: '  parse-resume-ai', ms: 20466, detail: '' },
        ],
        totalMs: 23570,
      },
      sizes: {},
      retention: null,
      tokens: null,
      ai: null,
      entities: null,
      warnings: [],
      payloads: [],
      missingPayloads: [],
      parsed: null,
      agentRunId: null,
      detail: '',
      error: null,
      ...overrides,
    }) as never;

  it('uses the stage timings the lab already measured', () => {
    const observations = observeResumeLab(labResult());
    const byId = new Map(observations.map((entry) => [entry.id, entry.durationMs]));

    expect(byId.get(perfStageId('resume-import-ai', 'input'))).toBe(1);
    expect(byId.get(perfStageId('resume-import-ai', 'extract'))).toBe(38);
    expect(byId.get(perfStageId('resume-import-ai', 'agent'))).toBe(23336);
    // Including the agent's own sub-steps, which item 21 reports rather than
    // re-times.
    expect(byId.get(perfStageId('resume-import-ai', 'agent:parse-resume-ai'))).toBe(20466);
    expect(byId.get(perfStageId('resume-import-ai', 'total'))).toBe(23570);
  });

  it('instruments no product code to get them', () => {
    const source = codeOf(read(`${PERF_DIR}/observe.ts`));

    expect(source).not.toMatch(/@\/services|@\/lib\/ai-client|performance\.now/);
    expect(source).not.toMatch(/Date\.now\(\)/);
  });

  it('compares nothing when the run did not parse', () => {
    const observations = observeResumeLab(labResult({ outcome: 'gate-closed' }));

    expect(observations).toHaveLength(1);
    expect(observations[0].durationMs).toBeNull();
    expect(observations[0].reason).toBe('prerequisite-missing');
  });
});

describe('AI and OpenResume never share a baseline', () => {
  const parser = (side: 'ai' | 'openResume', ms: number) => ({
    side,
    implementation: side,
    outcome: 'parsed' as const,
    durationMs: ms,
    stages: [{ id: 'parse', label: 'Parse', ms, detail: '' }],
    entities: null,
    confidence: null,
    parseMethod: null,
    ai: null,
    aiNote: '',
    json: null,
    error: null,
    note: '',
  });

  const comparison = (aiMs: number, orMs: number) =>
    ({
      source: 'fixture',
      inputLabel: 'alex-morgan',
      outcome: 'compared',
      detail: '',
      ai: parser('ai', aiMs),
      openResume: parser('openResume', orMs),
      comparison: null,
      warnings: [],
    }) as never;

  it('keys each side separately', () => {
    const ids = observeComparison(comparison(24000, 288)).map((entry) => entry.id);

    expect(ids).toContain('lab:resume-import-ai:ai:parse');
    expect(ids).toContain('lab:resume-import-ai:openResume:parse');
    expect(ids).toContain('lab:resume-import-ai:ai:total');
    expect(ids).toContain('lab:resume-import-ai:openResume:total');
    // No id is shared between the two.
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not make the slower parser a regression', () => {
    // The real figures: 24 s against 288 ms. They do different work, and
    // item 23 declined to name a winner — item 27 keeps that.
    const { flags } = applyObservations(
      null,
      observeComparison(comparison(24000, 288)),
      '2026-10-14T00:00:00.000Z',
      null
    );

    for (const flag of flags) {
      expect(flag.classification).toBe('baseline-created');
    }
    expect(flags.every((flag) => flag.classification !== 'regression')).toBe(true);
  });

  it('compares each side only with its own past', () => {
    // Feed the AI side's history, then observe both. Only the AI side has a
    // baseline, and the openresume duration cannot touch it.
    let baseline: PerfBaseline | null = null;
    for (let i = 0; i < PERF_MIN_SAMPLES; i += 1) {
      baseline = applyObservations(
        baseline,
        observeComparison(comparison(24000, 288)),
        '2026-10-14T00:00:00.000Z',
        null
      ).baseline;
    }

    const aiSeries = baseline!.series.find((s) => s.id === 'lab:resume-import-ai:ai:total');
    const orSeries = baseline!.series.find((s) => s.id === 'lab:resume-import-ai:openResume:total');

    expect(aiSeries!.samples.every((value) => value === 24000)).toBe(true);
    expect(orSeries!.samples.every((value) => value === 288)).toBe(true);
    // Neither window contains the other's numbers.
    expect(aiSeries!.samples).not.toContain(288);
    expect(orSeries!.samples).not.toContain(24000);
  });

  it('computes no winner anywhere', () => {
    for (const file of ['observe.ts', 'baseline.ts', 'types.ts', 'record.ts']) {
      const source = codeOf(read(`${PERF_DIR}/${file}`));
      expect(source, file).not.toMatch(/winner|faster than|slower than|beats/i);
    }
  });
});

describe('identity', () => {
  it('is item 16’s rule, shared rather than reimplemented', () => {
    expect(testIdentity).toBe(historyTestIdentity);

    const a = perfTestId('vitest', { file: 'a.test.ts', suite: ['s'], name: 'x' });
    const b = perfTestId('vitest', { file: 'b.test.ts', suite: ['s'], name: 'x' });
    const c = perfTestId('live-qa', { file: 'a.test.ts', suite: ['s'], name: 'x' });

    expect(new Set([a, b, c]).size).toBe(3);
    expect(a).toContain('vitest:');
  });

  it('keys a lab stage by lab and stage, never by position', () => {
    expect(perfStageId('resume-import-ai', 'extract')).toBe('lab:resume-import-ai:extract');
    expect(perfStageId('resume-import-ai', 'extract', 'ai')).toBe(
      'lab:resume-import-ai:ai:extract'
    );
    // Reordering the stages cannot change an id.
    const source = codeOf(read(`${PERF_DIR}/identity.ts`));
    expect(source).not.toMatch(/index|\[i\]|position/i);
  });

  it('survives reordering', () => {
    const forward = observeResumeLab({
      outcome: 'parsed',
      timing: {
        stages: [
          { id: 'a', label: 'A', ms: 1, detail: '' },
          { id: 'b', label: 'B', ms: 2, detail: '' },
        ],
        totalMs: 3,
      },
    } as never);
    const reversed = observeResumeLab({
      outcome: 'parsed',
      timing: {
        stages: [
          { id: 'b', label: 'B', ms: 2, detail: '' },
          { id: 'a', label: 'A', ms: 1, detail: '' },
        ],
        totalMs: 3,
      },
    } as never);

    const idFor = (list: PerfObservation[], ms: number) =>
      list.find((entry) => entry.durationMs === ms)?.id;

    expect(idFor(forward, 1)).toBe(idFor(reversed, 1));
    expect(idFor(forward, 2)).toBe(idFor(reversed, 2));
  });
});

describe('the store', () => {
  it('is versioned, and a foreign version is discarded', () => {
    expect(parsePerfBaseline(JSON.stringify({ version: 1, series: [] }))).not.toBeNull();
    expect(parsePerfBaseline(JSON.stringify({ version: 2, series: [] }))).toBeNull();
    expect(parsePerfBaseline(JSON.stringify({ series: [] }))).toBeNull();
  });

  it('fails safely on anything unreadable', () => {
    expect(parsePerfBaseline('not json')).toBeNull();
    expect(parsePerfBaseline('null')).toBeNull();
    expect(parsePerfBaseline('[]')).toBeNull();
    expect(readPerfBaseline(path.join(dir, 'absent.json'))).toBeNull();

    const corrupt = path.join(dir, 'corrupt.json');
    writeFileSync(corrupt, '{"version":1,"series":', 'utf8');
    expect(readPerfBaseline(corrupt)).toBeNull();
  });

  it('fabricates no comparison from a discarded file', () => {
    // A future-version file must leave the run with no baseline, which
    // classifies as created rather than as anything compared.
    const file = path.join(dir, 'future.json');
    writeFileSync(file, JSON.stringify({ version: 99, series: [] }), 'utf8');

    const flags = recordObservations([obs('t', 5000)], { file, write: false });
    expect(flags[0].classification).toBe('baseline-created');
    expect(flags[0].baselineMs).toBeNull();
  });

  it('drops entries it cannot trust rather than the whole file', () => {
    const parsed = parsePerfBaseline(
      JSON.stringify({
        version: 1,
        series: [
          { id: 'good', source: 'vitest', samples: [1, 2] },
          { id: 'bad-source', source: 'nonsense', samples: [1] },
          { id: 'no-samples', source: 'vitest' },
          { id: 'dirty-samples', source: 'lab', samples: [1, 'x', -5, 3] },
        ],
      })
    );

    expect(parsed?.series.map((entry) => entry.id)).toEqual(['good', 'dirty-samples']);
    expect(parsed?.series[1].samples).toEqual([1, 3]);
  });

  it('bounds the window and the number of series', () => {
    let baseline: PerfBaseline | null = null;
    for (let i = 0; i < PERF_WINDOW + 5; i += 1) {
      baseline = applyObservations(
        baseline,
        [obs('t', 10)],
        '2026-10-14T00:00:00.000Z',
        null
      ).baseline;
    }
    expect(baseline!.series[0].samples).toHaveLength(PERF_WINDOW);

    let wide: PerfBaseline | null = null;
    const many = Array.from({ length: PERF_MAX_SERIES + 20 }, (_, i) =>
      obs(`t-${String(i).padStart(5, '0')}`, 10)
    );
    wide = applyObservations(wide, many, '2026-10-14T00:00:00.000Z', null).baseline;
    expect(wide.series).toHaveLength(PERF_MAX_SERIES);
  });

  it('round-trips, and stores nothing it should not', () => {
    const file = path.join(dir, 'nested', 'baseline.json');
    const { baseline } = applyObservations(
      null,
      [obs('t', 10)],
      '2026-10-14T00:00:00.000Z',
      'abc1234'
    );
    writePerfBaseline(file, baseline);

    const raw = readFileSync(file, 'utf8');
    expect(readPerfBaseline(file)?.series[0].samples).toEqual([10]);
    expect(raw).not.toMatch(/sk-|OPENAI_API_KEY|DATABASE_URL|Bearer |clerk/i);
    expect(raw).not.toMatch(/ {4}at .*\(/);
    expect(raw).not.toMatch(/[A-Za-z]:\\\\|\/home\/|\/Users\//);
    expect(Object.keys(baseline.series[0]).sort()).toEqual([
      'id',
      'label',
      'lastCommit',
      'lastSeenAt',
      'samples',
      'source',
    ]);
  });

  it('does not write under NODE_ENV=test unless asked', () => {
    const file = path.join(dir, 'guarded.json');
    recordObservations([obs('t', 10)], { file });

    expect(existsSync(file)).toBe(false);
    recordObservations([obs('t', 10)], { file, write: true });
    expect(existsSync(file)).toBe(true);
  });

  it('never takes a run down with it', () => {
    // A directory where the file should be: writing throws, and the caller
    // gets no flags rather than an exception.
    const file = path.join(dir, 'as-a-dir');
    writeFileSync(path.join(dir, 'placeholder'), '', 'utf8');
    expect(() =>
      recordObservations([obs('t', 10)], { file: path.join(file, 'x', 'y') })
    ).not.toThrow();
  });
});

describe('grouping', () => {
  it('splits flags by kind', () => {
    const summary = summarizeFlags([
      classifyDuration(obs('a', 300), [100, 100, 100]),
      classifyDuration(obs('b', 100), [300, 300, 300]),
      classifyDuration(obs('c', 10), []),
      classifyDuration(obs('d', null, 'test-failed'), []),
      classifyDuration(obs('e', 101), [100, 100, 100]),
    ]);

    expect(summary.regressions.map((f) => f.id)).toEqual(['a']);
    expect(summary.improvements.map((f) => f.id)).toEqual(['b']);
    expect(summary.pending.map((f) => f.id)).toEqual(['c']);
    expect(summary.notComparable.map((f) => f.id)).toEqual(['d']);
    expect(summary.flags).toHaveLength(5);
  });
});

describe('the UI shows the evidence', () => {
  it.each([
    '_admin-panel/platform/ui/test-run-result.tsx',
    '_admin-panel/platform/ui/resume-lab.tsx',
  ])('%s distinguishes regression, improved and pending', (file) => {
    const source = read(file);

    expect(source).toContain('function PerfBadge(');
    expect(source).toContain("'regression'");
    expect(source).toContain("'improved'");
    expect(source).toContain('baseline pending');
    // The numbers, not just a colour.
    expect(source).toContain('flag.currentMs');
    expect(source).toContain('flag.baselineMs');
    expect(source).toContain('flag.deltaMs');
    // And nothing shown for an entry with nothing to say.
    expect(source).toContain("flag.classification === 'within-baseline'");
  });

  it('renders a verdict and a performance flag as two separate things', () => {
    const source = read('_admin-panel/platform/ui/test-run-result.tsx');
    const caseRow = source.slice(
      source.indexOf('function CaseRow('),
      source.indexOf('function FileBlock(')
    );

    // The status pill and the badge are siblings; neither replaces the other.
    expect(caseRow).toContain('<StatusPill status={test.status} />');
    expect(caseRow).toContain('<PerfBadge flag={flag} />');
  });

  it('computes nothing in the view', () => {
    for (const file of [
      '_admin-panel/platform/ui/test-run-result.tsx',
      '_admin-panel/platform/ui/resume-lab.tsx',
    ]) {
      const source = codeOf(read(file));
      expect(source, file).not.toMatch(/currentMs -|\/ baselineMs|median\(/);
    }
  });
});

describe('nothing else moved', () => {
  it('leaves item 26’s new-failure rule alone', () => {
    const baseline = read('_admin-panel/platform/watch/baseline.ts');

    // Still the same four classes, decided the same way.
    expect(baseline).toContain("return 'first-observed'");
    expect(baseline).toContain("return 'flaky'");
    expect(baseline).toContain("last === 'failed' ? 'already-failing' : 'newly-failing'");
    // And the verdict baseline is a separate file from the perf one.
    expect(read('_admin-panel/platform/watch/cli.ts')).toContain('perf-baseline.json');
    expect(baseline).not.toContain('perf');
  });

  it('keeps performance out of the failure annotations', () => {
    const notify = read('_admin-panel/platform/watch/notify.ts');
    const annotations = notify.slice(
      notify.indexOf('export function annotationsFor'),
      notify.indexOf('function section(')
    );

    // Annotations are built from `newFailures` and nothing else.
    expect(annotations).toContain('report.newFailures.map');
    expect(annotations).not.toMatch(/perf|regression/i);
    // The summary says so out loud.
    expect(notify).toContain('not failures and raise no annotation');
  });

  it('blocks no CI', () => {
    const workflow = read('.github/workflows/platform-watch.yml');

    expect(workflow).toMatch(/^\s{4}continue-on-error: true$/m);
    // The trigger block, not the whole file: the header comment explains in
    // prose that this workflow never runs on a pull request.
    const triggers = workflow.slice(workflow.indexOf('\non:\n'), workflow.indexOf('concurrency:'));
    expect(triggers).not.toContain('pull_request');
    expect(read('_admin-panel/platform/watch/notify.ts')).toContain('WATCH_EXIT_CODE = 0');
  });

  it('changes no product code and adds no dependency', () => {
    const specifiers = new Set<string>();
    for (const file of [
      'baseline.ts',
      'observe.ts',
      'record.ts',
      'types.ts',
      'identity.ts',
      'index.ts',
    ]) {
      for (const match of read(`${PERF_DIR}/${file}`).matchAll(/from '([^']+)'/g)) {
        if (!match[1].startsWith('.')) specifiers.add(match[1]);
      }
    }

    expect([...specifiers].sort()).toEqual(['node:fs', 'node:path']);
    for (const file of ['baseline.ts', 'observe.ts', 'record.ts']) {
      expect(codeOf(read(`${PERF_DIR}/${file}`)), file).not.toMatch(/prisma|@\/lib\/db/i);
    }
  });

  it('keeps the baseline store out of git', () => {
    const ignore = read('.gitignore');

    expect(ignore).toContain('_admin-panel/platform/.perf/');
    expect(emptyPerfBaseline().version).toBe(PERF_VERSION);
  });
});
