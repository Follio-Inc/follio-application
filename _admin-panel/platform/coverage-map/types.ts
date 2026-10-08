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
