import { existsSync } from 'node:fs';
import path from 'node:path';

import { COVERAGE_MAP, EXCLUDED } from '../coverage-map';
import type { ExcludedPath, PlatformFeature } from '../coverage-map';
import {
  buildModuleGraph,
  modulesUnder,
  type ModuleGraph,
  type ModuleGraphOptions,
} from './module-graph';
import type {
  MapReferenceClassification,
  MapReferenceFinding,
  MapReferenceScanReport,
  MapReferenceScanSummary,
  MoveCandidate,
} from './types';

/**
 * Signal 8 of the drift scan: the map's implementation references vs the tree
 * (PLATFORM_TODO item 8).
 *
 * Three states, kept apart on purpose:
 *
 * - `missing` — the map names a path that is not there. A contradiction: the
 *   map is wrong, and it fails the scan.
 * - `orphaned` — the path is there, and every module under it is unreachable
 *   from any shipped entry point. Not a contradiction. The feature really does
 *   own that code; the code has gone dead. Reported so item 19 has a shortlist
 *   it did not have to guess at.
 * - `present` — at least one module under it is reachable, or it holds no
 *   TypeScript modules at all (`_extensions/chrome`, `pdf-worker`).
 *
 * Move candidates are **advisory**. They are a filename match against the
 * current tree and nothing more: the evidence is carried on the finding, the
 * strength is labelled, and no candidate is ever written back to the map or
 * counted as a mapping. A guess that looks like a fact is worse than no guess.
 *
 * Deliberately not re-implemented here: a `unitTests` entry pointing at a
 * deleted file is signal 2's `missing-file`, and a `pathways` entry naming a
 * dropped pathway is signal 3's `unknown-pathway`. Both already fail the scan,
 * and a second implementation would eventually disagree with the first.
 *
 * `lab` references cannot be checked yet. Nothing defines where a lab module
 * lives until PLATFORM_TODO item 20, and guessing a directory in order to
 * report it missing would invent a filesystem location. They are listed as
 * declared, and that is all this signal can honestly say about them.
 */

/** How many candidates one missing path is offered. */
const MAX_MOVE_CANDIDATES = 5;

const lastSegment = (candidate: string): string => candidate.split('/').at(-1) ?? candidate;
const parentSegment = (candidate: string): string => {
  const segments = candidate.split('/');
  return segments.length > 1 ? segments[segments.length - 2] : '';
};

/** Every path the tree offers as a move target: modules and their directories. */
function candidatePaths(graph: ModuleGraph): string[] {
  const found = new Set<string>(graph.paths);

  for (const modulePath of graph.paths) {
    const segments = modulePath.split('/');
    for (let depth = 1; depth < segments.length; depth += 1) {
      found.add(segments.slice(0, depth).join('/'));
    }
  }

  return [...found].sort();
}

/**
 * Files or directories that share a name with a path the map has lost.
 *
 * Advisory. A filename match is the only evidence available without a history
 * walk, so it is reported as such: `basename-and-parent` also matches the
 * parent directory's name and is the stronger of the two, and neither is a
 * mapping.
 */
export function moveCandidatesFor(missingPath: string, candidates: string[]): MoveCandidate[] {
  const basename = lastSegment(missingPath);
  const parent = parentSegment(missingPath);

  return candidates
    .filter((candidate) => candidate !== missingPath && lastSegment(candidate) === basename)
    .map((candidate): MoveCandidate => {
      const parentMatches = parent !== '' && parentSegment(candidate) === parent;
      const evidence = [`same name: ${basename}`];
      if (parentMatches) evidence.push(`same parent directory: ${parent}`);

      return {
        path: candidate,
        strength: parentMatches ? 'basename-and-parent' : 'basename',
        evidence,
      };
    })
    .sort(
      (a, b) =>
        Number(b.strength === 'basename-and-parent') -
          Number(a.strength === 'basename-and-parent') || a.path.localeCompare(b.path)
    );
}

function classify(
  graph: ModuleGraph,
  repoRoot: string,
  referencePath: string
): { classification: MapReferenceClassification; modules: string[]; orphanModules: string[] } {
  const modules = modulesUnder(graph, referencePath);
  const orphanModules = modules.filter(
    (modulePath) => graph.modules.get(modulePath)!.reachability === 'orphan'
  );

  if (!existsSync(path.join(repoRoot, referencePath))) {
    return { classification: 'missing', modules, orphanModules };
  }

  // Every module dead and at least one module to judge. A path holding no
  // TypeScript at all says nothing about reachability either way.
  const classification: MapReferenceClassification =
    modules.length > 0 && orphanModules.length === modules.length ? 'orphaned' : 'present';

  return { classification, modules, orphanModules };
}

export type MapReferenceScanOptions = ModuleGraphOptions & {
  features?: PlatformFeature[];
  excluded?: ExcludedPath[];
  graph?: ModuleGraph;
};

function summarize(
  findings: MapReferenceFinding[],
  labsDeclared: string[]
): MapReferenceScanSummary {
  const count = (classification: MapReferenceClassification) =>
    findings.filter((finding) => finding.classification === classification).length;

  return {
    total: findings.length,
    present: count('present'),
    orphaned: count('orphaned'),
    missing: count('missing'),
    codeLocations: findings.filter((finding) => finding.kind === 'code-location').length,
    excluded: findings.filter((finding) => finding.kind === 'excluded').length,
    labsDeclared: labsDeclared.length,
    moveCandidates: findings.reduce((total, finding) => total + finding.moveCandidates.length, 0),
  };
}

const byPath = (a: MapReferenceFinding, b: MapReferenceFinding) =>
  a.path.localeCompare(b.path) || (a.featureId ?? '').localeCompare(b.featureId ?? '');

/** Checks every implementation path the map names against the current tree. */
export function scanMapReferences(options: MapReferenceScanOptions = {}): MapReferenceScanReport {
  const repoRoot = options.repoRoot ?? process.cwd();
  const graph = options.graph ?? buildModuleGraph(options);
  const features = options.features ?? COVERAGE_MAP;
  const excluded = options.excluded ?? EXCLUDED;
  const candidates = candidatePaths(graph);

  const build = (
    featureId: string | null,
    kind: MapReferenceFinding['kind'],
    referencePath: string
  ): MapReferenceFinding => {
    const { classification, modules, orphanModules } = classify(graph, repoRoot, referencePath);
    const moveCandidates =
      classification === 'missing'
        ? moveCandidatesFor(referencePath, candidates).slice(0, MAX_MOVE_CANDIDATES)
        : [];

    return {
      featureId,
      kind,
      path: referencePath,
      classification,
      moduleCount: modules.length,
      orphanModules,
      moveCandidates,
      moveCandidatesConsidered:
        classification === 'missing' ? moveCandidatesFor(referencePath, candidates).length : 0,
    };
  };

  const findings: MapReferenceFinding[] = [
    ...features.flatMap((feature) =>
      feature.codeLocations.map((location) => build(feature.id, 'code-location', location))
    ),
    ...excluded.map((entry) => build(null, 'excluded', entry.path)),
  ].sort(byPath);

  const labsDeclared = features
    .filter((feature) => Boolean(feature.lab))
    .map((feature) => `${feature.id} → ${feature.lab}`)
    .sort();

  const pick = (classification: MapReferenceClassification) =>
    findings.filter((finding) => finding.classification === classification).sort(byPath);

  return {
    signal: 'map-references',
    summary: summarize(findings, labsDeclared),
    references: findings,
    present: pick('present'),
    orphaned: pick('orphaned'),
    missing: pick('missing'),
    labsDeclared,
  };
}
