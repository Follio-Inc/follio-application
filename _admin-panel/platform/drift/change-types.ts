/**
 * Recent change analysis — types (PLATFORM_TODO: Drift intelligence, step 1).
 *
 * Client-safe: types only, no `node:` and no scanner. `platform/ui` imports
 * this and never `change-analysis.ts`, which spawns git.
 *
 * ## What this step is, and is not
 *
 * It answers one question deterministically: *the latest commit touched these
 * files — which mapped features own them, and what does the Platform already
 * know covers those features?*
 *
 * It **recommends nothing**. No suggested tests, no scores, no AI, no
 * filename heuristics. Every association comes from the existing coverage map;
 * a file the map does not claim is reported as unmapped rather than guessed at.
 * The sponsor's wider test-intelligence direction builds on this, but none of
 * it is here.
 */

/**
 * What the commit did to a path, as git reported it.
 *
 * Mirrors `git show --name-status` codes rather than inventing a vocabulary:
 * `A`, `M`, `D`, `R<score>`, `C<score>`, `T`. Anything else arrives as
 * `other` with the raw code kept in `code`, so an unexpected status is visible
 * instead of silently becoming "modified".
 */
export type ChangeStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'type-changed'
  | 'other';

/** One path the commit touched. */
export type ChangedFile = {
  /** Repo-relative path after the change. For a delete, the path removed. */
  path: string;
  status: ChangeStatus;
  /** Git's raw status code, e.g. `M` or `R100`. Kept for an unexpected code. */
  code: string;
  /** The path before a rename or copy. Null otherwise. */
  previousPath: string | null;
};

/** A Live QA pathway a feature declares, resolved against the catalog. */
export type AffectedPathway = {
  id: string;
  /** Catalog title, or null when the catalog does not define this id. */
  title: string | null;
  /** Spec path relative to the Live QA root, or null when unknown. */
  spec: string | null;
};

/**
 * A coverage-map feature the commit touched, with coverage the Platform
 * already records for it.
 *
 * `unitTests` and `pathways` are the feature's own declarations, passed
 * through. Nothing here searches the repository for "related" tests.
 */
export type AffectedFeature = {
  id: string;
  name: string;
  category: string;
  /** The feature's `status` from the map, e.g. `shipped`. */
  featureStatus: string;
  /** Which of this commit's paths matched this feature, sorted. */
  matchedPaths: string[];
  /** The feature's declared `codeLocations` that did the matching, sorted. */
  matchedLocations: string[];
  /** `unitTests` from the map, unchanged. */
  unitTests: string[];
  /** `pathways` from the map, resolved against the Live QA catalog. */
  pathways: AffectedPathway[];
  /** The feature's `lab`, when it declares one. Secondary context only. */
  labId: string | null;
};

/** The commit that was analysed. */
export type AnalyzedCommit = {
  /** Full 40-character sha. */
  sha: string;
  /** Abbreviated sha, as git abbreviated it. */
  shortSha: string;
  /** Commit subject line. */
  subject: string;
  /** False when HEAD is the repository's first commit. */
  hasParent: boolean;
};

/** Counts for the panel's header. Every one is derived, never asserted. */
export type ChangeAnalysisSummary = {
  changedFiles: number;
  affectedFeatures: number;
  unmappedFiles: number;
  /** Affected features whose `unitTests` list is empty. */
  featuresWithoutTests: number;
  /** Affected features whose `pathways` list is empty. */
  featuresWithoutPathways: number;
};

/** Why an analysis could not be produced. */
export type ChangeAnalysisError =
  | 'git-unavailable'
  | 'not-a-repository'
  | 'no-commits'
  | 'read-failed';

/** The whole result. `commit` is null exactly when `error` is set. */
export type ChangeAnalysis = {
  commit: AnalyzedCommit | null;
  files: ChangedFile[];
  features: AffectedFeature[];
  /** Changed paths no feature claims, sorted. Reported, never guessed at. */
  unmapped: string[];
  summary: ChangeAnalysisSummary;
  error: ChangeAnalysisError | null;
  /** One sentence an operator can act on. Always present. */
  detail: string;
};
