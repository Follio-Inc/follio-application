import type { PlatformFeature } from '../coverage-map';
import { covers } from '../scan';
import type { MapReferenceFinding, SurfaceFinding, TestFinding } from '../scan/types';
import type {
  MapEntryAction,
  MapEntryProposal,
  MapField,
  ProposalCandidate,
  ProposalCertainty,
  ProposalSummary,
  TestDraftProposal,
} from './proposal-types';

/**
 * Turning drift findings into review-only proposals (PLATFORM_TODO item 18).
 *
 * **Nothing in this file can change anything.** It imports no `node:` module
 * and calls nothing that writes: no file, no command, no git — tests assert both
 * for the whole drift module, because "never auto-merged" is only worth saying
 * if the code could not do it even by accident. The one thing it imports from
 * the scanner is `covers`, the ownership predicate every signal already uses.
 * Every proposal is text describing an edit a person makes by hand.
 *
 * Every proposal is derived from the typed `DriftReport` the scanner already
 * produced plus the coverage map itself. There is no second scanner here and no
 * new rule about ownership: "which feature owns this path" is answered by the
 * scanner's own `covers` / `featuresCovering`, so a proposal cannot disagree
 * with the signal that produced the finding.
 *
 * **Which findings get a proposal, and which deliberately do not.** The rule is
 * evidence, not ambition: propose only where the report names the target, or
 * where the edit is a removal, which needs no target.
 *
 * - The map names something the repository cannot support → propose removing
 *   it, or moving it to the owner the report does name. That covers the stale
 *   `unitTests`, `pathways`, `aiStages`, `flag` and `prismaModels` references
 *   and a `codeLocations` path that is not on disk.
 * - The repository has something the map does not account for, and the import
 *   graph names the owner → propose adding it. That is the `unlisted` test.
 * - An unmapped page or route handler → propose the *shape* of the entry and
 *   refuse to pick an owner, because nothing in the report names one.
 *
 * Deliberately **not** actionable, each for a reason the signals already give:
 * dead and orphaned code (proposing it as live ownership is exactly the wrong
 * move, and item 19 is where quarantine belongs), the shared Prisma tables the
 * map declines to declare on purpose, category-health distribution gaps, and
 * anything whose fix is a Playwright spec or product code rather than a map
 * entry or a unit test.
 */

/** The file every map-entry proposal would be applied to, by a person. */
export const MAP_FILE = '_admin-panel/platform/coverage-map/map.ts';

/** Where a draft test would go, if someone wrote it. */
const TEST_ROOT = '__tests__';

function proposalId(signal: string, group: string, reference: string): string {
  return `${signal}.${group}:${reference}`;
}

/** The lines a person would change, as text. Never executed. */
function previewFor(
  action: MapEntryAction,
  field: MapField,
  reference: string,
  featureId: string | null,
  fromFeatureId: string | null
): string[] {
  const quoted = `'${reference}'`;
  const target = featureId === null ? null : `feature '${featureId}'`;

  if (action === 'remove') {
    return [
      `${MAP_FILE} — ${fromFeatureId === null ? 'EXCLUDED' : `feature '${fromFeatureId}'`}`,
      `  ${field}: [`,
      `-   ${quoted},`,
      `  ]`,
    ];
  }

  if (action === 'move') {
    return [
      `${MAP_FILE} — feature '${fromFeatureId}'`,
      `  ${field}: [`,
      `-   ${quoted},`,
      `  ]`,
      '',
      `${MAP_FILE} — ${target}`,
      `  ${field}: [`,
      `+   ${quoted},`,
      `  ]`,
    ];
  }

  return [
    `${MAP_FILE} — ${target ?? 'the feature a person picks, or the EXCLUDED list'}`,
    `  ${field}: [`,
    `+   ${quoted},`,
    `  ]`,
  ];
}

type MapEntryInput = {
  signal: string;
  group: string;
  action: MapEntryAction;
  field: MapField;
  reference: string;
  featureId?: string | null;
  fromFeatureId?: string | null;
  certainty: ProposalCertainty;
  evidence: string[];
  candidates?: ProposalCandidate[];
  needsDecision?: string | null;
};

function mapEntry(input: MapEntryInput): MapEntryProposal {
  const featureId = input.featureId ?? null;
  const fromFeatureId = input.fromFeatureId ?? null;

  return {
    kind: 'map-entry',
    id: proposalId(input.signal, input.group, input.reference),
    signal: input.signal,
    group: input.group,
    action: input.action,
    field: input.field,
    reference: input.reference,
    featureId,
    fromFeatureId,
    certainty: input.certainty,
    evidence: input.evidence,
    candidates: input.candidates ?? [],
    editFile: MAP_FILE,
    preview: previewFor(input.action, input.field, input.reference, featureId, fromFeatureId),
    needsDecision: input.needsDecision ?? null,
  };
}

/** Which of a test's targets a feature's `codeLocations` actually cover. */
function coveredTargets(
  featureId: string,
  targets: string[],
  features: PlatformFeature[]
): string[] {
  const feature = features.find((entry) => entry.id === featureId);
  if (feature === undefined) return [];

  return targets.filter((target) =>
    feature.codeLocations.some((location) => covers(location, target))
  );
}

function candidatesFor(
  featureIds: string[],
  targets: string[],
  features: PlatformFeature[],
  describe: (covered: string[]) => string
): ProposalCandidate[] {
  return featureIds.map((featureId) => ({
    target: featureId,
    evidence: [describe(coveredTargets(featureId, targets, features))],
  }));
}

/**
 * A test the graph attributes to a feature whose `unitTests` does not list it.
 *
 * The strongest evidence in the report: the import graph resolved the test's
 * imports to files that feature's `codeLocations` cover. One inferred feature
 * is certain; several means a person picks, and each candidate shows which of
 * the test's targets it claims.
 */
export function proposeForUnlistedTest(
  finding: TestFinding,
  features: PlatformFeature[]
): MapEntryProposal[] {
  if (finding.inferredFeatures.length === 0) return [];

  const targets = [...finding.directTargets, ...finding.barrelTargets];
  const certain = finding.inferredFeatures.length === 1;

  return [
    mapEntry({
      signal: 'test-attribution',
      group: 'unlisted',
      action: 'add',
      field: 'unitTests',
      reference: finding.path,
      featureId: certain ? finding.inferredFeatures[0] : null,
      certainty: certain ? 'certain' : 'ambiguous',
      evidence: [
        `The import graph resolves this test to ${targets.length} repo ${targets.length === 1 ? 'path' : 'paths'}.`,
        ...(certain
          ? [
              `Of those, '${finding.inferredFeatures[0]}' claims ${coveredTargets(
                finding.inferredFeatures[0],
                targets,
                features
              ).join(', ')} — and no other feature claims any.`,
            ]
          : [`${finding.inferredFeatures.length} features claim some of them.`]),
        `No feature's \`unitTests\` names it.`,
        // The blind spot, said out loud. The graph sees that a test reaches a
        // feature's code; it cannot see whether the test is *about* that
        // feature. A test that touches it only through a fixture is reached
        // the same way as one that covers it, and the coverage map records
        // such omissions deliberately, in prose, at the top of `map.ts`.
        'The graph cannot tell coverage from contact: a test that reaches this code only as a fixture looks the same to it. Check the map’s own notes before adding the entry — some omissions there are deliberate.',
      ],
      candidates: certain
        ? []
        : candidatesFor(
            finding.inferredFeatures,
            targets,
            features,
            (covered) => `claims ${covered.length > 0 ? covered.join(', ') : 'none of the targets'}`
          ),
      // Always open, even when the target is certain: which feature the graph
      // reaches is a fact, and whether the test covers that feature is a
      // judgement only a person can make.
      needsDecision: certain
        ? `Confirm the test really covers '${finding.inferredFeatures[0]}' rather than merely importing it, then add the entry.`
        : 'Pick the feature this test is really about, or list it under more than one if both own part of it.',
    }),
  ];
}

/**
 * A test the map lists under features the graph does not support.
 *
 * Two edits at most: take it off the features that do not own it, and put it
 * where the graph says it belongs if the graph says anything at all.
 */
export function proposeForMisattributedTest(
  finding: TestFinding,
  features: PlatformFeature[]
): MapEntryProposal[] {
  const targets = [...finding.directTargets, ...finding.barrelTargets];
  const certain = finding.inferredFeatures.length === 1;

  if (certain) {
    return finding.declaredFeatures.map((declared) =>
      mapEntry({
        signal: 'test-attribution',
        group: 'misattributed',
        action: 'move',
        field: 'unitTests',
        reference: finding.path,
        featureId: finding.inferredFeatures[0],
        fromFeatureId: declared,
        certainty: 'certain',
        evidence: [
          `'${declared}' lists this test and the import graph reaches none of its code.`,
          `The graph reaches ${coveredTargets(finding.inferredFeatures[0], targets, features).join(', ')}, which '${finding.inferredFeatures[0]}' claims.`,
        ],
      })
    );
  }

  return finding.declaredFeatures.map((declared) =>
    mapEntry({
      signal: 'test-attribution',
      group: 'misattributed',
      action: 'remove',
      field: 'unitTests',
      reference: finding.path,
      fromFeatureId: declared,
      certainty: finding.inferredFeatures.length === 0 ? 'certain' : 'ambiguous',
      evidence: [
        `'${declared}' lists this test and the import graph reaches none of its code.`,
        finding.inferredFeatures.length === 0
          ? `The graph attributes it to no feature at all, so there is nowhere to move it to.`
          : `${finding.inferredFeatures.length} other features claim what it reaches.`,
      ],
      candidates:
        finding.inferredFeatures.length === 0
          ? []
          : candidatesFor(
              finding.inferredFeatures,
              targets,
              features,
              (covered) =>
                `claims ${covered.length > 0 ? covered.join(', ') : 'none of the targets'}`
            ),
      needsDecision:
        finding.inferredFeatures.length === 0
          ? null
          : 'Decide which of the candidates should list it instead, if any.',
    })
  );
}

type StaleInput = {
  signal: string;
  field: MapField;
  featureId: string;
  reference: string;
  reason: string;
  /** What the reason means, for someone reading only this line. */
  explain: string;
  /** Features the report says do own it, for a `no-usage-link` reason. */
  inferredFeatures?: string[];
};

/**
 * A map reference the repository cannot support.
 *
 * One shape for all five signals that can produce one. A reference to
 * something that does not exist can only be removed; one that exists but sits
 * in another feature's code can be moved there, and the report already names
 * where.
 */
export function proposeForStaleReference(input: StaleInput): MapEntryProposal[] {
  const inferred = (input.inferredFeatures ?? []).filter((id) => id !== input.featureId);
  const certain = inferred.length === 1;

  if (inferred.length > 0) {
    return [
      mapEntry({
        signal: input.signal,
        group: 'stale',
        action: certain ? 'move' : 'remove',
        field: input.field,
        reference: input.reference,
        featureId: certain ? inferred[0] : null,
        fromFeatureId: input.featureId,
        certainty: certain ? 'certain' : 'ambiguous',
        evidence: [
          `'${input.featureId}' declares it and ${input.explain}`,
          certain
            ? `The report attributes it to '${inferred[0]}' instead.`
            : `The report attributes it to ${inferred.length} other features.`,
        ],
        candidates: certain
          ? []
          : inferred.map((target) => ({
              target,
              evidence: [`the report attributes the usage site to '${target}'`],
            })),
        needsDecision: certain ? null : 'Pick which feature should declare it, if any.',
      }),
    ];
  }

  return [
    mapEntry({
      signal: input.signal,
      group: 'stale',
      action: 'remove',
      field: input.field,
      reference: input.reference,
      fromFeatureId: input.featureId,
      certainty: 'certain',
      evidence: [
        `'${input.featureId}' declares it and ${input.explain}`,
        'Nothing in the repository supports the entry, so the map is claiming something untrue.',
      ],
    }),
  ];
}

/**
 * A page or route handler nobody has accounted for.
 *
 * The one actionable finding where the report names **no** owner: an unmapped
 * surface has an empty `claimedBy` by definition, and guessing from the path
 * would put a made-up owner into the file every other signal trusts. So the
 * proposal gives the two shapes the edit can take and leaves the choice open.
 */
export function proposeForUnmappedSurface(finding: SurfaceFinding): MapEntryProposal[] {
  const what = finding.kind === 'page' ? 'page' : 'route handler';

  return [
    mapEntry({
      signal: 'product-surface',
      group: 'unmapped',
      action: 'add',
      field: 'codeLocations',
      reference: finding.path,
      certainty: 'unresolved',
      evidence: [
        `A ${what} the walker found under \`app/\` that no feature's \`codeLocations\` covers and no \`EXCLUDED\` entry excludes.`,
        'The scan attributes it to no feature, so nothing here names an owner — a guess from the path would be a claim the repository does not make.',
      ],
      candidates: [
        {
          target: 'a feature',
          evidence: [
            `add '${finding.path}' to that feature's \`codeLocations\`, if it is part of a product feature`,
          ],
        },
        {
          target: 'EXCLUDED',
          evidence: [
            `add '${finding.path}' to the exclusion list, if it is operator tooling or otherwise not product`,
          ],
        },
      ],
      needsDecision: `Decide whether this ${what} is product — then which feature owns it — or whether it belongs in \`EXCLUDED\`.`,
    }),
  ];
}

/**
 * A `codeLocations` or `EXCLUDED` path that is not on disk.
 *
 * The report's move candidates are the only evidence available without a
 * history walk, and they are name matches. A single `basename-and-parent`
 * match is strong enough to name; anything else is listed and left to a person.
 */
export function proposeForMissingReference(finding: MapReferenceFinding): MapEntryProposal[] {
  const owner = finding.featureId;
  const strong = finding.moveCandidates.filter(
    (candidate) => candidate.strength === 'basename-and-parent'
  );
  const certain = strong.length === 1 && finding.moveCandidates.length === 1;

  if (finding.moveCandidates.length === 0) {
    return [
      mapEntry({
        signal: 'map-references',
        group: 'missing',
        action: 'remove',
        field: finding.kind === 'excluded' ? 'EXCLUDED' : 'codeLocations',
        reference: finding.path,
        fromFeatureId: owner,
        certainty: 'certain',
        evidence: [
          'The map names this path and it is not on disk.',
          'No file or directory in the tree matches its name, so there is nothing to repoint it at.',
        ],
        needsDecision: null,
      }),
    ];
  }

  return [
    mapEntry({
      signal: 'map-references',
      group: 'missing',
      action: 'add',
      field: finding.kind === 'excluded' ? 'EXCLUDED' : 'codeLocations',
      reference: certain ? strong[0].path : finding.moveCandidates[0].path,
      featureId: owner,
      fromFeatureId: owner,
      certainty: certain ? 'certain' : 'ambiguous',
      evidence: [
        `The map names '${finding.path}' and it is not on disk.`,
        `${finding.moveCandidatesConsidered} path${finding.moveCandidatesConsidered === 1 ? '' : 's'} in the tree match its name; the match is on the file name, not on history, so it is advisory.`,
        ...(certain
          ? [`One candidate matches both the file name and its parent directory.`]
          : [`No single candidate is a clear match.`]),
      ],
      candidates: finding.moveCandidates.map((candidate) => ({
        target: candidate.path,
        evidence: [`matched on ${candidate.strength}`, ...candidate.evidence],
      })),
      needsDecision: `Confirm where '${finding.path}' went, then replace the entry. A name match is not proof it is the same code.`,
    }),
  ];
}

/** First sentence of a description, for a draft's test name. */
function firstSentence(text: string): string {
  const [sentence] = text.split(/(?<=\.)\s/);
  return (sentence ?? text).replace(/\.$/, '');
}

/**
 * A draft unit test for a feature the map lists no test for.
 *
 * Minimal on purpose, and built so it **cannot claim coverage it does not
 * have**: every case is `it.todo`, which Vitest reports as a todo rather than a
 * pass. A draft that asserted something plausible would be worse than no draft,
 * because a green tick against a feature nobody has tested is exactly the lie
 * this whole platform exists to catch.
 *
 * Pure text. Nothing writes it to `__tests__/` — that is a person's decision,
 * and a test asserts this module cannot write a file at all.
 */
export function proposeTestDraft(
  feature: PlatformFeature,
  knownTestPaths: string[] = []
): TestDraftProposal {
  const suggestedPath = `${TEST_ROOT}/${feature.id}.test.ts`;
  const taken = knownTestPaths.includes(suggestedPath);
  const locations = feature.codeLocations;

  const draft = [
    '/**',
    ` * ${feature.name} — draft, not coverage.`,
    ' *',
    ' * Generated by the Developer Platform drift page (PLATFORM_TODO item 18) as a',
    ' * starting point, because the coverage map lists no unit test for this',
    ' * feature. Every case below is `it.todo`, so this file asserts nothing until',
    ' * a person writes the assertions — a draft must not report as passing.',
    ' *',
    ` * Feature: ${feature.id} (${feature.category}, ${feature.status})`,
    ` * What a user does: ${feature.userDescription}`,
    ' * Code it owns:',
    ...locations.map((location) => ` *   - ${location}`),
    ' */',
    '',
    "import { describe, it } from 'vitest';",
    '',
    `describe('${feature.name.replace(/'/g, "\\'")}', () => {`,
    `  // TODO: import the unit under test from one of the paths above.`,
    `  it.todo('${firstSentence(feature.userDescription).replace(/'/g, "\\'")}');`,
    '',
    '  // TODO: add a case for the failure a user would actually hit here, and',
    '  // delete any todo you decide is not worth a test.',
    `  it.todo('handles the case where that goes wrong');`,
    '});',
    '',
  ].join('\n');

  return {
    kind: 'test-draft',
    id: `coverage-map.featuresWithoutTests:${feature.id}`,
    featureId: feature.id,
    featureName: feature.name,
    category: feature.category,
    suggestedPath,
    draft,
    evidence: [
      `The coverage map lists no \`unitTests\` entry for '${feature.id}', and it is ${feature.status}.`,
      `It owns ${locations.length} repo ${locations.length === 1 ? 'path' : 'paths'}: ${locations.join(', ')}.`,
      ...(taken
        ? [
            `A file already exists at ${suggestedPath}; name the new one for the behaviour it covers.`,
          ]
        : []),
    ],
    placeholders: [
      'The unit to import — the draft names the feature’s paths and does not choose a module.',
      'Every assertion. The cases are `it.todo`, which Vitest counts as a todo and never as a pass.',
      ...(taken ? ['The file name, since the suggested one is taken.'] : []),
    ],
  };
}

/** Draft tests for every feature the map lists no unit test for, by id. */
export function proposeTestDrafts(
  features: PlatformFeature[],
  knownTestPaths: string[] = []
): TestDraftProposal[] {
  return features
    .filter((feature) => feature.unitTests.length === 0)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((feature) => proposeTestDraft(feature, knownTestPaths));
}

export function summarizeProposals(
  mapEntries: MapEntryProposal[],
  testDrafts: TestDraftProposal[]
): ProposalSummary {
  const certainty = (value: ProposalCertainty) =>
    mapEntries.filter((proposal) => proposal.certainty === value).length;

  return {
    total: mapEntries.length + testDrafts.length,
    mapEntries: mapEntries.length,
    testDrafts: testDrafts.length,
    certain: certainty('certain'),
    ambiguous: certainty('ambiguous'),
    unresolved: certainty('unresolved'),
    needingDecision: [...mapEntries, ...testDrafts].filter((proposal) =>
      proposal.kind === 'map-entry'
        ? proposal.needsDecision !== null
        : proposal.placeholders.length > 0
    ).length,
  };
}
