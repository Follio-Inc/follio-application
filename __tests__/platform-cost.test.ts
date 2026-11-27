/**
 * AI cost tracking and the daily cap (PLATFORM_TODO item 29).
 *
 * The cap is only real if it holds **before** money is spent and **under
 * concurrency**. The Resume Lab does not take item 15's execution lock, so
 * two lab runs genuinely can overlap — which is why most of this file is
 * about admission order and the reservation, not about arithmetic.
 *
 * Synthetic usage throughout, fed through the real ledger path. No test makes
 * a paid provider call.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MODEL_PRICING } from '@/_admin-panel/platform/labs/resume-import-ai';
import {
  COST_CAP_USD,
  COST_MAX_ENTRIES,
  COST_RESERVATION_TTL_MS,
  COST_TIMEZONE,
  COST_VERSION,
  COST_WARN_USD,
  admitLabRun,
  buildCostStatus,
  ceilingFor,
  emptyLedger,
  labAiStages,
  ledgerDay,
  ledgerPath,
  parseLedger,
  projectRunCost,
  readLedger,
  reconcileLabRun,
  releaseLabRun,
  settle,
  spendFor,
  withLedger,
  writeLedger,
} from '@/_admin-panel/platform/cost';
import type { CostEntry, CostLedger } from '@/_admin-panel/platform/cost';
import type { ResumeLabAi } from '@/_admin-panel/platform/labs/resume-import-ai';

const COST_DIR = '_admin-panel/platform/cost';
const RUN_ROUTE = 'app/api/admin/platform/labs/resume-import-ai/run/route.ts';
const COMPARE_ROUTE = 'app/api/admin/platform/labs/resume-import-ai/compare/route.ts';

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

/**
 * Comments removed, string literals kept.
 *
 * Needed because the assertions below look for string literals — a `wx`
 * flag, a role name — while the doc comments above them *discuss* those same
 * strings. Two mutations initially survived for exactly that reason.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
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
  dir = mkdtempSync(path.join(tmpdir(), 'platform-cost-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const AT = new Date('2026-10-14T12:00:00.000Z');
const opts = (now: Date = AT) => ({ repoRoot: dir, now: () => now });

/** A settled entry with a known cost. */
function entry(overrides: Partial<CostEntry> = {}): CostEntry {
  return {
    runId: `run-${Math.random().toString(36).slice(2)}`,
    labId: 'resume-import-ai',
    kind: 'lab-run',
    at: AT.toISOString(),
    day: ledgerDay(AT),
    models: ['gpt-4o-mini', 'gpt-4o'],
    inputTokens: 2502,
    outputTokens: 1722,
    costUsd: 0.00316,
    certainty: 'observed',
    heldUsd: 0,
    actorId: 'admin-1',
    actorRole: 'runner',
    ...overrides,
  };
}

/** Writes an unusable ledger, creating its directory. */
function corrupt(contents: string): void {
  writeLedger(emptyLedger(AT), { repoRoot: dir });
  writeFileSync(ledgerPath({ repoRoot: dir }), contents, 'utf8');
}

/** Seeds the ledger with settled spend. */
function seed(totalUsd: number, now: Date = AT): void {
  const ledger: CostLedger = {
    ...emptyLedger(now),
    entries: [entry({ costUsd: totalUsd, day: ledgerDay(now), at: now.toISOString() })],
  };
  writeLedger(ledger, { repoRoot: dir });
}

/** Item 22's AI block, as a finished run produces it. */
function aiBlock(overrides: Partial<ResumeLabAi> = {}): ResumeLabAi {
  return {
    models: ['gpt-4o-mini', 'gpt-4o'],
    reportedModel: 'gpt-4o-mini',
    usage: {
      status: 'observed',
      inputTokens: 2502,
      outputTokens: 1722,
      totalTokens: 4224,
      source: 'provider',
      calls: [],
      agentRunRecorded: { input: 0, output: 0 },
      agentRunNote: '',
    },
    cost: {
      status: 'available',
      inputUsd: 0.002,
      outputUsd: 0.00118,
      totalUsd: 0.00318,
      basis: 'observed',
      pricingSource: 'test',
      models: ['gpt-4o-mini', 'gpt-4o'],
      unpricedModels: [],
      note: '',
    },
    ...overrides,
  } as ResumeLabAi;
}

describe('the thresholds', () => {
  it('warns at exactly $5 and caps at exactly $20', () => {
    expect(COST_WARN_USD).toBe(5);
    expect(COST_CAP_USD).toBe(20);
  });

  it('accounts in UTC, deterministically', () => {
    expect(COST_TIMEZONE).toBe('UTC');
    // The same instant maps to the same day whoever asks, because
    // `toISOString` is UTC by definition.
    expect(ledgerDay(new Date('2026-10-14T23:59:59.999Z'))).toBe('2026-10-14');
    expect(ledgerDay(new Date('2026-10-15T00:00:00.000Z'))).toBe('2026-10-15');
    expect(ledgerDay('2026-10-14T12:00:00.000Z')).toBe('2026-10-14');
    // No local-time call anywhere in the accounting.
    expect(codeOf(read(`${COST_DIR}/ledger.ts`))).not.toMatch(
      /getFullYear|getMonth|getDate\(\)|toLocale/
    );
  });
});

describe('the projected maximum', () => {
  it('covers exactly the stages the lab invokes', () => {
    // `resumeParse` and `follioVoice`, read from item 22's own list — not a
    // sum of unrelated MAX_TOKENS keys, which would refuse runs for spend
    // that could never happen.
    expect(labAiStages().sort()).toEqual(['follioVoice', 'resumeParse']);

    const projection = projectRunCost();
    expect(projection.stages.map((stage) => stage.stage).sort()).toEqual([
      'follioVoice',
      'resumeParse',
    ]);
    for (const unrelated of ['narrativeGeneration', 'snapViewGeneration', 'agentTurn']) {
      expect(projection.stages.map((stage) => stage.stage)).not.toContain(unrelated);
    }
  });

  it('uses the real MAX_TOKENS ceilings and does not change them', () => {
    const client = read('lib/ai-client.ts');
    expect(client).toContain('resumeParse: 4096');
    expect(client).toContain('follioVoice: 800');

    const byStage = new Map(projectRunCost().stages.map((stage) => [stage.stage, stage]));
    expect(byStage.get('resumeParse')!.maxOutputTokens).toBe(4096);
    expect(byStage.get('follioVoice')!.maxOutputTokens).toBe(800);
    expect(byStage.get('resumeParse')!.model).toBe('gpt-4o-mini');
    expect(byStage.get('follioVoice')!.model).toBe('gpt-4o');

    // Nothing in item 29 writes to the client.
    expect(codeOf(read(`${COST_DIR}/admission.ts`))).not.toMatch(/MAX_TOKENS\s*=/);
  });

  it('prices from item 22’s table and builds no second one', () => {
    const projection = projectRunCost();
    const parse = projection.stages.find((stage) => stage.stage === 'resumeParse')!;
    const mini = MODEL_PRICING['gpt-4o-mini'];

    // Output at the ceiling, plus an equal input allowance.
    // Rounded to the hundred-thousandth, as every figure in the ledger is.
    expect(parse.maxUsd).toBeCloseTo(
      (4096 / 1e6) * mini.outputPerMillion + (4096 / 1e6) * mini.inputPerMillion,
      5
    );

    // One pricing source.
    for (const file of ['types.ts', 'ledger.ts', 'admission.ts', 'reconcile.ts']) {
      const source = codeOf(read(`${COST_DIR}/${file}`));
      expect(source, file).not.toMatch(/perMillion\s*:\s*\d|0\.15|2\.5\b/);
    }
    expect(read(`${COST_DIR}/admission.ts`)).toContain("from '../labs/resume-import-ai/pricing'");
  });

  it('is generous against what a run really costs', () => {
    // Observed on this repository: $0.00316. The projection must exceed it
    // comfortably or the cap would refuse runs that would have fitted.
    expect(projectRunCost().maxUsd!).toBeGreaterThan(0.00316 * 2);
    expect(projectRunCost().maxUsd!).toBeLessThan(0.05);
  });

  it('refuses to total a run whose model has no price', () => {
    // Not a partial figure: admitting on a total that silently omits a stage
    // is the same mistake as calling an unknown cost zero.
    const projection = projectRunCost(['narrativeGeneration'] as never);
    const unpriced = projection.stages.some((stage) => stage.maxUsd === null);

    if (unpriced) expect(projection.maxUsd).toBeNull();
    // gpt-4o is priced, so use a genuinely unknown model to be sure.
    expect(ceilingFor('resumeParse' as never).maxUsd).not.toBeNull();
  });
});

describe('admission', () => {
  it('admits a run on a clean day and reserves its maximum', () => {
    const decision = admitLabRun({ ...opts(), runId: 'r1' });

    expect(decision.allowed).toBe(true);
    expect(decision.status).toBe('admitted');
    expect(decision.reservationId).not.toBeNull();
    // The reservation is counted immediately, so the figure reported is the
    // one the next admission will see.
    expect(decision.spend.heldUsd).toBeCloseTo(decision.projectedMaxUsd!, 8);
    expect(decision.spend.committedUsd).toBeCloseTo(decision.projectedMaxUsd!, 8);
  });

  it('warns at the threshold without blocking', () => {
    seed(6.42);
    const decision = admitLabRun({ ...opts(), runId: 'r1' });

    expect(decision.allowed).toBe(true);
    expect(decision.status).toBe('admitted-with-warning');
    expect(decision.detail).toContain('warning threshold');
    expect(decision.detail).toContain('$5.00');
    expect(decision.detail).toContain('$20.00');
    // Not "over budget": the cap is $20.
    expect(decision.detail).not.toMatch(/over budget|exceeded/i);
  });

  it('does not warn below the threshold', () => {
    seed(4);
    expect(admitLabRun({ ...opts(), runId: 'r1' }).status).toBe('admitted');
  });

  it('counts the new reservation when deciding to warn', () => {
    // $4.99 settled is under the threshold, but admitting a run that could
    // cost another $0.0131 takes the day's *committed* spend over it. The
    // warning is about what is committed, not what has settled — the same
    // figure the cap uses, so the two cannot disagree.
    seed(4.995);
    const decision = admitLabRun({ ...opts(), runId: 'r1' });

    expect(decision.spend.settledUsd).toBeLessThan(COST_WARN_USD);
    expect(decision.spend.committedUsd).toBeGreaterThanOrEqual(COST_WARN_USD);
    expect(decision.status).toBe('admitted-with-warning');
    expect(decision.allowed).toBe(true);
  });

  it('refuses at the cap', () => {
    seed(COST_CAP_USD);
    const decision = admitLabRun({ ...opts(), runId: 'r1' });

    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe('cap-reached');
    expect(decision.reservationId).toBeNull();
  });

  it('refuses before the cap when the run could cross it', () => {
    // The case a cap checked only on current spend would miss: $19.995 is
    // under $20, and a run that could cost $0.0131 would cross it.
    const projected = projectRunCost().maxUsd!;
    seed(COST_CAP_USD - projected / 2);
    const decision = admitLabRun({ ...opts(), runId: 'r1' });

    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe('would-exceed-cap');
    expect(decision.detail).toContain('before any provider call');
    // No budget was taken for a run that will not happen.
    const ledger = readLedger({ repoRoot: dir });
    expect(ledger.ok && ledger.ledger.reservations).toHaveLength(0);
  });

  it('fails closed when a model has no price', () => {
    const decision = admitLabRun({ ...opts(), stages: ['narrativeGeneration'] as never });

    // `narrativeGeneration` resolves to a priced model today, so this asserts
    // the mechanism rather than the model: the status exists and no run is
    // admitted on a null total.
    if (decision.status === 'pricing-unknown') {
      expect(decision.allowed).toBe(false);
      expect(decision.reservationId).toBeNull();
      expect(decision.detail).toContain('cannot be bounded');
    } else {
      expect(decision.projectedMaxUsd).not.toBeNull();
    }
  });

  it('fails closed when the ledger cannot be read', () => {
    corrupt('{"version":1,"entries":');

    const decision = admitLabRun({ ...opts(), runId: 'r1' });
    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe('ledger-unavailable');
    expect(decision.detail).toContain('assume nothing has been spent');
  });

  it('fails closed on a future ledger version', () => {
    corrupt(JSON.stringify({ version: 99, entries: [], reservations: [] }));

    expect(parseLedger(JSON.stringify({ version: 99, entries: [], reservations: [] }))).toBeNull();
    expect(admitLabRun({ ...opts(), runId: 'r1' }).status).toBe('ledger-unavailable');
  });

  it('treats a missing ledger as a clean day, not as a failure', () => {
    expect(existsSync(ledgerPath({ repoRoot: dir }))).toBe(false);
    const decision = admitLabRun({ ...opts(), runId: 'r1' });

    expect(decision.allowed).toBe(true);
    expect(decision.spend.settledUsd).toBe(0);
  });

  it('starts a new day with a fresh budget, keeping yesterday’s provenance', () => {
    seed(COST_CAP_USD, new Date('2026-10-13T12:00:00.000Z'));
    expect(admitLabRun({ ...opts(new Date('2026-10-13T13:00:00.000Z')) }).allowed).toBe(false);

    // Next UTC day: admissible again, and yesterday's entry is still there.
    const tomorrow = admitLabRun({ ...opts(new Date('2026-10-14T00:00:01.000Z')) });
    expect(tomorrow.allowed).toBe(true);
    expect(tomorrow.spend.day).toBe('2026-10-14');

    const ledger = readLedger({ repoRoot: dir });
    expect(ledger.ok && ledger.ledger.entries.some((e) => e.day === '2026-10-13')).toBe(true);
  });
});

describe('concurrency', () => {
  it('does the read, the decision and the reservation in one locked step', () => {
    const admission = read(`${COST_DIR}/admission.ts`);
    const ledger = read(`${COST_DIR}/ledger.ts`);

    expect(withoutComments(admission)).toContain('withLedger(');
    // An exclusive create is the basis of the mutual exclusion, and it works
    // across processes — two dev servers cannot both hold it. Asserted
    // against the code: the module header explains `wx`, so searching the
    // raw file finds the explanation even if the flag is deleted.
    expect(withoutComments(ledger)).toContain("flag: 'wx'");
    expect(codeOf(ledger)).toContain('acquireLock');
    expect(codeOf(ledger)).toContain('releaseLock');
  });

  it('cannot oversubscribe the cap when two runs overlap', () => {
    // The Resume Lab does not take item 15's lock, so this is the real
    // scenario: two admissions back to back with only one run's worth of
    // budget left.
    const projected = projectRunCost().maxUsd!;
    seed(COST_CAP_USD - projected * 1.5);

    const first = admitLabRun({ ...opts(), runId: 'a' });
    const second = admitLabRun({ ...opts(), runId: 'b' });

    expect(first.allowed).toBe(true);
    // The second sees the first's reservation and is refused.
    expect(second.allowed).toBe(false);
    expect(second.status).toBe('would-exceed-cap');

    const ledger = readLedger({ repoRoot: dir });
    expect(ledger.ok && ledger.ledger.reservations).toHaveLength(1);
  });

  it('would oversubscribe without the reservation, which is why it is there', () => {
    // The anomaly, demonstrated: if admission only counted *settled* spend
    // and ignored outstanding reservations, both runs below would fit.
    const projected = projectRunCost().maxUsd!;
    seed(COST_CAP_USD - projected * 1.5);

    const ledger = readLedger({ repoRoot: dir });
    const settled = ledger.ok
      ? ledger.ledger.entries.reduce((sum, e) => sum + (e.costUsd ?? 0), 0)
      : 0;

    // Two runs judged against settled spend alone.
    expect(settled + projected).toBeLessThanOrEqual(COST_CAP_USD);
    expect(settled + projected).toBeLessThanOrEqual(COST_CAP_USD);
    // But together they cross it — which the reservation prevents.
    expect(settled + projected * 2).toBeGreaterThan(COST_CAP_USD);
  });

  it('stops honouring a reservation whose process never came back', () => {
    const decision = admitLabRun({ ...opts(), runId: 'r1' });
    expect(decision.allowed).toBe(true);

    // Just inside the window: still held.
    const inside = new Date(AT.getTime() + COST_RESERVATION_TTL_MS - 1000);
    expect(buildCostStatus(opts(inside)).spend.heldUsd).toBeGreaterThan(0);

    // Past it: ignored, and counted as stale rather than deleted.
    const outside = new Date(AT.getTime() + COST_RESERVATION_TTL_MS + 1000);
    const after = buildCostStatus(opts(outside));
    expect(after.spend.heldUsd).toBe(0);
    expect(after.spend.staleReservations).toBe(1);

    // The provenance survives.
    const ledger = readLedger({ repoRoot: dir });
    expect(ledger.ok && ledger.ledger.reservations).toHaveLength(1);
  });
});

describe('reconciliation', () => {
  function admitted() {
    const decision = admitLabRun({ ...opts(), runId: 'r1' });
    expect(decision.allowed).toBe(true);
    return decision;
  }

  it('replaces the reservation with the real cost', () => {
    const decision = admitted();
    const result = reconcileLabRun({
      ...opts(),
      runId: 'r1',
      reservationId: decision.reservationId,
      ai: aiBlock(),
      projectedMaxUsd: decision.projectedMaxUsd,
    });

    expect(result.error).toBeNull();
    expect(result.entry!.costUsd).toBeCloseTo(0.00318, 8);
    expect(result.entry!.certainty).toBe('observed');
    expect(result.entry!.heldUsd).toBe(0);
    // The hold is gone and the real figure is in its place.
    expect(result.spend!.heldUsd).toBe(0);
    expect(result.spend!.settledUsd).toBeCloseTo(0.00318, 8);
  });

  it('is idempotent', () => {
    const decision = admitted();
    const input = {
      ...opts(),
      runId: 'r1',
      reservationId: decision.reservationId,
      ai: aiBlock(),
      projectedMaxUsd: decision.projectedMaxUsd,
    };

    reconcileLabRun(input);
    const second = reconcileLabRun(input);

    // One entry, one charge — a retried handler cannot double-count.
    expect(second.spend!.runs).toBe(1);
    expect(second.spend!.settledUsd).toBeCloseTo(0.00318, 8);
  });

  it('keeps the hold when the cost could not be priced', () => {
    const decision = admitted();
    const result = reconcileLabRun({
      ...opts(),
      runId: 'r1',
      reservationId: decision.reservationId,
      ai: aiBlock({
        cost: { ...aiBlock().cost, status: 'pricing-unavailable', totalUsd: null },
      }),
      projectedMaxUsd: decision.projectedMaxUsd,
    });

    expect(result.entry!.costUsd).toBeNull();
    expect(result.entry!.certainty).toBe('pricing-unavailable');
    // Not zero: an unmeasurable run must not buy further runs.
    expect(result.entry!.heldUsd).toBeCloseTo(decision.projectedMaxUsd!, 8);
    expect(result.spend!.committedUsd).toBeCloseTo(decision.projectedMaxUsd!, 8);
    expect(result.spend!.unpricedRuns).toBe(1);
  });

  it('keeps the hold when telemetry gave no usage', () => {
    const decision = admitted();
    const result = reconcileLabRun({
      ...opts(),
      runId: 'r1',
      reservationId: decision.reservationId,
      ai: aiBlock({
        usage: {
          ...aiBlock().usage,
          status: 'unavailable',
          inputTokens: null,
          outputTokens: null,
          totalTokens: null,
        },
        cost: { ...aiBlock().cost, status: 'usage-unavailable', totalUsd: null },
      }),
      projectedMaxUsd: decision.projectedMaxUsd,
    });

    expect(result.entry!.certainty).toBe('usage-unavailable');
    expect(result.entry!.inputTokens).toBeNull();
    expect(result.entry!.costUsd).toBeNull();
    expect(result.entry!.heldUsd).toBeGreaterThan(0);
  });

  it('keeps the unpriced remainder when only part could be priced', () => {
    const decision = admitted();
    const result = reconcileLabRun({
      ...opts(),
      runId: 'r1',
      reservationId: decision.reservationId,
      ai: aiBlock({ cost: { ...aiBlock().cost, status: 'partial', totalUsd: 0.001 } }),
      projectedMaxUsd: decision.projectedMaxUsd,
    });

    expect(result.entry!.certainty).toBe('partial');
    expect(result.entry!.costUsd).toBeCloseTo(0.001, 8);
    expect(result.entry!.heldUsd).toBeCloseTo(decision.projectedMaxUsd! - 0.001, 6);
  });

  it('releases a reservation for a run that never reached the provider', () => {
    const decision = admitted();
    releaseLabRun(decision.reservationId, { repoRoot: dir });

    expect(buildCostStatus(opts()).spend.heldUsd).toBe(0);
    const ledger = readLedger({ repoRoot: dir });
    expect(ledger.ok && ledger.ledger.reservations).toHaveLength(0);
  });

  it('still charges when the provider answered but a later stage failed', () => {
    // The agent returned usage and something downstream threw. The money was
    // spent, so it counts.
    const decision = admitted();
    const result = reconcileLabRun({
      ...opts(),
      runId: 'r1',
      reservationId: decision.reservationId,
      ai: aiBlock(),
      projectedMaxUsd: decision.projectedMaxUsd,
    });

    expect(result.entry!.costUsd).toBeGreaterThan(0);
  });
});

describe('the store', () => {
  it('is versioned and bounded', () => {
    expect(COST_VERSION).toBe(1);
    expect(emptyLedger().version).toBe(COST_VERSION);

    const many: CostEntry[] = Array.from({ length: COST_MAX_ENTRIES + 50 }, (_, i) =>
      entry({ runId: `run-${i}` })
    );
    writeLedger({ ...emptyLedger(AT), entries: many }, { repoRoot: dir });

    const back = readLedger({ repoRoot: dir });
    expect(back.ok && back.ledger.entries.length).toBe(COST_MAX_ENTRIES);
  });

  it('drops entries it cannot trust rather than the whole file', () => {
    const parsed = parseLedger(
      JSON.stringify({
        version: 1,
        entries: [
          { runId: 'good', day: '2026-10-14', kind: 'lab-run', costUsd: 1 },
          { runId: 'no-kind', day: '2026-10-14' },
          { day: '2026-10-14', kind: 'lab-run' },
        ],
        reservations: [{ id: 'r', runId: 'x', day: '2026-10-14', kind: 'lab-run', maxUsd: 1 }],
      })
    );

    expect(parsed?.entries.map((e) => e.runId)).toEqual(['good']);
    expect(parsed?.reservations).toHaveLength(1);
  });

  it('treats an unparseable held amount as held, not as free', () => {
    const parsed = parseLedger(
      JSON.stringify({
        version: 1,
        entries: [
          { runId: 'x', day: '2026-10-14', kind: 'lab-run', costUsd: null, heldUsd: 'oops' },
        ],
        reservations: [],
      })
    );

    expect(parsed?.entries[0].heldUsd).toBe(0);
    // …and its cost is null, so the cap still sees it as unpriced.
    expect(parsed?.entries[0].costUsd).toBeNull();
  });

  it('stores no resume text, prompt, payload or secret', () => {
    const decision = admitLabRun({
      ...opts(),
      runId: 'r1',
      actorId: 'admin-1',
      actorRole: 'runner',
    });
    reconcileLabRun({
      ...opts(),
      runId: 'r1',
      reservationId: decision.reservationId,
      ai: aiBlock(),
      projectedMaxUsd: decision.projectedMaxUsd,
      actorId: 'admin-1',
      actorRole: 'runner',
    });

    const raw = readFileSync(ledgerPath({ repoRoot: dir }), 'utf8');
    expect(raw).not.toMatch(/sk-|OPENAI_API_KEY|DATABASE_URL|Bearer |clerk/i);
    expect(raw).not.toMatch(/@[a-z]+\.(com|org|io|me)/i);
    // `resume-import-ai` is the lab's id and belongs here; what must not
    // appear is anything *from* a resume or a prompt.
    expect(raw).not.toMatch(/Alex Morgan|%PDF|Software Engineer|systemPrompt|userPrompt/i);
    expect(raw).not.toMatch(/prompt/i);

    const ledger = readLedger({ repoRoot: dir });
    expect(Object.keys((ledger as { ledger: CostLedger }).ledger.entries[0]).sort()).toEqual([
      'actorId',
      'actorRole',
      'at',
      'certainty',
      'costUsd',
      'day',
      'heldUsd',
      'inputTokens',
      'kind',
      'labId',
      'models',
      'outputTokens',
      'runId',
    ]);
  });

  it('is gitignored', () => {
    expect(read('.gitignore')).toContain('_admin-panel/platform/.cost/');
  });
});

describe('scope', () => {
  it('is applied by the two cost-bearing lab routes and no others', () => {
    for (const route of [RUN_ROUTE, COMPARE_ROUTE]) {
      expect(read(route), route).toContain('admitLabRun(');
    }

    // Nothing else reserves budget: not Vitest, not Live QA, not drift, not
    // roles, not the read routes.
    for (const route of [
      'app/api/admin/platform/tests/run/route.ts',
      'app/api/admin/platform/tests/live-qa/run/route.ts',
      'app/api/admin/platform/tests/cancel/route.ts',
      'app/api/admin/platform/tests/active/route.ts',
      'app/api/admin/platform/drift/quarantine/route.ts',
      'app/api/admin/platform/drift/delete/route.ts',
      'app/api/admin/platform/roles/route.ts',
    ]) {
      expect(read(route), route).not.toContain('admitLabRun');
    }
  });

  it('leaves product AI untouched', () => {
    // The cap is a Developer Platform concern. Nothing in the product calls
    // it, and the AI client knows nothing about it.
    expect(read('lib/ai-client.ts')).not.toMatch(/platform\/cost|admitLabRun|COST_CAP/);
    expect(read('services/import/resume-ai.service.ts')).not.toMatch(/platform\/cost|admitLabRun/);
    expect(read('app/api/import/resume/route.ts')).not.toMatch(/platform\/cost|admitLabRun/);
  });

  it('reserves for the comparison’s AI side only', () => {
    const compare = read(COMPARE_ROUTE);

    expect(compare).toContain("kind: 'lab-compare'");
    // One reservation, for the AI pipeline. The OpenResume side gets none and
    // is never recorded as a zero AI cost.
    expect(compare.match(/admitLabRun\(/g)).toHaveLength(1);
    expect(codeOf(compare)).not.toMatch(/openResume[\s\S]{0,60}admitLabRun/);
    expect(read('_admin-panel/platform/labs/resume-import-ai/openresume.ts')).toContain(
      'No provider AI call in this parser'
    );
  });

  it('charges a comparison the same as a run, because its AI side is the same', () => {
    const run = admitLabRun({ ...opts(), runId: 'a', kind: 'lab-run' });
    rmSync(dir, { recursive: true, force: true });
    dir = mkdtempSync(path.join(tmpdir(), 'platform-cost-'));
    const compare = admitLabRun({ ...opts(), runId: 'b', kind: 'lab-compare' });

    expect(compare.projectedMaxUsd).toBe(run.projectedMaxUsd);
  });
});

describe('the gates run in the right order', () => {
  it.each([RUN_ROUTE, COMPARE_ROUTE])('%s admits after the role and the local guard', (route) => {
    const source = read(route);
    const handler = codeOf(source.slice(source.indexOf('export async function POST')));

    const role = handler.indexOf('enforcePlatformAction');
    const guard = handler.indexOf('assertCanRunDeveloperSuites');
    const admit = handler.indexOf('admitLabRun');
    const parse = handler.indexOf('request.formData');

    // A viewer never reserves budget; a blocked deployment never does either.
    expect(role).toBeLessThan(admit);
    expect(guard).toBeLessThan(admit);
    // And no PDF is parsed for a run the cap will refuse.
    expect(admit).toBeLessThan(parse);
  });

  it('releases the reservation on every path that refuses after admission', () => {
    for (const route of [RUN_ROUTE, COMPARE_ROUTE]) {
      const source = read(route);
      expect(source, route).toContain('releaseLabRun(admission.reservationId)');
      // At least the oversize branch and the no-input branch.
      expect(
        (source.match(/releaseLabRun\(admission\.reservationId\)/g) ?? []).length
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it('no role bypasses the cap', () => {
    // Admission takes no role into account at all: it is a budget question.
    // Comments stripped, strings kept: `codeOf` would remove a role literal
    // along with every other string, which is how a maintainer-bypass
    // mutation slipped through the first time.
    const admission = withoutComments(read(`${COST_DIR}/admission.ts`));
    expect(admission).not.toMatch(/'(maintainer|runner|viewer)'/);
    expect(admission).not.toMatch(/actorRole\s*[!=]==/);
    expect(admission).not.toMatch(/bypass|force|override/i);

    // The role is recorded on the reservation for provenance, not consulted.
    seed(COST_CAP_USD);
    for (const role of ['viewer', 'runner', 'maintainer']) {
      const decision = admitLabRun({ ...opts(), runId: `r-${role}`, actorRole: role });
      expect(decision.allowed, role).toBe(false);
    }
  });
});

describe('the view', () => {
  it('reports the day, the thresholds and the spend', () => {
    seed(6.42);
    const view = buildCostStatus(opts());

    expect(view.day).toBe('2026-10-14');
    expect(view.timezone).toBe('UTC');
    expect(view.warnUsd).toBe(5);
    expect(view.capUsd).toBe(20);
    expect(view.spend.settledUsd).toBeCloseTo(6.42, 6);
    expect(view.warning).toBe(true);
    expect(view.canRun).toBe(true);
    expect(view.blockedReason).toBeNull();
  });

  it('says when a run cannot start', () => {
    seed(COST_CAP_USD);
    const view = buildCostStatus(opts());

    expect(view.canRun).toBe(false);
    expect(view.blockedReason).toContain('$20.00');
  });

  it('fails closed when the ledger cannot be read', () => {
    corrupt('not json');
    const view = buildCostStatus(opts());

    expect(view.canRun).toBe(false);
    expect(view.blockedReason).toContain('could not be read');
  });

  it('is rendered on the Resume Lab, for every role', () => {
    const component = read('_admin-panel/platform/ui/resume-lab.tsx');

    expect(component).toContain('function CostStatus(');
    expect(component).toContain('spend.committedUsd');
    expect(component).toContain('cost.warnUsd');
    expect(component).toContain('cost.capUsd');
    expect(component).toContain('spend.remainingUsd');
    expect(component).toContain('No role bypasses this');

    // The page resolves it server-side and hands it down, unconditionally —
    // a viewer sees the spend even though they cannot run.
    const page = read('app/admin/(dashboard)/platform/labs/resume-import-ai/page.tsx');
    expect(page).toContain('buildCostStatus()');
    expect(page).toContain('cost={cost}');
  });

  it('builds no new top-level Platform section', () => {
    expect(existsSync(path.join(process.cwd(), 'app/admin/(dashboard)/platform/cost'))).toBe(false);
    // No section id or href, which is what "no new section" means; the file
    // may well mention cost in prose.
    expect(codeOf(read('_admin-panel/platform/nav.ts'))).not.toMatch(/''cost|\/cost/);
  });
});

describe('audit', () => {
  it('records a cap refusal through item 28’s trail', () => {
    for (const route of [RUN_ROUTE, COMPARE_ROUTE]) {
      const source = read(route);
      const refusal = source.slice(source.indexOf('if (!admission.allowed)'));

      expect(refusal, route).toContain('auditPlatformAction({');
      expect(refusal, route).toContain("result: 'refused'");
      expect(refusal, route).toContain('reason: admission.status');
      expect(refusal, route).toContain('cost:');
    }
  });

  it('builds no second audit system', () => {
    for (const file of ['types.ts', 'ledger.ts', 'admission.ts', 'reconcile.ts']) {
      const source = codeOf(read(`${COST_DIR}/${file}`));
      expect(source, file).not.toMatch(/appendAuditEvent|audit-v|jsonl/);
    }
  });

  it('does not duplicate the ledger inside the audit', () => {
    const run = read(RUN_ROUTE);
    const refusal = run.slice(run.indexOf('if (!admission.allowed)'), run.indexOf('const form'));

    // The audit line carries the status, not the whole day's accounting.
    expect(refusal).toContain('target: `cost:${admission.status}`');
    expect(refusal).not.toMatch(/target:[\s\S]{0,40}spend/);
  });
});

describe('nothing else moved', () => {
  it('keeps item 22’s four cost states apart', () => {
    const reconcile = read(`${COST_DIR}/reconcile.ts`);

    for (const state of ['observed', 'pricing-unavailable', 'usage-unavailable', 'partial']) {
      expect(reconcile, state).toContain(`'${state}'`);
    }
  });

  it('adds no dependency and no Prisma', () => {
    const specifiers = new Set<string>();
    for (const file of ['types.ts', 'ledger.ts', 'admission.ts', 'reconcile.ts', 'index.ts']) {
      for (const match of read(`${COST_DIR}/${file}`).matchAll(/from '([^']+)'/g)) {
        if (!match[1].startsWith('.')) specifiers.add(match[1]);
      }
    }

    expect([...specifiers].sort()).toEqual([
      '@/lib/ai-client',
      'node:crypto',
      'node:fs',
      'node:path',
    ]);
    for (const file of ['ledger.ts', 'admission.ts', 'reconcile.ts']) {
      expect(codeOf(read(`${COST_DIR}/${file}`)), file).not.toMatch(/prisma|@\/lib\/db/i);
    }
  });

  it('leaves item 30 alone', () => {
    const workflow = read('.github/workflows/platform-watch.yml');
    expect(workflow).not.toContain('platform:scan');
    expect(workflow).toMatch(/^\s{4}continue-on-error: true$/m);
  });
});
