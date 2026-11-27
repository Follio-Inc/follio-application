/**
 * The cost ledger and the lock that makes the cap real
 * (PLATFORM_TODO item 29).
 *
 * Server-only.
 *
 * ## Why a lock exists at all
 *
 * Item 15's execution lock covers Test Console runs. It does **not** cover
 * the Resume Lab: neither `runner.ts`, nor `compare-runner.ts`, nor either
 * route imports `platform/tests/execution`, so two lab runs genuinely can be
 * in flight at once. A cap read as "today's spend is $19, this run fits"
 * would therefore be a time-of-check-to-time-of-use race — two requests both
 * read $19, both decide they fit, and the day ends over the cap.
 *
 * So admission is not a read followed by a write. It is one critical section
 * that reads the ledger, decides, and writes the reservation, guarded by an
 * exclusive lock file. `writeFileSync(…, { flag: 'wx' })` fails if the file
 * exists, which is an atomic create on every platform this runs on, and it
 * works **across processes** — two dev servers, or a route and a CLI, cannot
 * both hold it.
 *
 * ## Stale locks and stale reservations are different problems
 *
 * A lock older than `LOCK_STALE_MS` is assumed to belong to a dead process
 * and is broken, because otherwise one crash wedges the lab forever. A
 * *reservation* older than `COST_RESERVATION_TTL_MS` is ignored when summing,
 * because otherwise one crash holds budget until midnight. Both bounds are
 * stated rather than implied, and neither deletes provenance.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

import {
  COST_CAP_USD,
  COST_MAX_ENTRIES,
  COST_RESERVATION_TTL_MS,
  COST_WARN_USD,
  type CostEntry,
  type CostLedger,
  type CostReservation,
  type DailySpend,
} from './types';

export const COST_VERSION = 1 as const;

/** How long a lock is honoured before it is assumed abandoned. */
export const LOCK_STALE_MS = 15_000;

/** How long a caller waits for the lock before giving up. */
export const LOCK_TIMEOUT_MS = 5_000;

export type LedgerOptions = {
  /** Repository root, so a test writes into a temporary directory. */
  repoRoot?: string;
  now?: () => Date;
};

function root(options: LedgerOptions): string {
  return path.join(options.repoRoot ?? process.cwd(), '_admin-panel', 'platform', '.cost');
}

export function ledgerPath(options: LedgerOptions = {}): string {
  return path.join(root(options), `ledger-v${COST_VERSION}.json`);
}

function lockPath(options: LedgerOptions): string {
  return path.join(root(options), '.lock');
}

/**
 * The accounting day for a timestamp, in UTC.
 *
 * UTC, not the server's zone and never the browser's: the same instant has to
 * map to the same ledger day for everyone who opens the page, and a cap that
 * depends on who is looking is not a cap. `toISOString` is always UTC, so the
 * first ten characters are the UTC date by construction.
 */
export function ledgerDay(at: Date | string): string {
  const iso = typeof at === 'string' ? at : at.toISOString();
  return iso.slice(0, 10);
}

export function emptyLedger(now: Date = new Date()): CostLedger {
  return { version: COST_VERSION, updatedAt: now.toISOString(), entries: [], reservations: [] };
}

/* ===========================================================================
 * Parsing
 * ======================================================================== */

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseEntry(value: unknown): CostEntry | null {
  if (typeof value !== 'object' || value === null) return null;
  const entry = value as Partial<CostEntry>;
  if (typeof entry.runId !== 'string' || typeof entry.day !== 'string') return null;
  if (entry.kind !== 'lab-run' && entry.kind !== 'lab-compare') return null;

  return {
    runId: entry.runId,
    labId: typeof entry.labId === 'string' ? entry.labId : 'unknown',
    kind: entry.kind,
    at: typeof entry.at === 'string' ? entry.at : '',
    day: entry.day,
    models: Array.isArray(entry.models)
      ? entry.models.filter((model): model is string => typeof model === 'string')
      : [],
    inputTokens: isFiniteNumber(entry.inputTokens) ? entry.inputTokens : null,
    outputTokens: isFiniteNumber(entry.outputTokens) ? entry.outputTokens : null,
    costUsd: isFiniteNumber(entry.costUsd) ? entry.costUsd : null,
    certainty:
      entry.certainty === 'observed' ||
      entry.certainty === 'pricing-unavailable' ||
      entry.certainty === 'usage-unavailable' ||
      entry.certainty === 'partial'
        ? entry.certainty
        : 'usage-unavailable',
    // A held amount that will not parse is treated as held, not as free.
    heldUsd: isFiniteNumber(entry.heldUsd) ? Math.max(0, entry.heldUsd) : 0,
    actorId: typeof entry.actorId === 'string' ? entry.actorId : null,
    actorRole: typeof entry.actorRole === 'string' ? entry.actorRole : null,
  };
}

function parseReservation(value: unknown): CostReservation | null {
  if (typeof value !== 'object' || value === null) return null;
  const held = value as Partial<CostReservation>;
  if (typeof held.id !== 'string' || typeof held.runId !== 'string') return null;
  if (typeof held.day !== 'string' || !isFiniteNumber(held.maxUsd)) return null;
  if (held.kind !== 'lab-run' && held.kind !== 'lab-compare') return null;

  return {
    id: held.id,
    runId: held.runId,
    labId: typeof held.labId === 'string' ? held.labId : 'unknown',
    kind: held.kind,
    at: typeof held.at === 'string' ? held.at : '',
    day: held.day,
    maxUsd: Math.max(0, held.maxUsd),
    actorId: typeof held.actorId === 'string' ? held.actorId : null,
    actorRole: typeof held.actorRole === 'string' ? held.actorRole : null,
  };
}

/**
 * Parses a ledger, or returns null.
 *
 * Null means "no usable accounting", which is **not** the same as a clean
 * zero day: the caller refuses to admit a run rather than assuming nothing
 * has been spent. A missing file is a clean zero day; an unreadable one is
 * not.
 */
export function parseLedger(raw: string): CostLedger | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const candidate = parsed as Partial<CostLedger>;
  // A future or unknown version is refused, never half-read: guessing at an
  // accounting format is how a cap stops being one.
  if (candidate.version !== COST_VERSION) return null;
  if (!Array.isArray(candidate.entries) || !Array.isArray(candidate.reservations)) return null;

  return {
    version: COST_VERSION,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : '',
    entries: candidate.entries
      .map(parseEntry)
      .filter((entry): entry is CostEntry => entry !== null)
      .slice(-COST_MAX_ENTRIES),
    reservations: candidate.reservations
      .map(parseReservation)
      .filter((held): held is CostReservation => held !== null),
  };
}

/** The read states a caller must tell apart. */
export type LedgerRead =
  | { ok: true; ledger: CostLedger; fresh: boolean }
  | { ok: false; reason: 'unreadable' };

export function readLedger(options: LedgerOptions = {}): LedgerRead {
  const file = ledgerPath(options);
  const now = (options.now ?? (() => new Date()))();

  // No file is a genuine zero day: nothing has been spent here yet.
  if (!existsSync(file)) return { ok: true, ledger: emptyLedger(now), fresh: true };

  try {
    const parsed = parseLedger(readFileSync(file, 'utf8'));
    return parsed === null
      ? { ok: false, reason: 'unreadable' }
      : { ok: true, ledger: parsed, fresh: false };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}

export function writeLedger(ledger: CostLedger, options: LedgerOptions = {}): void {
  const file = ledgerPath(options);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(
    file,
    `${JSON.stringify({ ...ledger, entries: ledger.entries.slice(-COST_MAX_ENTRIES) }, null, 2)}\n`,
    'utf8'
  );
}

/* ===========================================================================
 * The lock
 * ======================================================================== */

/** Whether a reservation is still within its time to live. */
export function isLive(reservation: CostReservation, now: Date): boolean {
  const at = Date.parse(reservation.at);
  if (Number.isNaN(at)) return false;
  return now.getTime() - at < COST_RESERVATION_TTL_MS;
}

function acquireLock(options: LedgerOptions): boolean {
  const file = lockPath(options);
  mkdirSync(path.dirname(file), { recursive: true });

  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      // `wx` fails when the file exists — an atomic create, and the whole
      // basis of the mutual exclusion.
      writeFileSync(file, String(process.pid), { flag: 'wx' });
      return true;
    } catch {
      // Held. Break it if whoever holds it is plainly gone.
      try {
        const age = Date.now() - statSync(file).mtimeMs;
        if (age > LOCK_STALE_MS) {
          rmSync(file, { force: true });
          continue;
        }
      } catch {
        // It vanished between the failed create and the stat; try again.
        continue;
      }

      if (Date.now() > deadline) return false;
      // A short synchronous wait. The critical section is a file read, a
      // little arithmetic and a file write, so contention is measured in
      // milliseconds.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
}

function releaseLock(options: LedgerOptions): void {
  try {
    rmSync(lockPath(options), { force: true });
  } catch {
    // Nothing to do: a lock that cannot be removed goes stale and is broken.
  }
}

/**
 * Runs `body` with the ledger locked, handing it the current ledger and
 * persisting whatever it returns.
 *
 * This is the only way admission and reconciliation touch the ledger, which
 * is what makes "read the spend, decide, write the reservation" one
 * indivisible step rather than three racing ones.
 */
export function withLedger<T>(
  body: (ledger: CostLedger) => { ledger: CostLedger; result: T },
  options: LedgerOptions = {}
): { ok: true; result: T } | { ok: false; reason: 'unreadable' | 'locked' | 'write-failed' } {
  if (!acquireLock(options)) return { ok: false, reason: 'locked' };

  try {
    const read = readLedger(options);
    if (!read.ok) return { ok: false, reason: 'unreadable' };

    const { ledger, result } = body(read.ledger);

    try {
      writeLedger(ledger, options);
    } catch {
      // A ledger that cannot be written cannot account for a run, so the
      // caller must not proceed as though it had.
      return { ok: false, reason: 'write-failed' };
    }

    return { ok: true, result };
  } finally {
    releaseLock(options);
  }
}

/* ===========================================================================
 * Summing a day
 * ======================================================================== */

/**
 * What a day has committed.
 *
 * Settled priced spend **plus** everything still held: live reservations, and
 * settled runs whose cost could not be priced. Holding the unpriceable ones
 * is the conservative choice item 29 asks for — a run whose cost is unknown
 * must not read as free and buy further runs.
 */
export function spendFor(ledger: CostLedger, day: string, now: Date): DailySpend {
  const entries = ledger.entries.filter((entry) => entry.day === day);
  const sameDay = ledger.reservations.filter((held) => held.day === day);
  const live = sameDay.filter((held) => isLive(held, now));

  const settledUsd = entries.reduce((sum, entry) => sum + (entry.costUsd ?? 0), 0);
  const heldFromEntries = entries.reduce((sum, entry) => sum + entry.heldUsd, 0);
  const heldFromReservations = live.reduce((sum, held) => sum + held.maxUsd, 0);
  const heldUsd = heldFromEntries + heldFromReservations;
  const committedUsd = settledUsd + heldUsd;

  return {
    day,
    settledUsd: round(settledUsd),
    heldUsd: round(heldUsd),
    committedUsd: round(committedUsd),
    remainingUsd: round(Math.max(0, COST_CAP_USD - committedUsd)),
    runs: entries.length,
    unpricedRuns: entries.filter((entry) => entry.costUsd === null).length,
    staleReservations: sameDay.length - live.length,
  };
}

export function isWarning(spend: DailySpend): boolean {
  return spend.committedUsd >= COST_WARN_USD;
}

/** Rounded to the hundred-thousandth: these are fractions of a cent. */
export function round(usd: number): number {
  return Math.round(usd * 1e5) / 1e5;
}

/* ===========================================================================
 * Mutations, all inside the lock
 * ======================================================================== */

export function addReservation(
  ledger: CostLedger,
  reservation: Omit<CostReservation, 'id'>,
  id: string = randomUUID()
): { ledger: CostLedger; reservation: CostReservation } {
  const held: CostReservation = { id, ...reservation };
  return {
    ledger: { ...ledger, reservations: [...ledger.reservations, held] },
    reservation: held,
  };
}

export function dropReservation(ledger: CostLedger, reservationId: string): CostLedger {
  return {
    ...ledger,
    reservations: ledger.reservations.filter((held) => held.id !== reservationId),
  };
}

/**
 * Replaces a reservation with what the run actually cost.
 *
 * Idempotent on `runId`: reconciling twice settles once. A run that reports a
 * cost releases its hold; one that cannot keeps it, which is what stops an
 * unmeasurable run from freeing budget it may well have spent.
 */
export function settle(
  ledger: CostLedger,
  reservationId: string | null,
  entry: CostEntry
): CostLedger {
  const already = ledger.entries.some((existing) => existing.runId === entry.runId);
  const withoutReservation =
    reservationId === null ? ledger : dropReservation(ledger, reservationId);

  if (already) return withoutReservation;

  return {
    ...withoutReservation,
    entries: [...withoutReservation.entries, entry].slice(-COST_MAX_ENTRIES),
  };
}
