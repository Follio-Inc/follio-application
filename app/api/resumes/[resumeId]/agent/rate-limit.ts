/**
 * Rate limit for the Resume Agent endpoint.
 *
 * Every call to this route spends OpenAI tokens, so the guard exists to stop
 * accidental repetition — a double-clicked button, a retry loop, a component
 * that re-runs on every render — rather than to defend against an attacker.
 *
 * Process-local on purpose. Follio has no Redis and the task forbids Prisma
 * model changes, so there is nowhere durable to keep a counter. This uses the
 * same module-level `Map` pattern as `lib/brand-insight/cache.ts`.
 *
 * What that means in practice, stated plainly so nobody assumes more:
 *   - counts reset when the server restarts;
 *   - each serverless instance counts separately, so N instances allow up to
 *     N times the quota;
 *   - it is a guard, not a guarantee.
 *
 * A durable limit needs a shared store, which is a schema/infra decision
 * outside this change.
 */

/** Rolling window for the per-user quota. */
const WINDOW_MS = 10 * 60 * 1000;

/** Completed or in-flight runs allowed per user per window. */
const MAX_RUNS_PER_WINDOW = 5;

/** Entries idle for longer than this are dropped so the Map cannot grow forever. */
const IDLE_EVICTION_MS = WINDOW_MS * 2;

interface Entry {
  /** Start times of runs inside the current window. */
  starts: number[];
  /** A user may only have one run in flight; blocks double-clicks. */
  inFlight: boolean;
  lastSeen: number;
}

const entries = new Map<string, Entry>();

export type RateLimitRejection =
  | { allowed: true }
  | { allowed: false; reason: 'concurrent' | 'quota'; retryAfterSeconds: number };

function evictIdle(now: number): void {
  for (const [key, entry] of entries) {
    if (!entry.inFlight && now - entry.lastSeen > IDLE_EVICTION_MS) {
      entries.delete(key);
    }
  }
}

/**
 * Slots one run consumes from the window.
 *
 * A multi-agent request runs an orchestrator plus one or two specialists, so
 * it costs roughly two to three times a single-agent request in tokens and
 * wall-clock. Charging it one slot would let the orchestrated path spend
 * several times the budget the limit was sized for, so it is charged two.
 *
 * This is still a guard against accidental repetition, not a billing system —
 * see the note at the top of this file about it being process-local.
 */
export const RUN_COST = {
  singleAgent: 1,
  multiAgent: 2,
} as const;

/**
 * Reserve run slots for `userId`.
 *
 * On `{ allowed: true }` the caller MUST eventually call `releaseAgentRun`,
 * including when the run throws — otherwise the user is stuck behind their own
 * in-flight flag until the process restarts.
 *
 * `cost` is how many slots this run takes. A request that cannot afford its
 * full cost is refused outright rather than part-charged, so an expensive run
 * never starts on a budget sized for a cheap one.
 */
export function acquireAgentRun(
  userId: string,
  now: number = Date.now(),
  cost: number = RUN_COST.singleAgent
): RateLimitRejection {
  evictIdle(now);

  const entry = entries.get(userId) ?? { starts: [], inFlight: false, lastSeen: now };
  entry.lastSeen = now;

  // Drop anything that has aged out of the window.
  entry.starts = entry.starts.filter((start) => now - start < WINDOW_MS);

  if (entry.inFlight) {
    entries.set(userId, entry);
    return { allowed: false, reason: 'concurrent', retryAfterSeconds: 5 };
  }

  const charge = Math.max(1, Math.floor(cost));

  if (entry.starts.length + charge > MAX_RUNS_PER_WINDOW) {
    entries.set(userId, entry);
    // The oldest run is what frees up the next slot.
    const oldest = entry.starts.length > 0 ? Math.min(...entry.starts) : now;
    const retryAfterSeconds = Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000));
    return { allowed: false, reason: 'quota', retryAfterSeconds };
  }

  // One timestamp per slot charged, so the cost ages out of the window the
  // same way a single run's does.
  for (let i = 0; i < charge; i++) entry.starts.push(now);
  entry.inFlight = true;
  entries.set(userId, entry);
  return { allowed: true };
}

/** Clear the in-flight flag. The run still counts against the window. */
export function releaseAgentRun(userId: string): void {
  const entry = entries.get(userId);
  if (entry) {
    entry.inFlight = false;
    entry.lastSeen = Date.now();
  }
}

/** Test seam. Not called by application code. */
export function resetAgentRateLimit(): void {
  entries.clear();
}

export const RATE_LIMIT = {
  windowMs: WINDOW_MS,
  maxRunsPerWindow: MAX_RUNS_PER_WINDOW,
} as const;
