/**
 * Blackboard keys for the multi-agent resume execution.
 *
 * Their own module so every agent in the tree can name the same key without
 * importing the orchestrator — which would be a cycle, since the orchestrator
 * imports each of them.
 *
 * Each key is read back under the namespace of the agent that wrote it (see
 * lib/agents/shared-state.ts), so a key name alone cannot be used to forge a
 * finding: `getFrom('resume-evaluation', SHARED_EVALUATION_KEY)` returns the
 * Evaluation Agent's output or nothing at all.
 */

/** Written by `resume-evaluation`. */
export const SHARED_EVALUATION_KEY = 'evaluation';

/** Written by `resume-jd-match`. */
export const SHARED_MATCHING_KEY = 'matching';

/** Written by `resume-rewrite`. The latest batch of edit proposals. */
export const SHARED_PROPOSALS_KEY = 'proposals';

/** Written by `resume-verification`. Verdicts on the latest batch. */
export const SHARED_VERDICTS_KEY = 'verdicts';
