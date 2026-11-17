/**
 * Admission control for the Resume Agent.
 *
 * Why this is not just a row count:
 *
 * `persistAgentRun` writes the AgentRun row from the runtime's `finish()`
 * step, which only runs once the agent has succeeded or failed. Nothing is
 * persisted while a run is in flight, so counting AgentRun rows alone sees
 * zero for every request that is still running. N simultaneous requests would
 * all read the same total and all be admitted.
 *
 * So the budget is counted from two places:
 *   - finished runs (success and failure alike) from AgentRun, which survives
 *     restarts and is shared across instances;
 *   - runs in flight right now, held in this process.
 *
 * The in-flight half is per-process. On a single instance it is exact, because
 * the check and the reservation happen in one synchronous block that nothing
 * can interleave with. Across several serverless instances it is not: each
 * holds its own map, so concurrent requests landing on different instances can
 * still overshoot by up to one in-flight run per instance. Closing that needs
 * shared state (a `status: 'running'` row written at start, or Redis), which
 * is a schema or dependency change. This is a development and demo guard, not
 * a production-grade limiter.
 */

import { db } from '@/lib/db';
import { Errors } from '@/lib/errors';
import { logger } from '@/lib/logger';

import type { AgentId } from '@/types/agents';

const rateLimitLogger = logger.child({ source: 'resume-agent-rate-limit' });

const RESUME_AGENT_ID: AgentId = 'resume-agent';
const DAY_MS = 24 * 60 * 60 * 1000;

export const RESUME_AGENT_LIMITS = {
  /** Runs one user may start per rolling day, finished and in flight together. */
  dailyRuns: 20,
  /** Runs one user may have in flight at once, on this instance. */
  maxConcurrent: 2,
} as const;

/** userId -> runs currently in flight in this process. */
const inFlightByUser = new Map<string, number>();

function inFlightFor(userId: string): number {
  return inFlightByUser.get(userId) ?? 0;
}

function hold(userId: string): void {
  inFlightByUser.set(userId, inFlightFor(userId) + 1);
}

function drop(userId: string): void {
  const next = inFlightFor(userId) - 1;
  if (next > 0) {
    inFlightByUser.set(userId, next);
  } else {
    inFlightByUser.delete(userId);
  }
}

/** Finished runs this user started in the last rolling day, failures included. */
async function recentRunCount(userId: string): Promise<number> {
  return db.agentRun.count({
    where: {
      agentId: RESUME_AGENT_ID,
      userId,
      startedAt: { gt: new Date(Date.now() - DAY_MS) },
    },
  });
}

/**
 * Claim one run for this user, or throw a 429.
 *
 * Call before anything that costs money, and always call the returned release
 * from a `finally` — a reservation that is never released leaks a slot until
 * the process restarts.
 */
export async function reserveResumeAgentRun(userId: string): Promise<() => void> {
  // Read and reserve in one synchronous block. Node runs this to completion
  // before any other request resumes, so two callers can never both observe
  // the same count and both be admitted on this instance.
  const running = inFlightFor(userId);
  if (running >= RESUME_AGENT_LIMITS.maxConcurrent) {
    throw Errors.rateLimited(
      'An analysis is already running for your account. Wait for it to finish, then try again.'
    );
  }
  hold(userId);

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    drop(userId);
  };

  try {
    const finished = await recentRunCount(userId);
    // `running` excludes the slot just taken, so admitting this one brings the
    // day's total to finished + running + 1.
    if (finished + running >= RESUME_AGENT_LIMITS.dailyRuns) {
      rateLimitLogger.warn('Resume agent daily limit reached', {
        userId,
        finished,
        inFlight: running,
        limit: RESUME_AGENT_LIMITS.dailyRuns,
      });
      throw Errors.rateLimited("You've used today's resume analyses. Try again tomorrow.");
    }
  } catch (error) {
    // Includes the throw above and any database failure. Never hold a slot
    // for a request that is not going to run.
    release();
    throw error;
  }

  return release;
}

/** Test seam: forget every in-flight reservation in this process. */
export function __resetResumeAgentRateLimit(): void {
  inFlightByUser.clear();
}
