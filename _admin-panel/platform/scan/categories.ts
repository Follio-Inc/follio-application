import { COVERAGE_MAP, FEATURE_CATEGORIES } from '../coverage-map';
import type { FeatureCategory, PlatformFeature } from '../coverage-map';
import type {
  CategoryHealthFinding,
  CategoryHealthReport,
  CategoryHealthSummary,
  CategorySize,
  FeatureContradiction,
} from './types';

/**
 * Signal 9 of the drift scan: category health (PLATFORM_TODO item 8).
 *
 * Item 8 asks for "categories that are too large or too thin with a suggested
 * regroup". Both verdicts need a threshold, and a threshold picked by hand is a
 * hardcoded outcome, so both are derived from the distribution the map
 * actually has and printed in the summary. A reader can check the arithmetic:
 *
 * - `largeThreshold` = `ceil(2 × features / categories)`, at least 2
 * - `thinThreshold` = `floor(features / categories)`
 *
 * At 21 features over 13 categories that makes the large threshold 4 and the
 * thin threshold 1, so a category holding a single feature is `balanced` —
 * which is right, because eight of them do and the map is not sick.
 *
 * **Nothing here fails the scan.** A category with no Live QA pathway and no
 * lab is a product gap, and most areas genuinely have neither; converting that
 * into a failure would push whoever runs this towards writing a pathway to
 * quiet a number rather than to test something. Contradictions are counted per
 * category, but they are counted where they are found — in signals 2 to 8 —
 * and only there do they affect `ok`.
 *
 * Client-safe: reads the map, touches no filesystem.
 */

/** The code root a feature mostly lives in: its commonest first path segment. */
function dominantRoot(feature: PlatformFeature): string {
  const counts = new Map<string, number>();
  for (const location of feature.codeLocations) {
    const root = location.split('/')[0];
    counts.set(root, (counts.get(root) ?? 0) + 1);
  }

  return (
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([root]) => root)[0] ?? ''
  );
}

/**
 * A regroup suggestion, or null when the category is fine as it is.
 *
 * For a category that is too large the suggestion is a split by code root,
 * because that is the only grouping the repository itself offers: features
 * that implement in the same tree are the ones a reader would expect to find
 * together. For an empty one it is a question about the category list, since an
 * unused member of a closed union is either a plan or a leftover.
 */
function regroupFor(
  category: FeatureCategory,
  size: CategorySize,
  features: PlatformFeature[],
  largeThreshold: number
): string | null {
  if (size === 'empty') {
    return `No feature uses ${category}: give it one, or drop it from FEATURE_CATEGORIES.`;
  }

  if (size === 'large') {
    const groups = new Map<string, string[]>();
    for (const feature of features) {
      const root = dominantRoot(feature);
      groups.set(root, [...(groups.get(root) ?? []), feature.id].sort());
    }

    const byRoot = [...groups.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([root, ids]) => `${root}: ${ids.join(', ')}`)
      .join(' · ');

    return `${features.length} features at or above the large threshold of ${largeThreshold}; candidate split by code root — ${byRoot}.`;
  }

  if (size === 'thin') {
    return `Below the thin threshold: fold ${category} into a neighbouring category, or grow it.`;
  }

  return null;
}

export type CategoryHealthOptions = {
  features?: PlatformFeature[];
  /** Categories to report. Defaults to the closed union the map declares. */
  categories?: readonly FeatureCategory[];
  /**
   * Contradictions other signals found, attributed to a feature.
   *
   * Supplied by `runDriftScan` so a category's health reflects the rest of the
   * report. Defaults to none, which keeps this signal callable on its own.
   */
  contradictions?: FeatureContradiction[];
};

function summarize(
  findings: CategoryHealthFinding[],
  features: PlatformFeature[],
  largeThreshold: number,
  thinThreshold: number
): CategoryHealthSummary {
  const count = (size: CategorySize) => findings.filter((finding) => finding.size === size).length;

  return {
    categories: findings.length,
    features: features.length,
    empty: count('empty'),
    thin: count('thin'),
    balanced: count('balanced'),
    large: count('large'),
    largeThreshold,
    thinThreshold,
    categoriesWithoutPathway: findings.filter((finding) => finding.featuresWithPathway === 0)
      .length,
    categoriesWithoutLab: findings.filter((finding) => finding.featuresWithLab === 0).length,
  };
}

/** Builds the per-category health view from the map and the other signals. */
export function scanCategoryHealth(options: CategoryHealthOptions = {}): CategoryHealthReport {
  const features = options.features ?? COVERAGE_MAP;
  const categories = options.categories ?? FEATURE_CATEGORIES;
  const contradictions = options.contradictions ?? [];

  // Thresholds from the distribution, not from an opinion. Integer arithmetic
  // throughout, so two runs over one map agree to the character.
  const largeThreshold =
    categories.length === 0 ? 2 : Math.max(2, Math.ceil((2 * features.length) / categories.length));
  const thinThreshold =
    categories.length === 0 ? 0 : Math.floor(features.length / categories.length);

  const findings: CategoryHealthFinding[] = [...categories]
    .sort((a, b) => a.localeCompare(b))
    .map((category) => {
      const members = features.filter((feature) => feature.category === category);
      const count = (status: PlatformFeature['status']) =>
        members.filter((feature) => feature.status === status).length;

      const size: CategorySize =
        members.length === 0
          ? 'empty'
          : members.length >= largeThreshold
            ? 'large'
            : members.length < thinThreshold
              ? 'thin'
              : 'balanced';

      const memberIds = new Set(members.map((feature) => feature.id));

      return {
        category,
        features: members.map((feature) => feature.id).sort(),
        shipped: count('shipped'),
        flagged: count('flagged'),
        unshipped: count('unshipped'),
        deprecated: count('deprecated'),
        featuresWithTests: members.filter((feature) => feature.unitTests.length > 0).length,
        featuresWithPathway: members.filter((feature) => feature.pathways.length > 0).length,
        featuresWithLab: members.filter((feature) => Boolean(feature.lab)).length,
        contradictions: contradictions.filter((entry) => memberIds.has(entry.featureId)).length,
        size,
        regroup: regroupFor(category, size, members, largeThreshold),
      };
    });

  const pick = (size: CategorySize) => findings.filter((finding) => finding.size === size);

  return {
    signal: 'category-health',
    summary: summarize(findings, features, largeThreshold, thinThreshold),
    categories: findings,
    empty: pick('empty'),
    thin: pick('thin'),
    large: pick('large'),
    // Gaps, never failures. Most areas have no browser coverage and no lab yet,
    // and a category is not sick for saying so.
    withoutPathway: findings
      .filter((finding) => finding.featuresWithPathway === 0)
      .map((finding) => finding.category)
      .sort(),
    withoutLab: findings
      .filter((finding) => finding.featuresWithLab === 0)
      .map((finding) => finding.category)
      .sort(),
    withoutTests: findings
      .filter((finding) => finding.featuresWithTests === 0)
      .map((finding) => finding.category)
      .sort(),
  };
}
