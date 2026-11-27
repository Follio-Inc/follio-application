import { COVERAGE_MAP, FEATURE_CATEGORIES } from '../coverage-map';
import type { FeatureCategory, PlatformFeature } from '../coverage-map';
import { IMPLEMENTED_LABS, LABS_ROOT, findLabImplementation } from './registry';
import type {
  LabCategory,
  LabFeature,
  LabImplementation,
  LabProblem,
  LabStatus,
  LabsSummary,
  LabsView,
} from './types';

/**
 * Building the Labs home from the coverage map (PLATFORM_TODO item 20).
 *
 * Every feature, its category, its status and its description come from the
 * map — there is no second catalogue here, and nothing in this file knows a
 * feature's name. The registry contributes one fact per lab: whether it exists
 * and where. Those two inputs decide the status, and the status decides whether
 * there is a link.
 *
 * Pure, and client-safe in practice: no `node:` import, no filesystem, no
 * scanner. Item 20 is an index, so the page can be a server component that
 * renders this and nothing else.
 *
 * What it will not do: claim a lab exists because the map names one, invent an
 * owner for an implementation no feature declares, or link a route that is not
 * registered. Each of those is reported instead — the same rule the drift page
 * follows for an unmapped surface.
 */

/** The status of one feature's lab, from its declaration and the registry. */
export function labStatusFor(
  feature: Pick<PlatformFeature, 'lab'>,
  labs: LabImplementation[] = IMPLEMENTED_LABS
): LabStatus {
  if (feature.lab === undefined || feature.lab === '') return 'none';

  return findLabImplementation(feature.lab, labs) === null ? 'planned' : 'available';
}

function toLabFeature(feature: PlatformFeature, labs: LabImplementation[]): LabFeature {
  const status = labStatusFor(feature, labs);
  const implementation =
    feature.lab === undefined ? null : findLabImplementation(feature.lab, labs);

  return {
    id: feature.id,
    name: feature.name,
    category: feature.category,
    featureStatus: feature.status,
    userDescription: feature.userDescription,
    labId: feature.lab ?? null,
    status,
    // Only an available lab has anywhere to go. A planned one is null by
    // construction, so the view cannot render a link to an unrouted page.
    route: status === 'available' ? (implementation?.route ?? null) : null,
  };
}

/** Everything that does not add up between the map and the registry. */
function problemsIn(features: PlatformFeature[], labs: LabImplementation[]): LabProblem[] {
  const problems: LabProblem[] = [];

  const declaredBy = new Map<string, string[]>();
  for (const feature of features) {
    if (feature.lab === undefined || feature.lab === '') continue;
    declaredBy.set(feature.lab, [...(declaredBy.get(feature.lab) ?? []), feature.id]);
  }

  for (const [labId, owners] of [...declaredBy.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (owners.length > 1) {
      problems.push({
        kind: 'duplicate-lab-id',
        detail: `'${labId}' is declared by ${owners.length} features: ${owners.join(', ')}. A lab belongs to one feature.`,
      });
    }
  }

  const seenRoutes = new Set<string>();
  for (const lab of [...labs].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!declaredBy.has(lab.id)) {
      problems.push({
        kind: 'unknown-lab-id',
        detail: `An implementation is registered for '${lab.id}' and no feature's \`lab\` names it, so nothing says what it is for.`,
      });
    }
    if (seenRoutes.has(lab.route)) {
      problems.push({
        kind: 'duplicate-route',
        detail: `More than one lab is registered at ${lab.route}.`,
      });
    }
    seenRoutes.add(lab.route);

    if (lab.route !== LABS_ROOT && !lab.route.startsWith(`${LABS_ROOT}/`)) {
      problems.push({
        kind: 'route-outside-labs',
        detail: `'${lab.id}' points at ${lab.route}, which is outside ${LABS_ROOT}.`,
      });
    }
  }

  return problems;
}

function summarize(features: LabFeature[]): LabsSummary {
  const count = (status: LabStatus) => features.filter((entry) => entry.status === status).length;

  return {
    features: features.length,
    withLab: features.filter((entry) => entry.labId !== null).length,
    available: count('available'),
    planned: count('planned'),
    none: count('none'),
  };
}

export type LabsViewOptions = {
  /** Defaults to the real coverage map. */
  features?: PlatformFeature[];
  /** Defaults to the real registry. */
  labs?: LabImplementation[];
  /** Defaults to the map's closed category union, which fixes the order. */
  categories?: readonly FeatureCategory[];
};

/** The Labs home, derived from the map and the registry. */
export function buildLabsView(options: LabsViewOptions = {}): LabsView {
  const features = options.features ?? COVERAGE_MAP;
  const labs = options.labs ?? IMPLEMENTED_LABS;
  const categories = options.categories ?? FEATURE_CATEGORIES;

  const entries = features.map((feature) => toLabFeature(feature, labs));

  // Category order comes from the map's union, not from the data, so the page
  // reads the same way every time and a category nobody uses still appears.
  const grouped: LabCategory[] = categories.map((category) => ({
    category,
    features: entries
      .filter((entry) => entry.category === category)
      .sort((a, b) => a.id.localeCompare(b.id)),
  }));

  // A feature whose category is outside the union would otherwise vanish.
  const placed = new Set(grouped.flatMap((group) => group.features.map((entry) => entry.id)));
  const unplaced = entries.filter((entry) => !placed.has(entry.id));
  if (unplaced.length > 0) {
    grouped.push({ category: 'Uncategorised', features: unplaced });
  }

  return {
    summary: summarize(entries),
    categories: grouped,
    implemented: [...labs].sort((a, b) => a.id.localeCompare(b.id)),
    problems: problemsIn(features, labs),
    labsRoot: LABS_ROOT,
  };
}
