/**
 * Coverage map invariants (PLATFORM_TODO item 1).
 *
 * The map is the Developer Platform's source of truth, and the drift scan will
 * read it to decide what is missing. A stale path here becomes a false drift
 * report there, so every path is checked against the filesystem and every
 * pathway against the real Live QA catalog.
 *
 * Imports `live-qa/catalog` directly rather than the developer barrel: the
 * barrel reaches `health.ts` → `lib/db` → a generated Prisma client, which this
 * test has no reason to load.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { LIVE_QA_PATHWAYS } from '@/_admin-panel/modules/developer/live-qa/catalog';
import {
  COVERAGE_MAP,
  FEATURE_CATEGORIES,
  getFeature,
  listFeatures,
} from '@/_admin-panel/platform/coverage-map';

/** The five features item 1 seeds. Item 2 extends this; update it there. */
const SEED_IDS = [
  'resume-import-ai',
  'resume-builder',
  'resume-share-visibility',
  'cover-letter',
  'public-follio',
];

function resolveFromRepoRoot(relativePath: string): string {
  return path.join(process.cwd(), relativePath);
}

describe('coverage map', () => {
  it('seeds exactly the five item-1 features with unique ids', () => {
    const ids = COVERAGE_MAP.map((feature) => feature.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...SEED_IDS].sort());
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
  });
});
