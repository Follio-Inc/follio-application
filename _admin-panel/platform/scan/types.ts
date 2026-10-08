/**
 * Drift scan result types.
 *
 * The scan compares the repository against the coverage map. It owns no mapping
 * of its own: feature `codeLocations` and `EXCLUDED` are the only source of
 * truth, so a path's classification can always be traced back to a map entry.
 *
 * Shaped for reuse. The CLI, the CI job (PLATFORM_TODO item 9) and the Drift
 * page (item 17) all read the same structured report rather than re-deriving
 * anything or parsing text.
 *
 * Client-safe: types only, no Node APIs.
 */

/** What kind of product surface a discovered file is. */
export type SurfaceKind = 'page' | 'route';

/**
 * How a discovered path relates to the coverage map.
 *
 * - `mapped` — claimed by at least one feature's `codeLocations`
 * - `excluded` — covered by an `EXCLUDED` entry
 * - `unmapped` — neither. This is drift: a surface nobody has accounted for.
 */
export type SurfaceClassification = 'mapped' | 'excluded' | 'unmapped';

/** One discovered page or route, and why it landed in its class. */
export type SurfaceFinding = {
  /** Repo-relative POSIX path, e.g. `app/api/resumes/route.ts`. */
  path: string;
  kind: SurfaceKind;
  classification: SurfaceClassification;
  /**
   * Feature ids claiming this path, sorted. A path may legitimately have
   * several: `/onboarding/import` is both an onboarding step and the
   * resume-import entry point. Empty unless `mapped`.
   */
  claimedBy: string[];
  /**
   * The exact map entry that produced the classification — a feature's
   * `codeLocations` value or an `EXCLUDED` path. Present so a reader can go
   * check the claim instead of guessing which entry matched. Absent for
   * `unmapped`.
   */
  matchedBy?: string;
};

export type SurfaceScanSummary = {
  total: number;
  mapped: number;
  excluded: number;
  unmapped: number;
  /** Discovered counts by kind, so a collapsed walker is visible in the report. */
  pages: number;
  routes: number;
};

/**
 * Signal 1: product surface vs the coverage map.
 *
 * Deliberately carries no timestamp. The report is meant to be diffable between
 * runs and across CI jobs, so two scans of the same tree must be byte-identical.
 */
export type SurfaceScanReport = {
  signal: 'product-surface';
  summary: SurfaceScanSummary;
  /** Each list sorted by path, so output never depends on walk order. */
  mapped: SurfaceFinding[];
  excluded: SurfaceFinding[];
  unmapped: SurfaceFinding[];
};

/**
 * One signal's findings.
 *
 * A union with a single member today. Items 5–8 add tests, Live QA pathways,
 * AI stages, flags, Prisma models and reachability as further members, each
 * discriminated by its own `signal` literal — the CLI and the report formatter
 * iterate signals rather than knowing about any one of them.
 */
export type DriftSignalReport = SurfaceScanReport;

/** The whole scan: every signal that ran, plus whether anything drifted. */
export type DriftReport = {
  signals: DriftSignalReport[];
  /** False when any signal found drift. */
  ok: boolean;
};
