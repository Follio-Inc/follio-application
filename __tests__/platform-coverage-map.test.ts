/**
 * Coverage map invariants (PLATFORM_TODO items 1–3).
 *
 * The map is the Developer Platform's source of truth, and the drift scan will
 * read it to decide what is missing. A stale path here becomes a false drift
 * report there, so every path is checked against the filesystem, every pathway
 * against the real Live QA catalog, and every reachability record against the
 * repository's actual import graph.
 *
 * Imports `live-qa/catalog` directly rather than the developer barrel: the
 * barrel reaches `health.ts` → `lib/db` → a generated Prisma client, which this
 * test has no reason to load.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { LIVE_QA_PATHWAYS } from '@/_admin-panel/modules/developer/live-qa/catalog';
import {
  COVERAGE_MAP,
  EXCLUDED,
  FEATURE_CATEGORIES,
  REACHABILITY,
  getFeature,
  getReachability,
  listByReachability,
  listFeatures,
} from '@/_admin-panel/platform/coverage-map';
import { covers, discoverProductSurface, scanProductSurface } from '@/_admin-panel/platform/scan';

function resolveFromRepoRoot(relativePath: string): string {
  return path.join(process.cwd(), relativePath);
}

describe('coverage map', () => {
  it('registers unique ids across the whole inventory', () => {
    const ids = COVERAGE_MAP.map((feature) => feature.id);

    expect(new Set(ids).size).toBe(ids.length);
    // Item 2 filled the map out from the five item-1 seeds.
    expect(COVERAGE_MAP.length).toBeGreaterThan(5);
  });

  it('resolves every id through the lookup helper', () => {
    for (const feature of COVERAGE_MAP) {
      expect(getFeature(feature.id)?.id).toBe(feature.id);
    }
    expect(getFeature('not-a-real-feature')).toBeUndefined();
  });

  it('filters features by id list', () => {
    const subset = listFeatures(['cover-letter', 'public-follio']);
    expect(subset.map((feature) => feature.id)).toEqual(['cover-letter', 'public-follio']);

    // No ids, or an empty list, means "everything" — not "nothing".
    expect(listFeatures()).toHaveLength(COVERAGE_MAP.length);
    expect(listFeatures([])).toHaveLength(COVERAGE_MAP.length);
  });

  it('points every codeLocations entry at a path that exists on disk', () => {
    for (const feature of COVERAGE_MAP) {
      expect(feature.codeLocations.length, `${feature.id} owns no code`).toBeGreaterThan(0);

      for (const location of feature.codeLocations) {
        expect(location, `${feature.id}: must be repo-relative`).not.toMatch(/^[./]/);
        expect(
          existsSync(resolveFromRepoRoot(location)),
          `${feature.id} → missing codeLocation: ${location}`
        ).toBe(true);
      }
    }
  });

  it('points every unitTests entry at a test file that exists on disk', () => {
    for (const feature of COVERAGE_MAP) {
      for (const testFile of feature.unitTests) {
        expect(testFile, `${feature.id}: must be a test file`).toMatch(/\.test\.tsx?$/);
        expect(
          existsSync(resolveFromRepoRoot(testFile)),
          `${feature.id} → missing unitTest: ${testFile}`
        ).toBe(true);
      }
    }
  });

  it('resolves every pathways entry to a real Live QA pathway id', () => {
    const pathwayIds = new Set(LIVE_QA_PATHWAYS.map((pathway) => pathway.id));

    for (const feature of COVERAGE_MAP) {
      for (const pathwayId of feature.pathways) {
        expect(pathwayIds, `${feature.id} → unknown pathway: ${pathwayId}`).toContain(pathwayId);
      }
    }
  });

  it('describes each feature well enough to be acted on', () => {
    for (const feature of COVERAGE_MAP) {
      expect(feature.id, 'id must be kebab-case').toMatch(/^[a-z][a-z0-9-]*$/);
      expect(feature.name.length, feature.id).toBeGreaterThan(0);
      // Product language, not a one-word stub.
      expect(feature.userDescription.length, feature.id).toBeGreaterThan(30);
      expect(FEATURE_CATEGORIES, feature.id).toContain(feature.category);
    }
  });

  it('only carries a flag when the whole feature is gated', () => {
    for (const feature of COVERAGE_MAP) {
      if (feature.status === 'flagged') {
        expect(feature.flag, `${feature.id} is flagged but names no flag`).toBeTruthy();
      }
      if (feature.flag) {
        expect(feature.status, `${feature.id} names a flag but is not flagged`).toBe('flagged');
      }
    }
  });

  it('exposes the map from the module entry point', async () => {
    const entry = await import('@/_admin-panel/platform/coverage-map');
    expect(entry.COVERAGE_MAP).toHaveLength(COVERAGE_MAP.length);
    expect(entry.getFeature('resume-import-ai')?.category).toBe('Resume import');
    expect(entry.EXCLUDED.length).toBeGreaterThan(0);
  });
});

/**
 * Item 2's completeness condition, now checked through the item-4 scanner.
 *
 * This block used to carry its own walker and prefix matcher. It delegates to
 * `scanProductSurface` so there is exactly one implementation of "mapped":
 * two copies would eventually disagree, and then the map's own test and the
 * CLI would give different answers about the same tree.
 */
describe('product surface coverage', () => {
  it('finds the product surface on disk', () => {
    // Guards the walker: if discovery returned nothing, the completeness check
    // below would pass vacuously.
    const discovered = discoverProductSurface();

    expect(discovered.filter((surface) => surface.kind === 'page').length).toBeGreaterThan(40);
    expect(discovered.filter((surface) => surface.kind === 'route').length).toBeGreaterThan(95);
  });

  it('claims or explicitly excludes every page and API route', () => {
    const unaccounted = scanProductSurface().unmapped.map((finding) => finding.path);

    expect(
      unaccounted,
      `Unclaimed product surface — add a feature codeLocation or an EXCLUDED entry:\n${unaccounted.join('\n')}`
    ).toEqual([]);
  });

  it('gives every exclusion a real path and a reason', () => {
    expect(EXCLUDED.length).toBeGreaterThan(0);

    for (const entry of EXCLUDED) {
      expect(entry.path, 'exclusions must be repo-relative').not.toMatch(/^[./]/);
      expect(
        existsSync(resolveFromRepoRoot(entry.path)),
        `EXCLUDED path does not exist: ${entry.path}`
      ).toBe(true);
      // A bare "not product" tells the next reader nothing.
      expect(entry.reason.length, `EXCLUDED ${entry.path} needs a real reason`).toBeGreaterThan(30);
    }
  });

  it('never both claims and excludes the same path', () => {
    const allClaims = COVERAGE_MAP.flatMap((feature) => feature.codeLocations);

    for (const entry of EXCLUDED) {
      const conflicting = allClaims.filter(
        (claim) => covers(entry.path, claim) || covers(claim, entry.path)
      );
      expect(conflicting, `EXCLUDED ${entry.path} is also claimed by a feature`).toEqual([]);
    }
  });
});

/**
 * Reachability (PLATFORM_TODO item 3).
 *
 * These re-derive `importedBy` from the repository instead of trusting the
 * record, so rewiring any of these modules fails here. Scoped deliberately to
 * the five recorded paths — the general import-graph scan is item 5, not this.
 */

/** Source roots a shipped entry point could live in. Tests are excluded. */
const SOURCE_ROOTS = ['app', 'lib', 'services', 'components'];
const SOURCE_FILES = ['middleware.ts'];

function allSourceFiles(): string[] {
  const found: string[] = [...SOURCE_FILES];

  const walk = (relativeDir: string): void => {
    for (const entry of readdirSync(resolveFromRepoRoot(relativeDir), { withFileTypes: true })) {
      const relativePath = `${relativeDir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(relativePath);
      } else if (/\.tsx?$/.test(entry.name)) {
        found.push(relativePath);
      }
    }
  };

  for (const root of SOURCE_ROOTS) walk(root);
  return found;
}

/** Every module specifier in a file: static, `export … from`, and dynamic. */
function importSpecifiers(source: string): string[] {
  const found: string[] = [];
  const patterns = [
    /(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]/g,
    /import\(\s*['"]([^'"]+)['"]\s*\)/g,
    /require\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) found.push(match[1]);
  }
  return found;
}

/** Normalises a specifier to a repo-relative module key, or null for a package. */
function toModuleKey(specifier: string, fromFile: string): string | null {
  let resolved: string;
  if (specifier.startsWith('@/')) {
    resolved = specifier.slice(2);
  } else if (specifier.startsWith('.')) {
    resolved = path.posix.join(path.posix.dirname(fromFile), specifier);
  } else {
    return null;
  }
  return resolved.replace(/\.tsx?$/, '').replace(/\/index$/, '');
}

/** The key a recorded path compares against. */
function targetKey(recordPath: string): string {
  return recordPath.replace(/\.tsx?$/, '').replace(/\/index$/, '');
}

/**
 * Files that import the recorded module, excluding the module's own subtree.
 *
 * A directory target matches sub-module imports too: importing
 * `lib/resume-parser/helpers` reaches `lib/resume-parser`.
 */
function findImporters(recordPath: string): string[] {
  const target = targetKey(recordPath);
  const ownSubtree = (file: string) => file === recordPath || file.startsWith(`${target}/`);

  return allSourceFiles()
    .filter((file) => !ownSubtree(file))
    .filter((file) => {
      const source = readFileSync(resolveFromRepoRoot(file), 'utf8');
      return importSpecifiers(source).some((specifier) => {
        const key = toModuleKey(specifier, file);
        return key === target || key?.startsWith(`${target}/`);
      });
    })
    .sort();
}

describe('reachability', () => {
  it('records the five verified paths across all three classes', () => {
    const paths = REACHABILITY.map((record) => record.path);

    expect(new Set(paths).size).toBe(paths.length);
    for (const record of REACHABILITY) {
      expect(getReachability(record.path)?.path).toBe(record.path);
      expect(existsSync(resolveFromRepoRoot(record.path)), `missing: ${record.path}`).toBe(true);
      expect(record.evidence.length, record.path).toBeGreaterThan(40);
    }

    // All three classes must stay populated — collapsing any of them is the
    // failure mode this record exists to prevent.
    expect(listByReachability('orphan').length).toBeGreaterThan(0);
    expect(listByReachability('module-reachable-call-unused').length).toBeGreaterThan(0);
    expect(listByReachability('live').length).toBeGreaterThan(0);
    expect(getReachability('not/a/module')).toBeUndefined();
  });

  it('re-derives importedBy from the repository for every record', () => {
    for (const record of REACHABILITY) {
      expect(
        findImporters(record.path),
        `${record.path}: importedBy is stale — the repo disagrees with the record`
      ).toEqual([...record.importedBy].sort());
    }
  });

  it('keeps orphans unreachable and distinguishes transitive death', () => {
    for (const record of listByReachability('orphan')) {
      expect(record.entryChain, `${record.path}: an orphan cannot have an entry chain`).toEqual([]);

      for (const importer of record.importedBy) {
        // A non-empty importedBy on an orphan is only valid when every
        // importer is itself an orphan — that is what transitively dead means.
        expect(
          getReachability(importer)?.reachability,
          `${record.path} is an orphan but ${importer} imports it and is not recorded as an orphan`
        ).toBe('orphan');
      }
    }
  });

  it('keeps lib/resume-parser dead and services/resume-parser.service.ts live', () => {
    const library = getReachability('lib/resume-parser');
    const service = getReachability('services/resume-parser.service.ts');

    // The two differ by one path segment; conflating them is the false-orphan
    // report this pair of assertions exists to catch.
    expect(library?.reachability).toBe('orphan');
    expect(library?.importedBy).toEqual(['services/import/resume-openresume.service.ts']);
    expect(getReachability('services/import/resume-openresume.service.ts')?.reachability).toBe(
      'orphan'
    );

    expect(service?.reachability).toBe('live');
    expect(service?.importedBy).toContain('app/api/import/linkedin/route.ts');
  });

  it('pins the dead parser test count and keeps those tests off any feature', () => {
    const library = getReachability('lib/resume-parser');

    expect(library?.tests?.count).toBe(137);
    expect(library?.tests?.files).toHaveLength(8);
    for (const testFile of library?.tests?.files ?? []) {
      expect(existsSync(resolveFromRepoRoot(testFile)), `missing: ${testFile}`).toBe(true);
    }

    // Attaching these to a shipped feature would assert coverage of a parser
    // the product never calls.
    const claimedByFeatures = COVERAGE_MAP.flatMap((feature) => feature.unitTests);
    for (const testFile of library?.tests?.files ?? []) {
      expect(
        claimedByFeatures,
        `${testFile} covers dead code and must not be listed under a feature`
      ).not.toContain(testFile);
    }
  });

  it('keeps the barrel-reachable service out of the orphan class', () => {
    const record = getReachability('services/import/resume.service.ts');

    expect(record?.reachability).toBe('module-reachable-call-unused');
    expect(record?.importedBy).toEqual(['services/import/index.ts']);
    // The chain must start at a shipped entry point, or the class is wrong.
    expect(record?.entryChain[0]).toBe('app/api/import/links/route.ts');
    expect(record?.entryChain.at(-1)).toBe('services/import/resume.service.ts');

    // And that entry point must really import the barrel.
    expect(findImporters('services/import/index.ts')).toContain('app/api/import/links/route.ts');
  });

  it('gives every non-orphan class a chain that starts in app/', () => {
    for (const record of REACHABILITY) {
      if (record.reachability === 'orphan') continue;
      expect(record.entryChain.length, `${record.path} needs an entry chain`).toBeGreaterThan(1);
      expect(record.entryChain[0], `${record.path}: chain must start at a route or page`).toMatch(
        /^app\//
      );
      expect(record.entryChain.at(-1)).toBe(record.path);
    }
  });
});
