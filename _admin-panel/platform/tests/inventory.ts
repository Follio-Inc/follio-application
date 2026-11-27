import { LIVE_QA_PATHWAYS } from '../../modules/developer/live-qa/catalog';
import type { LiveQaPathway } from '../../modules/developer/live-qa/types';
import { COVERAGE_MAP, FEATURE_CATEGORIES, REACHABILITY } from '../coverage-map';
import type { FeatureCategory, PlatformFeature, ReachabilityRecord } from '../coverage-map';
import { discoverTestFiles } from '../scan/test-files';
import type {
  CategoryTests,
  FeatureTests,
  PathwayEntry,
  TestFileEntry,
  TestInventory,
  TestInventorySummary,
  UnattributedTest,
} from './types';

/**
 * The Test Console's inventory (PLATFORM_TODO item 11).
 *
 * Server-only: it walks `__tests__` to find out what is actually on disk. The
 * view takes the result as a plain prop, so nothing here reaches a browser.
 *
 * **One source of truth.** Categories come from `FEATURE_CATEGORIES`, the
 * feature → test link comes from each feature's `unitTests`, pathways come from
 * `LIVE_QA_PATHWAYS`, and the dead-parser cluster comes from the `REACHABILITY`
 * records' own `tests.files`. There is no list of test files in this file and
 * no second registry anywhere — item 11 is explicit that categories come from
 * the map and never from a hand-kept glob list.
 *
 * Discovery reuses the drift scan's `discoverTestFiles`, which is the same walk
 * signal 2 uses. A second walker here would eventually disagree with it, and
 * then the console and the scan would give different answers about the same
 * repository. It is imported from `scan/test-files` rather than `scan/tests`
 * so rendering this page does not load the TypeScript compiler that signal 2
 * needs for the import graph.
 *
 * What this deliberately does **not** do is run anything. There is no result,
 * no duration and no last-run field in the output; item 12 adds execution.
 */

export type TestInventoryOptions = {
  features?: PlatformFeature[];
  /** Categories to report, in display order. Defaults to the map's own order. */
  categories?: readonly FeatureCategory[];
  reachability?: ReachabilityRecord[];
  pathways?: LiveQaPathway[];
  /** Test files on disk. Defaults to walking `__tests__`. */
  testFiles?: string[];
  repoRoot?: string;
};

/** Feature ids whose `unitTests` list this file, sorted. */
function featuresListing(testPath: string, features: PlatformFeature[]): string[] {
  return features
    .filter((feature) => feature.unitTests.includes(testPath))
    .map((feature) => feature.id)
    .sort();
}

/** Feature ids whose `pathways` list this id, sorted. */
function featuresClaiming(pathwayId: string, features: PlatformFeature[]): string[] {
  return features
    .filter((feature) => feature.pathways.includes(pathwayId))
    .map((feature) => feature.id)
    .sort();
}

function toPathwayEntry(pathway: LiveQaPathway, features: PlatformFeature[]): PathwayEntry {
  return {
    id: pathway.id,
    title: pathway.title,
    area: pathway.area,
    stability: pathway.stability,
    requiresAuth: pathway.requiresAuth,
    claimedBy: featuresClaiming(pathway.id, features),
  };
}

function toFeatureTests(
  feature: PlatformFeature,
  features: PlatformFeature[],
  catalog: Map<string, LiveQaPathway>
): FeatureTests {
  const unitTests: TestFileEntry[] = [...feature.unitTests]
    .sort((a, b) => a.localeCompare(b))
    .map((testPath) => {
      const listedBy = featuresListing(testPath, features);
      return { path: testPath, listedBy, shared: listedBy.length > 1 };
    });

  const pathways: PathwayEntry[] = [...feature.pathways]
    .sort((a, b) => a.localeCompare(b))
    .map((pathwayId) => catalog.get(pathwayId))
    // A `pathways` entry the catalog does not define is drift, and signal 3
    // already fails the scan for it. The console shows what exists rather than
    // inventing a row for a pathway nobody can run.
    .filter((pathway): pathway is LiveQaPathway => pathway !== undefined)
    .map((pathway) => toPathwayEntry(pathway, features));

  return {
    id: feature.id,
    name: feature.name,
    status: feature.status,
    ...(feature.flag ? { flag: feature.flag } : {}),
    unitTests,
    pathways,
  };
}

function summarize(
  categories: CategoryTests[],
  features: PlatformFeature[],
  declaredCategories: readonly FeatureCategory[],
  testFiles: string[],
  attributed: Set<string>,
  unattributed: UnattributedTest[],
  catalog: LiveQaPathway[]
): TestInventorySummary {
  const assignments = features.flatMap((feature) => feature.unitTests);
  const shared = [...attributed].filter(
    (testPath) => assignments.filter((entry) => entry === testPath).length > 1
  );

  return {
    categories: declaredCategories.length,
    features: features.length,
    testFiles: testFiles.length,
    attributedTestFiles: attributed.size,
    unattributedTestFiles: unattributed.length,
    featureAssignments: assignments.length,
    sharedTestFiles: shared.length,
    pathways: catalog.length,
    claimedPathways: catalog.filter((pathway) => featuresClaiming(pathway.id, features).length > 0)
      .length,
    featuresWithoutUnitTests: categories.reduce(
      (total, entry) => total + entry.featuresWithoutUnitTests,
      0
    ),
  };
}

/**
 * Builds the read-only inventory.
 *
 * Ordering is the map's: categories in `FEATURE_CATEGORIES` order, which the
 * map documents as "the order a user meets them", and features in
 * `COVERAGE_MAP` order within a category. Test files and pathways are sorted by
 * path and id, so two renders of one tree agree.
 */
export function buildTestInventory(options: TestInventoryOptions = {}): TestInventory {
  const features = options.features ?? COVERAGE_MAP;
  const declaredCategories = options.categories ?? FEATURE_CATEGORIES;
  const reachability = options.reachability ?? REACHABILITY;
  const catalog = options.pathways ?? LIVE_QA_PATHWAYS;
  const testFiles = [...(options.testFiles ?? discoverTestFiles(options.repoRoot))].sort();

  const catalogById = new Map(catalog.map((pathway) => [pathway.id, pathway]));

  const categories: CategoryTests[] = declaredCategories.map((category) => {
    const members = features.filter((feature) => feature.category === category);
    const entries = members.map((feature) => toFeatureTests(feature, features, catalogById));

    return {
      category,
      features: entries,
      uniqueTestFiles: new Set(entries.flatMap((entry) => entry.unitTests.map((test) => test.path)))
        .size,
      uniquePathways: new Set(
        entries.flatMap((entry) => entry.pathways.map((pathway) => pathway.id))
      ).size,
      featuresWithoutUnitTests: entries.filter((entry) => entry.unitTests.length === 0).length,
    };
  });

  const attributed = new Set(features.flatMap((feature) => feature.unitTests));

  // The map already records which tests cover code no shipped entry point
  // reaches, so the console can say why those files have no feature instead of
  // lumping them in with the shared-infrastructure ones.
  const unreachableTests = new Map<string, string>();
  for (const record of reachability) {
    for (const testPath of record.tests?.files ?? []) {
      if (!unreachableTests.has(testPath)) unreachableTests.set(testPath, record.path);
    }
  }

  const unattributed: UnattributedTest[] = testFiles
    .filter((testPath) => !attributed.has(testPath))
    .map((testPath) => {
      const recordedAgainst = unreachableTests.get(testPath);
      return recordedAgainst
        ? { path: testPath, reason: 'covers-unreachable-code' as const, recordedAgainst }
        : { path: testPath, reason: 'no-feature-listed' as const };
    })
    .sort((a, b) => a.reason.localeCompare(b.reason) || a.path.localeCompare(b.path));

  const onDisk = new Set(testFiles);

  return {
    summary: summarize(
      categories,
      features,
      declaredCategories,
      testFiles,
      attributed,
      unattributed,
      catalog
    ),
    categories,
    unattributed,
    unclaimedPathways: catalog
      .filter((pathway) => featuresClaiming(pathway.id, features).length === 0)
      .map((pathway) => toPathwayEntry(pathway, features))
      .sort((a, b) => a.id.localeCompare(b.id)),
    missingTestFiles: [...attributed]
      .filter((testPath) => !onDisk.has(testPath))
      .sort((a, b) => a.localeCompare(b))
      .map((testPath) => {
        const listedBy = featuresListing(testPath, features);
        return { path: testPath, listedBy, shared: listedBy.length > 1 };
      }),
  };
}
