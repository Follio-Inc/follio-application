/**
 * The drift report, shaped for the page (PLATFORM_TODO item 17).
 *
 * Client-safe: types only, no `node:` import and nothing from
 * `platform/scan/`, which walks the filesystem and loads the TypeScript
 * compiler. The view renders one of these; the route builds it.
 *
 * It is a **projection, not a second opinion**. Every number and every line
 * comes from the typed `DriftReport` the existing scanner already produces —
 * nothing here re-derives a classification, re-reads the repository or decides
 * what counts as drift. `ok` is the scanner's own flag, passed through
 * untouched, so the page cannot disagree with `npm run platform:scan`.
 *
 * The shape is deliberately uniform: eight of the nine signals become counts
 * plus named groups of findings, so one component renders them all and a tenth
 * signal needs no new component. Category health keeps its own table, because
 * it is a table of columns rather than a list of findings.
 */

/**
 * How seriously to read a group of findings.
 *
 * - `contradiction` — the map and the repository disagree, and this list is a
 *   term in the scanner's own `ok`. These are what make the scan fail.
 * - `inconsistency` — the map or the catalog points at something that is not
 *   there. Also a disagreement, but **not** one the scan currently fails on;
 *   each group says so, and `failsScan` carries it in the data.
 * - `gap` — something real that nothing claims, or a representation the product
 *   does not have yet. Recorded, never a defect. Each group's note says why.
 */
export type DriftSeverity = 'contradiction' | 'inconsistency' | 'gap';

/** One finding, already formatted from the signal's own typed fields. */
export type DriftEntry = {
  /** The thing itself: a repo path, a pathway id, a flag, a model, a stage. */
  label: string;
  /** What the report says about it, in one line. Null when the label says all. */
  detail: string | null;
  /** Further evidence the report carried, one line each. */
  evidence: string[];
};

/** One of a signal's lists, with how to read it. */
export type DriftFindingGroup = {
  /** The report field this came from, e.g. `unmapped`, `stale`, `deadEnds`. */
  id: string;
  title: string;
  severity: DriftSeverity;
  /** Why this list matters, or why it is not a defect. One sentence. */
  note: string;
  /** Whether this list is a term in `DriftReport.ok`. */
  failsScan: boolean;
  entries: DriftEntry[];
  /** Entries beyond the render cap, so a long list is never silently cut. */
  omitted: number;
};

/** One labelled number from a signal's summary. */
export type DriftCount = {
  label: string;
  value: number;
  /** What the number means, when the label cannot say it. */
  hint?: string;
};

/** One signal, as the page shows it. */
export type DriftSignalView = {
  /** The report's own discriminator, verbatim. */
  signal: string;
  title: string;
  /** What this signal compares, in one sentence. */
  checks: string;
  counts: DriftCount[];
  /** Non-empty groups only, contradictions first. */
  groups: DriftFindingGroup[];
  /** True when no contradiction and no inconsistency was found. */
  healthy: boolean;
  /** What "healthy" means for this signal, for the clean state to still say something. */
  healthyNote: string;
};

/** One category from signal 9. Its own shape, because it is a table. */
export type DriftCategoryRow = {
  category: string;
  features: number;
  shipped: number;
  flagged: number;
  unshipped: number;
  deprecated: number;
  featuresWithTests: number;
  featuresWithPathway: number;
  featuresWithLab: number;
  /** Contradictions other signals found in this category's features. */
  contradictions: number;
  size: string;
  /** The scanner's advisory suggestion, or null. Never acted on here. */
  regroup: string | null;
};

export type DriftSummary = {
  /** Signals the scan ran. */
  signals: number;
  /** Signals with no contradiction and no inconsistency. */
  healthySignals: number;
  signalsWithContradictions: number;
  /** Findings in `contradiction` groups. These are why the scan fails. */
  contradictions: number;
  /** Findings in `inconsistency` groups. */
  inconsistencies: number;
  /** Findings in `gap` groups. */
  gaps: number;
};

export type DriftView = {
  /**
   * `DriftReport.ok`, passed through.
   *
   * The page states this and never recomputes it, which is what keeps the
   * browser and the CLI in agreement.
   */
  ok: boolean;
  /**
   * When the scan ran and how long it took, measured around the call.
   *
   * Not from the report: it deliberately carries no timestamp so two runs over
   * one tree are byte-identical. These are the page's own measurement of its
   * own render, and are labelled as such.
   */
  scannedAt: string;
  durationMs: number;
  signals: DriftSignalView[];
  summary: DriftSummary;
  /** Signal 9's table. Separate because nothing in it fails the scan. */
  categories: DriftCategoryRow[];
  categoryCounts: DriftCount[];
  /** Per-group render cap, so the page can say it applied one. */
  entryCap: number;
};
