import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { LIVE_QA_PATHWAYS } from '../../modules/developer/live-qa/catalog';
import type { LiveQaPathway } from '../../modules/developer/live-qa/types';
import { COVERAGE_MAP } from '../coverage-map';
import type { PlatformFeature } from '../coverage-map';
import type {
  PathwayFinding,
  PathwayScanReport,
  PathwayScanSummary,
  StalePathwayReference,
} from './types';

/**
 * Signal 3 of the drift scan: Live QA pathways vs the coverage map.
 *
 * `LIVE_QA_PATHWAYS` is the single source of truth for what pathways exist —
 * this signal reads it rather than keeping a second catalog, and no pathway id
 * appears anywhere in this file. It checks three relationships:
 *
 * - each catalog `spec` against the file on disk
 * - each catalog id against the features that claim it
 * - each feature's `pathways` entry against the catalog
 *
 * Inventory only. Nothing here runs Playwright; executing pathways is the Test
 * Console's job (PLATFORM_TODO item 14).
 *
 * Imports `live-qa/catalog` directly rather than the module barrel, which
 * reaches `runner.ts` (child_process) and `fixtures.ts` (fs) for no reason here.
 */

/** Where the Live QA module lives, relative to the repo root. */
const LIVE_QA_ROOT = '_admin-panel/modules/developer/live-qa';
const PATHWAYS_DIR = `${LIVE_QA_ROOT}/pathways`;

/** Resolves a catalog `spec` to its repo-relative path. */
export function specPathFor(spec: string): string {
  return `${LIVE_QA_ROOT}/${spec}`;
}

/** Every `*.spec.ts` under `pathways/`, sorted. Helpers are not specs. */
export function discoverPathwaySpecs(repoRoot: string = process.cwd()): string[] {
  const directory = path.join(repoRoot, PATHWAYS_DIR);
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.spec.ts'))
    .map((entry) => `${PATHWAYS_DIR}/${entry.name}`)
    .sort();
}

/** Feature ids whose `pathways` list this id. */
function featuresClaiming(pathwayId: string, features: PlatformFeature[]): string[] {
  return features
    .filter((feature) => feature.pathways.includes(pathwayId))
    .map((feature) => feature.id)
    .sort();
}

export type PathwayScanOptions = {
  /** Catalog to analyse. Defaults to the real `LIVE_QA_PATHWAYS`. */
  pathways?: LiveQaPathway[];
  features?: PlatformFeature[];
  /** Spec files on disk. Defaults to walking `pathways/`. */
  specFiles?: string[];
  repoRoot?: string;
};

function summarize(
  findings: PathwayFinding[],
  orphanSpecs: string[],
  features: PlatformFeature[]
): PathwayScanSummary {
  const withPathway = features.filter((feature) => feature.pathways.length > 0).length;

  return {
    total: findings.length,
    mapped: findings.filter((finding) => finding.classification === 'mapped').length,
    unmapped: findings.filter((finding) => finding.classification === 'unmapped').length,
    missingSpec: findings.filter((finding) => finding.specPath === null).length,
    orphanSpecs: orphanSpecs.length,
    featuresWithPathway: withPathway,
    featuresWithoutPathway: features.length - withPathway,
  };
}

const byId = (a: PathwayFinding, b: PathwayFinding) => a.id.localeCompare(b.id);

/** Compares the Live QA catalog against the coverage map and the specs on disk. */
export function scanLiveQaPathways(options: PathwayScanOptions = {}): PathwayScanReport {
  const repoRoot = options.repoRoot ?? process.cwd();
  const catalog = options.pathways ?? LIVE_QA_PATHWAYS;
  const features = options.features ?? COVERAGE_MAP;
  const specFiles = options.specFiles ?? discoverPathwaySpecs(repoRoot);

  const findings: PathwayFinding[] = catalog.map((pathway) => {
    const specPath = specPathFor(pathway.spec);
    const claimedBy = featuresClaiming(pathway.id, features);

    return {
      id: pathway.id,
      spec: pathway.spec,
      specPath: existsSync(path.join(repoRoot, specPath)) ? specPath : null,
      area: pathway.area,
      requiresAuth: pathway.requiresAuth,
      stability: pathway.stability,
      claimedBy,
      classification: claimedBy.length > 0 ? 'mapped' : 'unmapped',
    };
  });

  // A spec on disk the catalog never mentions: it can never run through the
  // catalog, so it is invisible rather than merely unowned.
  const cataloguedSpecs = new Set(catalog.map((pathway) => specPathFor(pathway.spec)));
  const orphanSpecs = specFiles.filter((specFile) => !cataloguedSpecs.has(specFile)).sort();

  const knownIds = new Set(catalog.map((pathway) => pathway.id));
  const stale: StalePathwayReference[] = features
    .flatMap((feature) =>
      feature.pathways
        .filter((pathwayId) => !knownIds.has(pathwayId))
        .map((pathwayId) => ({
          featureId: feature.id,
          pathwayId,
          reason: 'unknown-pathway' as const,
        }))
    )
    .sort(
      (a, b) => a.featureId.localeCompare(b.featureId) || a.pathwayId.localeCompare(b.pathwayId)
    );

  const pick = (classification: PathwayFinding['classification']) =>
    findings.filter((finding) => finding.classification === classification).sort(byId);

  return {
    signal: 'live-qa-pathways',
    summary: summarize(findings, orphanSpecs, features),
    pathways: [...findings].sort(byId),
    mapped: pick('mapped'),
    unmapped: pick('unmapped'),
    missingSpec: findings.filter((finding) => finding.specPath === null).sort(byId),
    orphanSpecs,
    stale,
    featuresWithoutPathway: features
      .filter((feature) => feature.pathways.length === 0)
      .map((feature) => feature.id)
      .sort(),
  };
}
