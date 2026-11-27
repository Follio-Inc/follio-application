import { REACHABILITY } from '../coverage-map';
import type { ReachabilityClass, ReachabilityRecord } from '../coverage-map';
import {
  buildModuleGraph,
  importersOf,
  modulesUnder,
  type ModuleGraph,
  type ModuleGraphOptions,
} from './module-graph';
import type {
  ReachabilityDisagreement,
  ReachabilityRecordFinding,
  ReachabilityScanReport,
  ReachabilityScanSummary,
} from './types';

/**
 * Signal 7 of the drift scan: item 3's reachability records vs the repository
 * (PLATFORM_TODO item 8).
 *
 * Item 3 classified five modules by hand, with `importedBy` and an entry chain
 * as evidence. This signal recomputes all of it from the current tree and
 * reports where the two disagree, so the records cannot quietly rot into a
 * false orphan report — which is the failure mode item 19 would act on.
 *
 * Nothing here names a module. The classes come from `module-graph`, which
 * walks the Next.js entry conventions, and the records come from the coverage
 * map; the two are compared by path. Removing all five records leaves this
 * signal reporting the repository's own classification with nothing to
 * contradict, which is the correct behaviour rather than a silent pass.
 *
 * The repository-wide classification is reported as counts plus two named
 * lists. Those lists are gaps, not contradictions: a module going dead is
 * something to act on, but it does not mean anything in the map is wrong.
 */

/** Classes the graph computes for the modules under a recorded path, sorted. */
function computedClassesFor(graph: ModuleGraph, recordPath: string): ReachabilityClass[] {
  const classes = modulesUnder(graph, recordPath).map(
    (modulePath) => graph.modules.get(modulePath)!.reachability
  );

  return [...new Set(classes)].sort();
}

/**
 * Whether a recorded entry chain is still a real path through the repository.
 *
 * Checked rather than compared for equality: several entry points may reach the
 * same module, and the record naming one of them is not drift as long as that
 * one still works. What *is* drift is a chain whose hops no longer exist, or
 * one that no longer starts at an entry point.
 */
function entryChainIsValid(
  graph: ModuleGraph,
  recordPath: string,
  chain: string[],
  recordedClass: ReachabilityClass
): boolean {
  // An orphan has no chain, by definition. A reachable record must have one.
  if (recordedClass === 'orphan') return chain.length === 0;
  if (chain.length < 2) return false;

  if (!graph.entryPoints.includes(chain[0])) return false;
  if (chain.at(-1) !== recordPath && !modulesUnder(graph, recordPath).includes(chain.at(-1)!)) {
    return false;
  }

  for (let step = 0; step < chain.length - 1; step += 1) {
    const from = graph.modules.get(chain[step]);
    if (!from || !from.references.includes(chain[step + 1])) return false;
  }

  return true;
}

/** The graph's own shortest chain to a recorded path, entry first. */
function derivedEntryChain(graph: ModuleGraph, recordPath: string): string[] {
  const candidates = modulesUnder(graph, recordPath)
    .map((modulePath) => graph.modules.get(modulePath)!.entryChain)
    .filter((chain) => chain.length > 0)
    .sort((a, b) => a.length - b.length || a.join('/').localeCompare(b.join('/')));

  return candidates[0] ?? [];
}

function compareRecord(graph: ModuleGraph, record: ReachabilityRecord): ReachabilityRecordFinding {
  const modules = modulesUnder(graph, record.path);
  const computedClasses = computedClassesFor(graph, record.path);
  const derivedImporters = importersOf(graph, record.path);
  const recordedImporters = [...record.importedBy].sort();

  const lostImporters = recordedImporters.filter((file) => !derivedImporters.includes(file));
  const gainedImporters = derivedImporters.filter((file) => !recordedImporters.includes(file));
  const chainValid = entryChainIsValid(graph, record.path, record.entryChain, record.reachability);

  const disagreements: ReachabilityDisagreement[] = [];
  if (modules.length === 0) {
    // Nothing on disk under the recorded path: the record points at code that
    // is gone, so every other comparison below is vacuous.
    disagreements.push('missing-path');
  } else {
    // A directory record claims one class for its whole subtree, so anything
    // other than exactly that class is a disagreement.
    if (computedClasses.length !== 1 || computedClasses[0] !== record.reachability) {
      disagreements.push('class-changed');
    }
    if (lostImporters.length > 0 || gainedImporters.length > 0) {
      disagreements.push('importers-changed');
    }
    if (!chainValid) disagreements.push('entry-chain-invalid');
  }

  return {
    path: record.path,
    recordedClass: record.reachability,
    computedClasses,
    moduleCount: modules.length,
    recordedImporters,
    derivedImporters,
    lostImporters,
    gainedImporters,
    recordedEntryChain: record.entryChain,
    derivedEntryChain: derivedEntryChain(graph, record.path),
    entryChainValid: chainValid,
    disagreements,
  };
}

export type ReachabilityScanOptions = ModuleGraphOptions & {
  /** Records to check. Defaults to the real `REACHABILITY`. */
  records?: ReachabilityRecord[];
  /** Pre-built graph, so one build serves every signal. */
  graph?: ModuleGraph;
};

function summarize(
  graph: ModuleGraph,
  findings: ReachabilityRecordFinding[],
  unrecordedOrphans: string[],
  unrecordedCallUnused: string[]
): ReachabilityScanSummary {
  const count = (reachability: ReachabilityClass) =>
    [...graph.modules.values()].filter((module) => module.reachability === reachability).length;

  return {
    modules: graph.paths.length,
    entryPoints: graph.entryPoints.length,
    live: count('live'),
    moduleReachableCallUnused: count('module-reachable-call-unused'),
    orphan: count('orphan'),
    records: findings.length,
    recordsInAgreement: findings.filter((finding) => finding.disagreements.length === 0).length,
    unrecordedOrphans: unrecordedOrphans.length,
    unrecordedCallUnused: unrecordedCallUnused.length,
  };
}

const byPath = (a: { path: string }, b: { path: string }) => a.path.localeCompare(b.path);

/** Compares the reachability records against the repository's module graph. */
export function scanReachability(options: ReachabilityScanOptions = {}): ReachabilityScanReport {
  const graph = options.graph ?? buildModuleGraph(options);
  const records = options.records ?? REACHABILITY;

  const findings = [...records]
    .map((record) => compareRecord(graph, record))
    .sort((a, b) => a.path.localeCompare(b.path));

  // A module a record already accounts for is not an unrecorded finding, and a
  // directory record accounts for its whole subtree.
  const recorded = new Set(records.flatMap((record) => modulesUnder(graph, record.path)));
  const unrecorded = (reachability: ReachabilityClass) =>
    graph.paths
      .filter((modulePath) => !recorded.has(modulePath))
      .filter((modulePath) => graph.modules.get(modulePath)!.reachability === reachability)
      .sort();

  const unrecordedOrphans = unrecorded('orphan');
  const unrecordedCallUnused = unrecorded('module-reachable-call-unused');

  // An orphan with an importer is transitively dead rather than unimported —
  // the distinction item 3 recorded by hand for `lib/resume-parser/`. Every
  // importer of an orphan is itself an orphan, since a reachable importer
  // would make it reachable; the interest is in the ones crossing a directory
  // boundary, which is where a dead end is visible without reading the code.
  const parentOf = (modulePath: string) => modulePath.split('/').slice(0, -1).join('/');
  const deadEnds = graph.paths
    .map((modulePath) => graph.modules.get(modulePath)!)
    .filter((module) => module.reachability === 'orphan')
    .map((module) => ({
      path: module.path,
      importedBy: module.importedBy.filter(
        (importer) => parentOf(importer) !== parentOf(module.path)
      ),
    }))
    .filter((entry) => entry.importedBy.length > 0)
    .sort(byPath);

  return {
    signal: 'reachability',
    summary: summarize(graph, findings, unrecordedOrphans, unrecordedCallUnused),
    entryPoints: graph.entryPoints,
    records: findings,
    disagreements: findings.filter((finding) => finding.disagreements.length > 0).sort(byPath),
    unrecordedOrphans,
    unrecordedCallUnused,
    deadEnds,
  };
}
