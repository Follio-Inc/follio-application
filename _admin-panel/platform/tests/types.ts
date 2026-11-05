import type { FeatureCategory, FeatureStatus } from '../coverage-map';

/**
 * Test Console data shapes (PLATFORM_TODO item 11).
 *
 * Client-safe: types only, no Node APIs. The console's view component imports
 * from here with a type-only import, so nothing that reads the filesystem can
 * follow it into a browser bundle.
 *
 * Everything here is *inventory*. There is no field for a result, a duration,
 * a last run or a pass rate, and that is deliberate — item 11 is the read-only
 * list, and a field with nothing to put in it is an invitation to fake one.
 * Running a category is item 12.
 */

/** One test file, and which features claim it. */
export type TestFileEntry = {
  /** Repo-relative path, e.g. `__tests__/visibility.test.ts`. */
  path: string;
  /** Feature ids whose `unitTests` list it, sorted. */
  listedBy: string[];
  /**
   * True when more than one feature lists it.
   *
   * Shared ownership is real and intentional — `agents/follio-voice.test.ts`
   * covers both the resume-parse agent and the Follio-voice rewrite step — so
   * the file appears under every feature that claims it rather than being
   * assigned to a winner.
   */
  shared: boolean;
};

/** One Live QA pathway, as the catalog defines it. Never a result. */
export type PathwayEntry = {
  id: string;
  title: string;
  area: string;
  stability: string;
  requiresAuth: boolean;
  /** Feature ids whose `pathways` list it, sorted. */
  claimedBy: string[];
};

/** One feature's test inventory. */
export type FeatureTests = {
  id: string;
  name: string;
  status: FeatureStatus;
  /** Env flag gating the whole feature, when the map records one. */
  flag?: string;
  /** Files the map lists for this feature, sorted by path. */
  unitTests: TestFileEntry[];
  /** Pathways the map claims for this feature, sorted by id. */
  pathways: PathwayEntry[];
};

/** One category and the features in it. */
export type CategoryTests = {
  category: FeatureCategory;
  /** Features in coverage-map order. Empty when no feature uses the category. */
  features: FeatureTests[];
  /** Distinct test files across this category's features. */
  uniqueTestFiles: number;
  /** Distinct pathways across this category's features. */
  uniquePathways: number;
  /** Features here that list no unit test at all. */
  featuresWithoutUnitTests: number;
};

/**
 * Why a test file sits under no feature.
 *
 * Both reasons come from the coverage map, not from a judgement made here:
 * `covers-unreachable-code` is a file named in a `REACHABILITY` record's
 * `tests.files`, and `no-feature-listed` is everything else on disk that no
 * feature's `unitTests` mentions.
 */
export type UnattributedReason = 'covers-unreachable-code' | 'no-feature-listed';

export type UnattributedTest = {
  path: string;
  reason: UnattributedReason;
  /** For `covers-unreachable-code`, the module the map records as unreachable. */
  recordedAgainst?: string;
};

export type TestInventorySummary = {
  /** Categories the map declares. */
  categories: number;
  features: number;
  /** Test files found on disk. */
  testFiles: number;
  /** Of those, listed by at least one feature. */
  attributedTestFiles: number;
  unattributedTestFiles: number;
  /**
   * Sum of every feature's `unitTests` length.
   *
   * Larger than `attributedTestFiles` exactly when a file is shared, which is
   * why both numbers are reported instead of one that quietly double-counts.
   */
  featureAssignments: number;
  sharedTestFiles: number;
  /** Pathways the Live QA catalog defines. */
  pathways: number;
  claimedPathways: number;
  featuresWithoutUnitTests: number;
};

/** The whole read-only inventory, ready to render. */
export type TestInventory = {
  summary: TestInventorySummary;
  /** Every declared category, in the map's own order. */
  categories: CategoryTests[];
  /** Test files on disk that no feature lists, sorted by reason then path. */
  unattributed: UnattributedTest[];
  /** Catalog pathways no feature claims, sorted by id. */
  unclaimedPathways: PathwayEntry[];
  /**
   * Files a feature lists that are not on disk, sorted by path.
   *
   * A contradiction rather than a gap, and the drift scan already fails on it.
   * Surfaced here so the console cannot show a feature as covered by a test
   * that does not exist.
   */
  missingTestFiles: TestFileEntry[];
};
