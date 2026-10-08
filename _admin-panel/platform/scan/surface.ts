import { readdirSync } from 'node:fs';
import path from 'node:path';

import { COVERAGE_MAP, EXCLUDED } from '../coverage-map';
import type { ExcludedPath, PlatformFeature } from '../coverage-map';
import type {
  SurfaceClassification,
  SurfaceFinding,
  SurfaceKind,
  SurfaceScanReport,
  SurfaceScanSummary,
} from './types';

/**
 * Signal 1 of the drift scan: every page and API route vs the coverage map.
 *
 * Server-only (walks the filesystem). The classification rule lives here and
 * nowhere else — `__tests__/platform-coverage-map.test.ts` calls this rather
 * than keeping its own copy, so the map's completeness check and the CLI can
 * never disagree about what "mapped" means.
 */

/** Where each kind of surface lives, and what filename identifies it. */
const SURFACE_SOURCES: { kind: SurfaceKind; root: string; basename: string }[] = [
  { kind: 'page', root: 'app', basename: 'page.tsx' },
  { kind: 'route', root: 'app/api', basename: 'route.ts' },
];

export type DiscoveredSurface = { path: string; kind: SurfaceKind };

/**
 * A directory claims everything beneath it; a file claims only itself.
 *
 * Plain prefix matching would make `app/me` claim `app/menu/page.tsx`, so the
 * separator is required.
 */
export function covers(claim: string, targetPath: string): boolean {
  return targetPath === claim || targetPath.startsWith(`${claim}/`);
}

/**
 * Feature ids whose `codeLocations` cover any of these repo paths, sorted.
 *
 * The one implementation of "which feature owns this file", shared by every
 * signal. Two copies would eventually disagree, and then the same file would
 * have two owners depending on which part of the report you read.
 */
export function featuresCovering(targets: string[], features: PlatformFeature[]): string[] {
  const matched = features
    .filter((feature) =>
      feature.codeLocations.some((location) => targets.some((target) => covers(location, target)))
    )
    .map((feature) => feature.id);

  return [...new Set(matched)].sort();
}

/**
 * Walks `root` for files named `basename`.
 *
 * Hand-rolled rather than `readdirSync(dir, { recursive: true })` because CI
 * pins Node 20, where that option is not available in every minor. Results are
 * sorted, so discovery order never leaks into the report.
 */
function findFilesNamed(repoRoot: string, root: string, basename: string): string[] {
  const found: string[] = [];

  const walk = (relativeDir: string): void => {
    const entries = readdirSync(path.join(repoRoot, relativeDir), { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = `${relativeDir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(relativePath);
      } else if (entry.name === basename) {
        found.push(relativePath);
      }
    }
  };

  walk(root);
  return found.sort();
}

/** Every page and API route in the repo, sorted by path within each kind. */
export function discoverProductSurface(repoRoot: string = process.cwd()): DiscoveredSurface[] {
  return SURFACE_SOURCES.flatMap(({ kind, root, basename }) =>
    findFilesNamed(repoRoot, root, basename).map((surfacePath) => ({ path: surfacePath, kind }))
  );
}

function classifyOne(
  surface: DiscoveredSurface,
  features: PlatformFeature[],
  excluded: ExcludedPath[]
): SurfaceFinding {
  const claims = features.flatMap((feature) =>
    feature.codeLocations
      .filter((location) => covers(location, surface.path))
      .map((location) => ({ featureId: feature.id, location }))
  );

  if (claims.length > 0) {
    return {
      path: surface.path,
      kind: surface.kind,
      classification: 'mapped',
      claimedBy: [...new Set(claims.map((claim) => claim.featureId))].sort(),
      // The most specific claim is the most useful one to show.
      matchedBy: claims.map((claim) => claim.location).sort((a, b) => b.length - a.length)[0],
    };
  }

  const exclusion = excluded.find((entry) => covers(entry.path, surface.path));
  if (exclusion) {
    return {
      path: surface.path,
      kind: surface.kind,
      classification: 'excluded',
      claimedBy: [],
      matchedBy: exclusion.path,
    };
  }

  return {
    path: surface.path,
    kind: surface.kind,
    classification: 'unmapped',
    claimedBy: [],
  };
}

export type SurfaceScanOptions = {
  /**
   * Discovered surfaces to classify. Defaults to walking the repo.
   *
   * This is the seam tests use to feed a fake tree: pass a list containing an
   * unaccounted route and assert the scan reports it, without touching disk.
   */
  surfaces?: DiscoveredSurface[];
  /** Defaults to the real coverage map. */
  features?: PlatformFeature[];
  /** Defaults to the real exclusions. */
  excluded?: ExcludedPath[];
  /** Repo root for discovery. Ignored when `surfaces` is given. */
  repoRoot?: string;
};

function summarize(findings: SurfaceFinding[]): SurfaceScanSummary {
  const count = (classification: SurfaceClassification) =>
    findings.filter((finding) => finding.classification === classification).length;

  return {
    total: findings.length,
    mapped: count('mapped'),
    excluded: count('excluded'),
    unmapped: count('unmapped'),
    pages: findings.filter((finding) => finding.kind === 'page').length,
    routes: findings.filter((finding) => finding.kind === 'route').length,
  };
}

const byPath = (a: SurfaceFinding, b: SurfaceFinding) => a.path.localeCompare(b.path);

/** Classifies the product surface against the coverage map. */
export function scanProductSurface(options: SurfaceScanOptions = {}): SurfaceScanReport {
  const surfaces = options.surfaces ?? discoverProductSurface(options.repoRoot);
  const features = options.features ?? COVERAGE_MAP;
  const excluded = options.excluded ?? EXCLUDED;

  const findings = surfaces.map((surface) => classifyOne(surface, features, excluded));
  const pick = (classification: SurfaceClassification) =>
    findings.filter((finding) => finding.classification === classification).sort(byPath);

  return {
    signal: 'product-surface',
    summary: summarize(findings),
    mapped: pick('mapped'),
    excluded: pick('excluded'),
    unmapped: pick('unmapped'),
  };
}
