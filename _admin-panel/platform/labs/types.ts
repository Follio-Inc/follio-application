/**
 * Labs home: what the map declares against what exists (PLATFORM_TODO item 20).
 *
 * Client-safe: types only. Nothing here reads a file — a lab's status is the
 * answer to two questions the repository can already answer, and neither needs
 * the filesystem: does the feature declare a `lab`, and is there an
 * implementation registered for that id.
 *
 * The one invariant this page exists to hold: **a declared lab is not a lab.**
 * `PlatformFeature.lab` names an *intended* lab, and the coverage map has
 * carried one since item 2 while no lab module existed. Showing that as
 * available — or worse, linking to a route that is not routed — would make the
 * page the first thing in the platform to claim something it cannot show.
 */

/**
 * Whether a feature has a lab, and whether it is real yet.
 *
 * - `available` — the feature declares a `lab` and an implementation is
 *   registered for that id, so there is somewhere to go.
 * - `planned` — the feature declares a `lab` and nothing implements it. The
 *   state every declared lab is in until the item that builds it lands.
 * - `none` — the feature declares no lab. Not a gap to close: most features
 *   have nothing a workbench would usefully show.
 */
export type LabStatus = 'available' | 'planned' | 'none';

/**
 * One implemented lab.
 *
 * Implementation availability **only**. The name, the category, the status and
 * the description of the feature it belongs to live in the coverage map and are
 * read from there — duplicating them here would create a second catalogue that
 * could disagree with the first.
 */
export type LabImplementation = {
  /** The id a feature's `lab` field names. */
  id: string;
  /** Absolute route. Must sit under the labs section. */
  route: string;
};

/** One feature, as the Labs home lists it. */
export type LabFeature = {
  /** Feature id from the map. */
  id: string;
  name: string;
  category: string;
  /** The feature's own status: `shipped`, `flagged`, … Not the lab's. */
  featureStatus: string;
  userDescription: string;
  /** The `lab` id the map declares, or null. */
  labId: string | null;
  status: LabStatus;
  /** Where to go. Non-null only for `available`, so a plan cannot be linked. */
  route: string | null;
};

export type LabCategory = {
  category: string;
  features: LabFeature[];
};

/**
 * Something that does not add up between the map and the registry.
 *
 * - `duplicate-lab-id` — two features declare the same lab.
 * - `duplicate-route` — two implementations claim one route.
 * - `unknown-lab-id` — an implementation exists for an id no feature declares,
 *   so nothing in the map says what it is for.
 * - `route-outside-labs` — an implementation points somewhere other than the
 *   labs section.
 *
 * Reported, never resolved: inventing an owner for an unclaimed lab is the same
 * mistake the drift page refuses to make for an unmapped surface.
 */
export type LabProblemKind =
  | 'duplicate-lab-id'
  | 'duplicate-route'
  | 'unknown-lab-id'
  | 'route-outside-labs';

export type LabProblem = {
  kind: LabProblemKind;
  detail: string;
};

export type LabsSummary = {
  features: number;
  /** Features whose map entry names a lab. */
  withLab: number;
  available: number;
  planned: number;
  none: number;
};

export type LabsView = {
  summary: LabsSummary;
  /** Every category the map declares, in its order. */
  categories: LabCategory[];
  /** Implemented labs, so "what exists" is answerable in one line. */
  implemented: LabImplementation[];
  problems: LabProblem[];
  /** Where a lab route lives, for the operator reading the page. */
  labsRoot: string;
};
