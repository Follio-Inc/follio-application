/**
 * Phase 4, Part 6 — budget ceilings that can actually fire.
 *
 * A limit the platform preempts is not a limit. Each route declares a
 * `maxDuration`, after which the function is killed and whatever the agents
 * were doing disappears into an opaque timeout. For a tree-wide wall-clock
 * ceiling to be worth anything, it has to be reached *before* that happens —
 * otherwise the clean "this request ran too long, here is what we have"
 * message the delegation layer is written to produce is unreachable.
 *
 * The rewrite path had it backwards: `maxTotalDurationMs` was 360s against a
 * 300s route deadline. These tests hold the ordering so it cannot invert
 * again, and they read the route's own `maxDuration` rather than a number
 * written down twice.
 *
 * The measured figures in the comments come from the `AgentRun` rows of real
 * local runs, not from estimates.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { EVALUATION_AGENT_BUDGET } from '@/services/agents/resume/evaluation.agent';
import { JD_MATCH_AGENT_BUDGET } from '@/services/agents/resume/jd-match.agent';
import {
  ORCHESTRATOR_BUDGET,
  ORCHESTRATOR_DELEGATION_LIMITS,
  REWRITE_DELEGATION_LIMITS,
  REWRITE_ORCHESTRATOR_BUDGET,
} from '@/services/agents/resume/orchestrator.agent';
import { REWRITE_AGENT_BUDGET } from '@/services/agents/resume/rewrite.agent';
import { VERIFICATION_AGENT_BUDGET } from '@/services/agents/resume/verification.agent';

/** The `maxDuration` a route declares, in milliseconds. */
function routeDeadlineMs(relativePath: string): number {
  const source = readFileSync(path.join(process.cwd(), relativePath), 'utf8');
  const match = /export const maxDuration = (\d+)/.exec(source);
  expect(match, `${relativePath} must declare maxDuration`).not.toBeNull();
  return Number(match![1]) * 1000;
}

const ANALYSIS_ROUTE = 'app/api/resumes/[resumeId]/agent/route.ts';
const REWRITE_ROUTE = 'app/api/resumes/[resumeId]/rewrite-proposals/route.ts';

describe('every wall-clock ceiling can fire before the platform kills the function', () => {
  it('bounds the rewrite tree below its route deadline', () => {
    const deadline = routeDeadlineMs(REWRITE_ROUTE);

    expect(REWRITE_DELEGATION_LIMITS.maxTotalDurationMs).toBeLessThan(deadline);
    // With enough margin left to serialise and send a reply, rather than
    // finishing at the exact instant the function is cut off.
    expect(deadline - REWRITE_DELEGATION_LIMITS.maxTotalDurationMs).toBeGreaterThanOrEqual(15_000);
  });

  it('bounds the rewrite orchestrator’s own run below the same deadline', () => {
    expect(REWRITE_ORCHESTRATOR_BUDGET.maxDurationMs).toBeLessThan(routeDeadlineMs(REWRITE_ROUTE));
  });

  it('bounds the analysis tree below its route deadline', () => {
    const deadline = routeDeadlineMs(ANALYSIS_ROUTE);
    expect(ORCHESTRATOR_DELEGATION_LIMITS.maxTotalDurationMs).toBeLessThan(deadline);
    expect(ORCHESTRATOR_BUDGET.maxDurationMs).toBeLessThan(deadline);
  });

  it('keeps every specialist’s own budget inside the tree it runs in', () => {
    // A child allowed to outlive its tree would make the tree ceiling a
    // suggestion rather than a bound.
    for (const [name, budget] of [
      ['evaluation', EVALUATION_AGENT_BUDGET],
      ['jd-match', JD_MATCH_AGENT_BUDGET],
      ['rewrite', REWRITE_AGENT_BUDGET],
      ['verification', VERIFICATION_AGENT_BUDGET],
    ] as const) {
      expect(budget.maxDurationMs, name).toBeLessThan(REWRITE_DELEGATION_LIMITS.maxTotalDurationMs);
    }
  });
});

describe('token ceilings leave headroom over what runs actually cost', () => {
  /**
   * Measured from `AgentRun` rows after real local runs:
   *
   *   analysis, evaluation only        5,357 tokens   2 runs    8.6s
   *   analysis, matching + evaluation 13,575 tokens   3 runs   11.6s
   *   rewrite, one round              35,614 tokens   4 runs   24.6s
   *   rewrite, two rounds            114,461 tokens   6 runs   48.3s
   *   rewrite + JD, two rounds       154,211 tokens   7 runs   57.0s
   */
  const OBSERVED_WORST_TOKENS = 154_211;
  const OBSERVED_WORST_MS = 57_000;

  it('sets the rewrite tree ceiling above the worst run observed', () => {
    expect(REWRITE_DELEGATION_LIMITS.maxTotalTokens).toBeGreaterThan(OBSERVED_WORST_TOKENS);
  });

  it('does not set it so high that one request could cost many times that', () => {
    // The cumulative ceiling is checked at delegation boundaries, so the real
    // worst case is the ceiling plus one in-flight run's own budget. Holding
    // that under 4x the worst observed run keeps a runaway bounded at
    // something recognisable rather than open-ended.
    const worstCase =
      (REWRITE_DELEGATION_LIMITS.maxTotalTokens ?? 0) + REWRITE_AGENT_BUDGET.maxTokens;
    expect(worstCase).toBeLessThanOrEqual(OBSERVED_WORST_TOKENS * 4);
  });

  it('leaves real headroom on wall clock', () => {
    expect(REWRITE_DELEGATION_LIMITS.maxTotalDurationMs).toBeGreaterThan(OBSERVED_WORST_MS * 3);
  });

  it('bounds how many agents one request can start', () => {
    // Observed worst was 7 child runs. The cap stops a loop, not a long run.
    expect(REWRITE_DELEGATION_LIMITS.maxChildRuns).toBeGreaterThanOrEqual(7);
    expect(REWRITE_DELEGATION_LIMITS.maxChildRuns).toBeLessThanOrEqual(12);
    expect(REWRITE_DELEGATION_LIMITS.maxDepth).toBe(1);
  });

  it('keeps the analysis path’s ceilings untouched by the rewrite path’s', () => {
    // Widening limits for rewriting must never loosen an ordinary analysis.
    expect(ORCHESTRATOR_DELEGATION_LIMITS.maxChildRuns).toBe(3);
    expect(ORCHESTRATOR_DELEGATION_LIMITS.maxCallsPerTool).toBe(2);
    expect(ORCHESTRATOR_DELEGATION_LIMITS.maxTotalTokens).toBe(200_000);
  });
});
