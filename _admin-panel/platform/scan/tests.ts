import { readdirSync } from 'node:fs';
import path from 'node:path';

import { COVERAGE_MAP, REACHABILITY } from '../coverage-map';
import type { PlatformFeature, ReachabilityRecord } from '../coverage-map';
import {
  barrelTargets,
  createReferenceReader,
  resolveModuleFile,
  toModuleKey,
  type ModuleReference,
} from './import-graph';
import { covers } from './surface';
import type {
  StaleTestReference,
  TestClassification,
  TestFinding,
  TestScanReport,
  TestScanSummary,
} from './types';

/**
 * Signal 2 of the drift scan: which feature does each test actually cover?
 *
 * The coverage map's `unitTests` lists are hand-written judgement calls. This
 * signal derives the same relationship from the import graph and reports where
 * the two disagree, so the map cannot quietly claim coverage it does not have.
 *
 * No test is special-cased here. Attribution falls out of `codeLocations` and
 * the recorded reachability, which is why the dead `lib/resume-parser/` cluster
 * lands in `dead-code` rather than under AI resume import — nothing in this file
 * mentions it.
 */

const TEST_ROOT = '__tests__';

/** Every Vitest file, sorted. */
export function discoverTestFiles(repoRoot: string = process.cwd()): string[] {
  const found: string[] = [];

  const walk = (relativeDir: string): void => {
    for (const entry of readdirSync(path.join(repoRoot, relativeDir), { withFileTypes: true })) {
      const relativePath = `${relativeDir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(relativePath);
      } else if (/\.test\.tsx?$/.test(entry.name)) {
        found.push(relativePath);
      }
    }
  };

  walk(TEST_ROOT);
  return found.sort();
}

/** Features whose `codeLocations` cover any of these paths. */
function featuresCovering(targets: string[], features: PlatformFeature[]): string[] {
  const matched = features
    .filter((feature) =>
      feature.codeLocations.some((location) => targets.some((target) => covers(location, target)))
    )
    .map((feature) => feature.id);

  return [...new Set(matched)].sort();
}

/** Features whose `unitTests` list this file. */
function featuresDeclaring(testPath: string, features: PlatformFeature[]): string[] {
  return features
    .filter((feature) => feature.unitTests.includes(testPath))
    .map((feature) => feature.id)
    .sort();
}

/**
 * True when every target sits under a module recorded as an orphan.
 *
 * `some` would be wrong: a test touching both live and dead code is still
 * covering live code. Only a test whose entire reach is dead is dead.
 */
function reachesOnlyOrphans(targets: string[], reachability: ReachabilityRecord[]): boolean {
  const orphans = reachability.filter((record) => record.reachability === 'orphan');
  if (targets.length === 0 || orphans.length === 0) return false;

  return targets.every((target) => orphans.some((record) => covers(record.path, target)));
}

function classify(
  inferredFeatures: string[],
  declaredFeatures: string[],
  deadCode: boolean
): TestClassification {
  // Dead code is checked first so these tests are reported as covering a dead
  // parser, not merely as "nobody categorised this".
  if (deadCode) return 'dead-code';
  if (inferredFeatures.length === 0) return 'uncategorized';
  if (declaredFeatures.length === 0) return 'unlisted';

  const agrees = inferredFeatures.some((id) => declaredFeatures.includes(id));
  return agrees ? 'mapped' : 'misattributed';
}

export type TestScanOptions = {
  /** Test files to analyse. Defaults to walking `__tests__`. */
  testFiles?: string[];
  features?: PlatformFeature[];
  reachability?: ReachabilityRecord[];
  repoRoot?: string;
};

type Resolution = {
  directTargets: string[];
  barrelTargets: string[];
  unresolved: string[];
  sourceTextTargets: string[];
};

/** Resolves one test file's references into repo paths. */
function resolveTargets(
  testPath: string,
  readReferences: (relativePath: string) => ModuleReference[],
  repoRoot: string
): Resolution {
  const direct = new Set<string>();
  const barrels = new Set<string>();
  const unresolved = new Set<string>();
  const sourceText = new Set<string>();

  for (const reference of readReferences(testPath)) {
    if (reference.kind === 'source-text') {
      // Already a repo-relative path, not a module specifier.
      const resolved = resolveModuleFile(reference.specifier, repoRoot) ?? reference.specifier;
      sourceText.add(reference.specifier);
      direct.add(resolved);
      continue;
    }

    const key = toModuleKey(reference.specifier, testPath);
    // A bare specifier is a package; it is not drift and not our graph.
    if (key === null) continue;

    const resolved = resolveModuleFile(key, repoRoot);
    if (resolved === null) {
      unresolved.add(reference.specifier);
      continue;
    }

    direct.add(resolved);
    for (const target of barrelTargets(resolved, readReferences, repoRoot)) {
      barrels.add(target);
    }
  }

  // A module reached directly is not also a barrel hop.
  for (const target of direct) barrels.delete(target);

  return {
    directTargets: [...direct].sort(),
    barrelTargets: [...barrels].sort(),
    unresolved: [...unresolved].sort(),
    sourceTextTargets: [...sourceText].sort(),
  };
}

function summarize(findings: TestFinding[]): TestScanSummary {
  const count = (classification: TestClassification) =>
    findings.filter((finding) => finding.classification === classification).length;

  return {
    total: findings.length,
    mapped: count('mapped'),
    unlisted: count('unlisted'),
    misattributed: count('misattributed'),
    uncategorized: count('uncategorized'),
    deadCode: count('dead-code'),
    sourceText: findings.filter((finding) => finding.assertion === 'source-text').length,
    unresolvable: findings.filter((finding) => finding.directTargets.length === 0).length,
  };
}

/**
 * Coverage-map `unitTests` entries the import graph does not support.
 *
 * `missing-file` means the path does not resolve at all; `no-import-link` means
 * the file exists but nothing in it reaches that feature's code, so the map is
 * claiming coverage the graph cannot see.
 */
function findStaleReferences(
  features: PlatformFeature[],
  findings: Map<string, TestFinding>
): StaleTestReference[] {
  const stale: StaleTestReference[] = [];

  for (const feature of features) {
    for (const testPath of feature.unitTests) {
      const finding = findings.get(testPath);
      if (!finding) {
        stale.push({ featureId: feature.id, testPath, reason: 'missing-file' });
      } else if (!finding.inferredFeatures.includes(feature.id)) {
        stale.push({ featureId: feature.id, testPath, reason: 'no-import-link' });
      }
    }
  }

  return stale.sort(
    (a, b) => a.featureId.localeCompare(b.featureId) || a.testPath.localeCompare(b.testPath)
  );
}

const byPath = (a: TestFinding, b: TestFinding) => a.path.localeCompare(b.path);

/** Attributes every test to a feature via the import graph. */
export function scanTestAttribution(options: TestScanOptions = {}): TestScanReport {
  const repoRoot = options.repoRoot ?? process.cwd();
  const features = options.features ?? COVERAGE_MAP;
  const reachability = options.reachability ?? REACHABILITY;
  const testFiles = options.testFiles ?? discoverTestFiles(repoRoot);
  const readReferences = createReferenceReader(repoRoot);

  const findings: TestFinding[] = testFiles.map((testPath) => {
    const resolution = resolveTargets(testPath, readReferences, repoRoot);
    const allTargets = [...resolution.directTargets, ...resolution.barrelTargets];

    const inferredFeatures = featuresCovering(allTargets, features);
    const declaredFeatures = featuresDeclaring(testPath, features);
    const deadCode = inferredFeatures.length === 0 && reachesOnlyOrphans(allTargets, reachability);

    return {
      path: testPath,
      assertion: resolution.sourceTextTargets.length > 0 ? 'source-text' : 'behavior',
      directTargets: resolution.directTargets,
      barrelTargets: resolution.barrelTargets,
      unresolved: resolution.unresolved,
      inferredFeatures,
      declaredFeatures,
      classification: classify(inferredFeatures, declaredFeatures, deadCode),
    };
  });

  const byClass = (classification: TestClassification) =>
    findings.filter((finding) => finding.classification === classification).sort(byPath);

  return {
    signal: 'test-attribution',
    summary: summarize(findings),
    tests: [...findings].sort(byPath),
    mapped: byClass('mapped'),
    unlisted: byClass('unlisted'),
    misattributed: byClass('misattributed'),
    uncategorized: byClass('uncategorized'),
    deadCode: byClass('dead-code'),
    stale: findStaleReferences(
      features,
      new Map(findings.map((finding) => [finding.path, finding]))
    ),
  };
}
