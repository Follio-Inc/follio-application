/**
 * Review-only proposals for drift findings (PLATFORM_TODO item 18).
 *
 * Client-safe: types only. Nothing here can write anything — these describe a
 * change a **person** might make, in enough detail to go and make it.
 *
 * Item 18's words are "propose map entries and draft tests (drafts for review,
 * never auto-merged)", so every proposal is text to read and nothing else:
 * there is no apply, no save, no merge, and no field that could be executed.
 * The coverage map is edited by hand, by whoever can answer the question the
 * proposal asks.
 *
 * A proposal that cannot name its target says so (`unresolved`) or names the
 * candidates and refuses to choose (`ambiguous`). Hiding that would be the one
 * genuinely harmful thing this feature could do: a confident wrong owner in
 * the coverage map is worse than an unmapped file, because every later signal
 * trusts the map.
 */

/** The map fields a proposal can be about. `EXCLUDED` is the exclusion list. */
export type MapField =
  | 'codeLocations'
  | 'unitTests'
  | 'pathways'
  | 'flag'
  | 'aiStages'
  | 'prismaModels'
  | 'EXCLUDED';

/**
 * What the proposed edit does to the map.
 *
 * - `add` — the repository has something the map does not account for.
 * - `move` — the map credits the wrong feature, and the evidence names another.
 * - `remove` — the map names something the repository cannot support.
 */
export type MapEntryAction = 'add' | 'move' | 'remove';

/**
 * How well the evidence supports the target.
 *
 * - `certain` — the scanner names exactly one owner, or the edit is a removal,
 *   which needs no owner.
 * - `ambiguous` — several owners fit, and the candidates are listed.
 * - `unresolved` — nothing in the report names an owner. The proposal gives the
 *   shape of the edit and leaves the choice to a person.
 */
export type ProposalCertainty = 'certain' | 'ambiguous' | 'unresolved';

/** One possible target, with the evidence for it. */
export type ProposalCandidate = {
  /** A feature id, or `EXCLUDED`. */
  target: string;
  /** Why this one is plausible, from the report and the map. */
  evidence: string[];
};

export type MapEntryProposal = {
  kind: 'map-entry';
  /** `<signal>.<group>:<reference>`. Derived on the server, stable per run. */
  id: string;
  /** The signal that found the drift. */
  signal: string;
  /** The report list it came from. */
  group: string;
  action: MapEntryAction;
  field: MapField;
  /** The path, id, flag, stage or model the entry is about. */
  reference: string;
  /** Feature the entry is proposed for. Null for a removal or when unresolved. */
  featureId: string | null;
  /** The feature that holds it now, for a move or a removal. */
  fromFeatureId: string | null;
  certainty: ProposalCertainty;
  /** Why this proposal exists and why that target, in plain lines. */
  evidence: string[];
  /** Alternatives, when more than one target fits. Empty when certain. */
  candidates: ProposalCandidate[];
  /** The file a person would edit. Always the coverage map. */
  editFile: string;
  /** The smallest edit, as lines to read. Not applied, and not executable. */
  preview: string[];
  /** What a person still has to decide. Null when nothing is left open. */
  needsDecision: string | null;
};

export type TestDraftProposal = {
  kind: 'test-draft';
  id: string;
  featureId: string;
  featureName: string;
  category: string;
  /**
   * Where the draft would go, if a person chose to write it.
   *
   * A suggestion. Nothing writes to it — item 18 generates drafts and does not
   * create files.
   */
  suggestedPath: string;
  /** The draft file, as text. */
  draft: string;
  evidence: string[];
  /** What the draft deliberately leaves for a person to fill in. */
  placeholders: string[];
};

export type DriftProposal = MapEntryProposal | TestDraftProposal;

export type ProposalSummary = {
  total: number;
  mapEntries: number;
  testDrafts: number;
  certain: number;
  ambiguous: number;
  unresolved: number;
  /** Proposals that still need a person to choose a target. */
  needingDecision: number;
};
