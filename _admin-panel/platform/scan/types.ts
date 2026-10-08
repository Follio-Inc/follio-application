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

/** Whether a catalog pathway has an owner in the coverage map. */
export type PathwayClassification = 'mapped' | 'unmapped';

/** One Live QA pathway, as the catalog defines it and the map claims it. */
export type PathwayFinding = {
  /** `LIVE_QA_PATHWAYS` id. */
  id: string;
  /** `spec` exactly as the catalog records it, relative to the Live QA root. */
  spec: string;
  /** Repo-relative spec path, or null when the file is absent — itself drift. */
  specPath: string | null;
  area: string;
  requiresAuth: boolean;
  stability: string;
  /** Feature ids whose `pathways` list this id, sorted. */
  claimedBy: string[];
  classification: PathwayClassification;
};

/** A coverage-map `pathways` entry naming an id the catalog does not define. */
export type StalePathwayReference = {
  featureId: string;
  pathwayId: string;
  reason: 'unknown-pathway';
};

export type PathwayScanSummary = {
  total: number;
  mapped: number;
  unmapped: number;
  /** Catalog entries whose spec file is missing from disk. */
  missingSpec: number;
  /** `*.spec.ts` files under `pathways/` with no catalog entry. */
  orphanSpecs: number;
  featuresWithPathway: number;
  featuresWithoutPathway: number;
};

/** Signal 3: the Live QA catalog vs the coverage map and the specs on disk. */
export type PathwayScanReport = {
  signal: 'live-qa-pathways';
  summary: PathwayScanSummary;
  /** Every catalog pathway, sorted by id. The lists below are sorted subsets. */
  pathways: PathwayFinding[];
  mapped: PathwayFinding[];
  unmapped: PathwayFinding[];
  missingSpec: PathwayFinding[];
  /** Repo-relative spec paths the catalog does not mention, sorted. */
  orphanSpecs: string[];
  stale: StalePathwayReference[];
  /**
   * Features with no pathway at all, sorted.
   *
   * Reported, never counted as drift. Most areas genuinely have no browser
   * coverage yet, and inventing ownership to shrink this list would turn an
   * honest gap into a false claim.
   */
  featuresWithoutPathway: string[];
};

/**
 * Whether a repository fact has an owner in the coverage map.
 *
 * `mapped` means the same thing it means in signal 1: some feature's
 * `codeLocations` cover the file where the fact is used. Whether a feature also
 * *declares* the fact (`aiStages`, `prismaModels`, `flag`) is a second,
 * stricter statement, carried separately on each finding so the gap between
 * "owned in code" and "written down" stays visible.
 */
export type OwnershipClassification = 'mapped' | 'unclaimed';

/** One `MAX_TOKENS` key, as the budget defines it and the map claims it. */
export type AiStageFinding = {
  /** Key of the token budget, e.g. `narrativeGeneration`. */
  stage: string;
  /** Source files naming it in a call, sorted. Empty means nothing calls it. */
  usedBy: string[];
  /** Feature ids whose `codeLocations` cover a call site, sorted. */
  inferredFeatures: string[];
  /** Feature ids whose `aiStages` list it, sorted. */
  declaredFeatures: string[];
  classification: OwnershipClassification;
};

/** A coverage-map `aiStages` entry the repository cannot support. */
export type StaleAiStageReference = {
  featureId: string;
  stage: string;
  /**
   * `unknown-stage`: the token budget defines no such key.
   * `no-usage-link`: the key exists, but no call site sits in this feature's code.
   */
  reason: 'unknown-stage' | 'no-usage-link';
};

export type AiStageScanSummary = {
  /** Keys the budget defines. */
  total: number;
  /** Keys whose call site sits in some feature's `codeLocations`. */
  mapped: number;
  unclaimed: number;
  /** Keys some feature's `aiStages` names. */
  declared: number;
  /** Budgeted keys no call site names. */
  unused: number;
  /** Features whose own code imports the AI client. */
  aiFeatures: number;
  /** Of those, how many declare no stage. */
  aiFeaturesWithoutStage: number;
};

/**
 * Signal 4: the AI token budget vs the coverage map's declared stages.
 *
 * A `MAX_TOKENS` key is one input and never the gate on "is this an AI
 * feature" — `jd-match` ships with no key because its matching is lexical. The
 * gap lists below keep that distinction in the data rather than in prose.
 */
export type AiStageScanReport = {
  signal: 'ai-stages';
  summary: AiStageScanSummary;
  /** Every budgeted stage, sorted by name. The lists below are sorted subsets. */
  stages: AiStageFinding[];
  mapped: AiStageFinding[];
  unclaimed: AiStageFinding[];
  unused: AiStageFinding[];
  /** Owned by a feature's code, named in no feature's `aiStages`. Gaps. */
  undeclared: AiStageFinding[];
  stale: StaleAiStageReference[];
  /**
   * Stages named at a call site that the budget does not define, sorted.
   *
   * Legal at runtime — the client falls back to its default allowance — so
   * reported, not failed. It still means that call has no reviewed budget.
   */
  unbudgetedStages: string[];
  /**
   * Features that import the AI client but declare no stage, sorted. Gaps.
   */
  aiFeaturesWithoutStage: string[];
  /**
   * AI-category features whose code imports no AI client, sorted.
   *
   * Not a gap at all: these are deterministic features in the AI category, and
   * expecting a token budget from them is what item 7 warns against.
   */
  aiFeaturesWithoutClient: string[];
};

/** One feature flag, as its module declares it and the map claims it. */
export type FlagFinding = {
  /** Env var name, e.g. `NEXT_PUBLIC_PORTFOLIO_ENABLED`. */
  flag: string;
  /** Exported helpers in the flag module that gate on it, sorted. */
  helpers: string[];
  /**
   * Files outside the flag module that read the env var or import a helper,
   * sorted. This is where the flag is actually enforced.
   */
  enforcedIn: string[];
  /** Feature ids whose `codeLocations` cover an enforcement site, sorted. */
  inferredFeatures: string[];
  /** Feature ids whose `flag` names it, sorted. */
  declaredFeatures: string[];
  classification: OwnershipClassification;
};

/** A coverage-map `flag` the repository cannot support. */
export type StaleFlagReference = {
  featureId: string;
  flag: string;
  /**
   * `unknown-flag`: the flag module declares no such flag.
   * `no-enforcement-link`: it exists, but nothing in this feature's code gates on it.
   */
  reason: 'unknown-flag' | 'no-enforcement-link';
};

/** A feature gating on a flag it does not declare — partial gating. */
export type PartialGating = { featureId: string; flag: string };

export type FlagScanSummary = {
  /** Flags the flag module declares. */
  total: number;
  /** Flags enforced in code some feature's `codeLocations` cover. */
  mapped: number;
  unclaimed: number;
  /** Flags some feature's `flag` names. */
  declared: number;
  /** Declared flags nothing outside the flag module reads. */
  unenforced: number;
  /** Features carrying a `flag`. */
  gatedFeatures: number;
};

/** Signal 5: declared feature flags vs the coverage map's `flag` fields. */
export type FlagScanReport = {
  signal: 'feature-flags';
  summary: FlagScanSummary;
  /** Every declared flag, sorted by name. The lists below are sorted subsets. */
  flags: FlagFinding[];
  mapped: FlagFinding[];
  unclaimed: FlagFinding[];
  unenforced: FlagFinding[];
  stale: StaleFlagReference[];
  /**
   * Features whose code reads a flag they do not declare, sorted.
   *
   * Reported, never failed. `flag` means the *whole* feature is gated, and
   * `public-follio` gates one door — setting `flag` there would be the lie.
   */
  partiallyGated: PartialGating[];
};

/** One Prisma model, as the schema declares it and the map claims it. */
export type PrismaModelFinding = {
  /** Schema name, e.g. `ShareToken`. */
  model: string;
  /** Prisma client property for it, e.g. `shareToken`. */
  delegate: string;
  /** Source files querying the delegate, sorted. */
  usedBy: string[];
  /** Feature ids whose `codeLocations` cover a query site, sorted. */
  inferredFeatures: string[];
  /** Feature ids whose `prismaModels` list it, sorted. */
  declaredFeatures: string[];
  classification: OwnershipClassification;
};

/** A coverage-map `prismaModels` entry the repository cannot support. */
export type StalePrismaReference = {
  featureId: string;
  model: string;
  /**
   * `unknown-model`: the schema declares no such model.
   * `no-usage-link`: it exists, but no query site sits in this feature's code.
   */
  reason: 'unknown-model' | 'no-usage-link';
};

export type PrismaScanSummary = {
  /** Models the schema declares. */
  total: number;
  /** Models queried from code some feature's `codeLocations` cover. */
  mapped: number;
  unclaimed: number;
  /** Models some feature's `prismaModels` names. */
  declared: number;
  /** Models no query in product source names. */
  unused: number;
};

/** Signal 6: the Prisma schema vs the coverage map's declared models. */
export type PrismaScanReport = {
  signal: 'prisma-models';
  summary: PrismaScanSummary;
  /** Every schema model, sorted by name. The lists below are sorted subsets. */
  models: PrismaModelFinding[];
  mapped: PrismaModelFinding[];
  unclaimed: PrismaModelFinding[];
  unused: PrismaModelFinding[];
  /**
   * Queried by a feature's code, named in no feature's `prismaModels`. Gaps.
   *
   * Expected for the shared tables: `Profile` is queried by seventeen features
   * and `User` by fourteen, and declaring them in all of them would record
   * ownership nobody has.
   */
  undeclared: PrismaModelFinding[];
  stale: StalePrismaReference[];
};

/**
 * One signal's findings.
 *
 * Discriminated by `signal`, so the CLI and formatter iterate signals rather
 * than knowing about any one of them. Item 8 adds reachability as a further
 * member.
 */
export type DriftSignalReport =
  | SurfaceScanReport
  | TestScanReport
  | PathwayScanReport
  | AiStageScanReport
  | FlagScanReport
  | PrismaScanReport;

/** The whole scan: every signal that ran, plus whether anything drifted. */
export type DriftReport = {
  signals: DriftSignalReport[];
  /** False when any signal found drift. */
  ok: boolean;
};
