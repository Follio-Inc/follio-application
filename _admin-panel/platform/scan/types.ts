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

/** Whether a test asserts on behavior or on how the source is written. */
export type TestAssertionStyle = 'behavior' | 'source-text';

/**
 * What the import graph says about a test, against what the map claims.
 *
 * - `mapped` — the graph attributes it to a feature that also lists it
 * - `unlisted` — the graph attributes it to a feature that does *not* list it
 * - `misattributed` — the map lists it under features the graph does not support
 * - `uncategorized` — the graph reaches no feature code at all (platform tests,
 *   shared utilities). A gap, not a contradiction.
 * - `dead-code` — everything it reaches is recorded as an orphan, so it covers
 *   code no shipped entry point can reach
 */
export type TestClassification =
  | 'mapped'
  | 'unlisted'
  | 'misattributed'
  | 'uncategorized'
  | 'dead-code';

/** One test file and what the import graph found in it. */
export type TestFinding = {
  path: string;
  assertion: TestAssertionStyle;
  /** Repo paths the test references directly, sorted. */
  directTargets: string[];
  /** Repo paths reached one hop through a barrel re-export, sorted. */
  barrelTargets: string[];
  /** Specifiers that resolved to nothing on disk — themselves worth knowing. */
  unresolved: string[];
  /** Feature ids the graph attributes it to, sorted. */
  inferredFeatures: string[];
  /** Feature ids whose `unitTests` list it, sorted. */
  declaredFeatures: string[];
  classification: TestClassification;
};

/** A coverage-map `unitTests` entry the import graph cannot support. */
export type StaleTestReference = {
  featureId: string;
  testPath: string;
  /** `missing-file`: nothing on disk. `no-import-link`: exists, reaches elsewhere. */
  reason: 'missing-file' | 'no-import-link';
};

export type TestScanSummary = {
  total: number;
  mapped: number;
  unlisted: number;
  misattributed: number;
  uncategorized: number;
  deadCode: number;
  /** Tests asserting on source text rather than behavior. */
  sourceText: number;
  /** Tests that resolved to no repo path at all. */
  unresolvable: number;
};

/** Signal 2: test files vs the coverage map's `unitTests`, via the import graph. */
export type TestScanReport = {
  signal: 'test-attribution';
  summary: TestScanSummary;
  /** Every test, sorted by path. The lists below are subsets, also sorted. */
  tests: TestFinding[];
  mapped: TestFinding[];
  unlisted: TestFinding[];
  misattributed: TestFinding[];
  uncategorized: TestFinding[];
  deadCode: TestFinding[];
  stale: StaleTestReference[];
};

/**
 * One signal's findings.
 *
 * Discriminated by `signal`, so the CLI and formatter iterate signals rather
 * than knowing about any one of them. Items 6–8 add Live QA pathways, AI
 * stages, flags, Prisma models and reachability as further members.
 */
export type DriftSignalReport = SurfaceScanReport | TestScanReport;

/** The whole scan: every signal that ran, plus whether anything drifted. */
export type DriftReport = {
  signals: DriftSignalReport[];
  /** False when any signal found drift. */
  ok: boolean;
};
