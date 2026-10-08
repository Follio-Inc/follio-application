/**
 * Coverage map types — the Developer Platform's source of truth for "what does
 * Follio do, where does that live, and what checks it".
 *
 * One typed, versioned record per product feature. The drift scan (PLATFORM_TODO
 * items 4–8) compares the repository against this map, so a field that lies here
 * produces a false drift report. Prefer leaving an optional field unset over
 * guessing at it.
 *
 * Client-safe: types only, no Node APIs.
 */

/**
 * Product areas, in the order a user meets them.
 *
 * A closed union declared from a const array, so the ordering used for grouping
 * cannot drift from the type and a typo cannot silently invent a category. The
 * drift scan reports categories that grow too large or too thin, which only
 * works if the set is stable — add to it deliberately, not per feature.
 */
export const FEATURE_CATEGORIES = [
  'Onboarding',
  'Resume import',
  'Builder',
  'Resumes',
  'Cover letter',
  'Export',
  'Sharing',
  'Public surfaces',
  'Data sources',
  'AI',
  'Portfolio',
  'Integrations',
  'Account',
] as const;

export type FeatureCategory = (typeof FEATURE_CATEGORIES)[number];

/**
 * Whether the feature is live for users.
 *
 * - `shipped` — reachable by a real user on the current branch
 * - `unshipped` — code exists, no user-reachable entry point
 * - `flagged` — reachable only when `flag` is enabled
 * - `deprecated` — superseded; kept until removal is agreed
 */
export type FeatureStatus = 'shipped' | 'unshipped' | 'flagged' | 'deprecated';

/** One Follio feature, as the platform understands it. */
export type PlatformFeature = {
  /** Stable kebab-case id. Referenced by labs, run history, and drift reports. */
  id: string;
  /** Short operator-facing name. */
  name: string;
  /** What a *user* does, in product language — not an implementation summary. */
  userDescription: string;
  /**
   * Repo-relative paths this feature owns. A file or a directory; both are
   * checked for existence by `__tests__/platform-coverage-map.test.ts`, so a
   * moved or deleted path fails the suite rather than rotting silently.
   */
  codeLocations: string[];
  category: FeatureCategory;
  status: FeatureStatus;
  /**
   * Env flag gating the **whole** feature, e.g. `NEXT_PUBLIC_PORTFOLIO_ENABLED`.
   * Leave unset when only part of the feature is gated and say so in `notes` —
   * setting it would wrongly imply the entire feature is off.
   */
  flag?: string;
  /**
   * Id of the feature lab. Names the *intended* lab; lab modules do not exist
   * until PLATFORM_TODO item 20, and nothing validates this field until then.
   */
  lab?: string;
  /**
   * `MAX_TOKENS` keys (`lib/ai-client.ts`) this feature's AI calls run under.
   *
   * Leave unset for a feature that makes no AI call. An empty list and an
   * absent field mean the same thing, and neither is a defect: PLATFORM_TODO
   * item 7 is explicit that a token budget is not what makes something an AI
   * feature — `jd-match` is shipped, in the AI category, and matches lexically.
   *
   * The drift scan reports an entry the budget does not define, and an entry
   * whose call site is not in this feature's `codeLocations`, as stale.
   */
  aiStages?: string[];
  /**
   * `prisma/schema.prisma` models this feature's own code reads or writes.
   *
   * Derived from the query sites in `codeLocations`, not from which models the
   * feature's data happens to touch through relations. Leave unset for a
   * feature with no database access of its own. The drift scan reports an entry
   * the schema does not declare, and an entry this feature never queries, as
   * stale.
   */
  prismaModels?: string[];
  /** Repo-relative Vitest files that cover this feature. Existence is tested. */
  unitTests: string[];
  /** `LIVE_QA_PATHWAYS` ids. Each is resolved against the catalog by the test. */
  pathways: string[];
  /** Anything a reader would otherwise get wrong — gaps, caveats, partial gating. */
  notes?: string;
};

/**
 * A route or page deliberately outside the product inventory.
 *
 * The drift scan treats "not in the map" as a finding, so anything that should
 * never have a feature needs an explicit entry here with a reason. Silence is
 * not an exclusion — an unlisted, unclaimed route is drift.
 */
export type ExcludedPath = {
  /** Repo-relative file or directory. A directory excludes everything under it. */
  path: string;
  /** Why this is not product. Written for someone deciding whether to re-include it. */
  reason: string;
};

/**
 * How a module relates to shipped product behavior.
 *
 * Reachability is not binary, and these three classes exist because three
 * near-identically named services in `services/` sit in three different states.
 * A scan that collapses them would quarantine live code.
 *
 * Note the frame: these describe reachability **from a shipped entry point**,
 * not merely "does anything import this".
 *
 * - `orphan` — not reachable from any shipped entry point. Either nothing
 *   imports it, or every importer is itself an orphan. `importedBy` tells the
 *   two apart: empty means nothing imports it; non-empty means its importers
 *   are dead too, so it is transitively dead.
 * - `module-reachable-call-unused` — a shipped entry point causes the module to
 *   be evaluated (usually through a barrel re-export), but no caller uses any of
 *   its symbols. Deleting it changes runtime behavior; deleting its exports does
 *   not. **This is not an orphan.**
 * - `live` — its symbols are called from shipped code.
 */
export type ReachabilityClass = 'orphan' | 'module-reachable-call-unused' | 'live';

/**
 * A verified reachability finding.
 *
 * Every field is evidence someone checked, not a judgement call, so
 * `__tests__/platform-coverage-map.test.ts` re-derives `importedBy` from the
 * repository on each run. Rewiring any of these modules fails that test rather
 * than silently invalidating the record.
 */
export type ReachabilityRecord = {
  /** Repo-relative module path. A directory covers its whole subtree. */
  path: string;
  reachability: ReachabilityClass;
  /**
   * Every non-test file that imports this module, in any form — alias,
   * relative, or dynamic. Empty only for a module nothing imports at all.
   * Re-derived from the repo by the test, so it must be exhaustive.
   */
  importedBy: string[];
  /**
   * The chain from a shipped entry point down to this module, entry point
   * first. Empty when no such chain exists. Present so the difference between
   * `orphan` and `module-reachable-call-unused` is visible as data.
   */
  entryChain: string[];
  /** Why this class, written for someone deciding whether to delete the module. */
  evidence: string;
  /** Tests covering this module, when the number is itself the finding. */
  tests?: { files: string[]; count: number };
};
