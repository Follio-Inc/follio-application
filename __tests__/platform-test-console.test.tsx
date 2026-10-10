/**
 * Test Console: the read-only, map-derived inventory (PLATFORM_TODO item 11).
 *
 * Item 11's done condition is that **every** test file and **every** pathway
 * appears under a map-derived category, and that an uncategorized test is shown
 * as such rather than hidden. So the central assertions here are coverage
 * assertions: walk `__tests__` independently, render the console, and check
 * nothing is missing from the page.
 *
 * The rest guard the two things that would quietly make this page a lie — a
 * count that was typed in rather than measured, and a status that was invented.
 * Both are tested against the rendered markup, and the no-numbers checks are
 * also run against a synthetic map so a baked-in baseline cannot pass.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LIVE_QA_PATHWAYS } from '@/_admin-panel/modules/developer/live-qa/catalog';
import type { LiveQaPathway } from '@/_admin-panel/modules/developer/live-qa/types';
import {
  COVERAGE_MAP,
  FEATURE_CATEGORIES,
  REACHABILITY,
} from '@/_admin-panel/platform/coverage-map';
import type {
  FeatureCategory,
  PlatformFeature,
  ReachabilityRecord,
} from '@/_admin-panel/platform/coverage-map';
import { buildTestInventory } from '@/_admin-panel/platform/tests';
import { TestConsole } from '@/_admin-panel/platform/ui';

const TESTS_PAGE = 'app/admin/(dashboard)/platform/tests/page.tsx';
const CONSOLE_COMPONENT = '_admin-panel/platform/ui/test-console.tsx';

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

/**
 * Every Vitest file under `__tests__`, re-derived here.
 *
 * A second implementation on purpose, as in the item-3 and item-8a tests: the
 * console must list what is actually on disk, so comparing it against a walk
 * this file owns is what makes "all test files appear" a real claim rather
 * than a restatement of the same code.
 */
function everyTestFileOnDisk(root = '__tests__'): string[] {
  const found: string[] = [];

  const walk = (relativeDir: string): void => {
    for (const entry of readdirSync(path.join(process.cwd(), relativeDir), {
      withFileTypes: true,
    })) {
      const relativePath = `${relativeDir}/${entry.name}`;
      if (entry.isDirectory()) walk(relativePath);
      else if (/\.test\.tsx?$/.test(entry.name)) found.push(relativePath);
    }
  };

  walk(root);
  return found.sort();
}

function feature(overrides: Partial<PlatformFeature>): PlatformFeature {
  return {
    id: 'stub',
    name: 'Stub',
    userDescription: 'A stub feature used to exercise the test console in isolation.',
    codeLocations: ['lib/utils.ts'],
    category: 'Builder',
    status: 'shipped',
    unitTests: [],
    pathways: [],
    ...overrides,
  };
}

function pathway(overrides: Partial<LiveQaPathway>): LiveQaPathway {
  return {
    id: 'stub.pathway',
    title: 'Stub pathway',
    description: 'A stub pathway.',
    area: 'Public',
    spec: 'pathways/public-landing.spec.ts',
    requiresAuth: false,
    fixtureKind: 'none',
    stability: 'stable',
    intents: ['Open `/`'],
    tags: ['smoke'],
    ...overrides,
  };
}

function record(overrides: Partial<ReachabilityRecord>): ReachabilityRecord {
  return {
    path: 'lib/stub',
    reachability: 'orphan',
    importedBy: [],
    entryChain: [],
    evidence: 'A stub record long enough to pass the coverage-map evidence check in item 3.',
    ...overrides,
  };
}

describe('the Tests route is no longer a placeholder', () => {
  it('renders the console instead of the empty-section component', () => {
    const source = read(TESTS_PAGE);

    expect(source).toContain('TestConsole');
    expect(source).toContain('buildTestInventory');
    expect(source).not.toContain('PlatformSectionPlaceholder');
    // Still a thin shim with the existing guard.
    expect(source).toMatch(/await requireAdmin\(\)/);
    expect(source).not.toMatch(/className=/);
  });

  it('builds the inventory on the server and passes it down as data', () => {
    // The walk happens in the route, not in the component, which is what keeps
    // the filesystem out of anything that could be bundled for a browser.
    expect(read(TESTS_PAGE)).toMatch(/inventory=\{buildTestInventory\(\)\}/);
    expect(read(CONSOLE_COMPONENT)).not.toMatch(/from '[^']*platform\/scan/);
    expect(read(CONSOLE_COMPONENT)).not.toMatch(/from 'node:/);
    expect(read(CONSOLE_COMPONENT)).not.toMatch(/readFileSync\(|readdirSync\(/);
    // Types only, so the import is erased.
    expect(read(CONSOLE_COMPONENT)).toMatch(/import type \{[\s\S]*?\} from '\.\.\/tests\/types'/);
  });
});

describe('the inventory comes from the coverage map', () => {
  const inventory = buildTestInventory();

  it('takes its categories, and their order, from the map', () => {
    expect(inventory.categories.map((entry) => entry.category)).toEqual([...FEATURE_CATEGORIES]);
    expect(inventory.summary.categories).toBe(FEATURE_CATEGORIES.length);
  });

  it('places every feature under its own category exactly once', () => {
    const placed = inventory.categories.flatMap((entry) =>
      entry.features.map((item) => ({ id: item.id, category: entry.category }))
    );

    expect(placed).toHaveLength(COVERAGE_MAP.length);
    for (const item of placed) {
      const mapped = COVERAGE_MAP.find((entry) => entry.id === item.id);
      expect(mapped?.category, `${item.id} is under the wrong category`).toBe(item.category);
    }
    expect(inventory.summary.features).toBe(COVERAGE_MAP.length);
  });

  it('lists exactly the unit tests the map lists, per feature', () => {
    for (const entry of inventory.categories.flatMap((item) => item.features)) {
      const mapped = COVERAGE_MAP.find((item) => item.id === entry.id)!;

      expect(entry.unitTests.map((test) => test.path)).toEqual(
        [...mapped.unitTests].sort((a, b) => a.localeCompare(b))
      );
      expect(entry.name).toBe(mapped.name);
      expect(entry.status).toBe(mapped.status);
    }
  });

  it('lists exactly the pathways the map claims, from the real catalog', () => {
    const catalogIds = new Set(LIVE_QA_PATHWAYS.map((entry) => entry.id));

    for (const entry of inventory.categories.flatMap((item) => item.features)) {
      const mapped = COVERAGE_MAP.find((item) => item.id === entry.id)!;

      expect(entry.pathways.map((item) => item.id)).toEqual(
        [...mapped.pathways].sort((a, b) => a.localeCompare(b))
      );
      for (const item of entry.pathways) {
        expect(catalogIds, `${item.id} is not in the catalog`).toContain(item.id);
        expect(item.title.length).toBeGreaterThan(0);
      }
    }
  });

  it('accounts for every test file on disk, exactly once', () => {
    // Item 11's done condition, first half.
    const onDisk = everyTestFileOnDisk();
    const attributed = new Set(
      inventory.categories.flatMap((entry) =>
        entry.features.flatMap((item) => item.unitTests.map((test) => test.path))
      )
    );
    const unattributed = inventory.unattributed.map((entry) => entry.path);

    expect([...attributed, ...unattributed].sort()).toEqual(onDisk);
    // Disjoint: a file is either under a feature or shown as unattributed.
    for (const entry of unattributed) expect(attributed).not.toContain(entry);
    expect(inventory.summary.testFiles).toBe(onDisk.length);
    expect(inventory.summary.attributedTestFiles + inventory.summary.unattributedTestFiles).toBe(
      onDisk.length
    );
  });

  it('accounts for every catalog pathway', () => {
    // Item 11's done condition, second half.
    const shown = new Set([
      ...inventory.categories.flatMap((entry) =>
        entry.features.flatMap((item) => item.pathways.map((p) => p.id))
      ),
      ...inventory.unclaimedPathways.map((entry) => entry.id),
    ]);

    expect([...shown].sort()).toEqual(LIVE_QA_PATHWAYS.map((entry) => entry.id).sort());
    expect(inventory.summary.pathways).toBe(LIVE_QA_PATHWAYS.length);
  });

  it('keeps a shared test under every feature that claims it', () => {
    const shared = inventory.categories
      .flatMap((entry) => entry.features)
      .flatMap((item) => item.unitTests)
      .filter((test) => test.shared);

    // There is at least one today, and ownership is not resolved to a winner.
    expect(shared.length).toBeGreaterThan(0);
    for (const test of shared) {
      expect(test.listedBy.length).toBeGreaterThan(1);
      for (const owner of test.listedBy) {
        const owning = COVERAGE_MAP.find((entry) => entry.id === owner);
        expect(owning?.unitTests, `${owner} does not list ${test.path}`).toContain(test.path);
      }
    }
  });

  it('names the reason a test sits under no feature, from map data', () => {
    const recorded = new Set(REACHABILITY.flatMap((entry) => entry.tests?.files ?? []));

    for (const entry of inventory.unattributed) {
      if (entry.reason === 'covers-unreachable-code') {
        expect(recorded, `${entry.path} is not recorded as covering dead code`).toContain(
          entry.path
        );
        expect(entry.recordedAgainst).toBeTruthy();
      } else {
        expect(entry.reason).toBe('no-feature-listed');
        expect(recorded).not.toContain(entry.path);
      }
    }
    // Both buckets are populated on this tree, so neither branch is untested.
    expect(new Set(inventory.unattributed.map((entry) => entry.reason)).size).toBe(2);
  });

  it('reports no contradiction on the current tree', () => {
    expect(inventory.missingTestFiles).toEqual([]);
    expect(inventory.unclaimedPathways).toEqual([]);
  });

  it('builds an identical inventory on a second run', () => {
    expect(buildTestInventory()).toEqual(inventory);
  });
});

describe('the inventory follows its input, not a baseline', () => {
  const categories: FeatureCategory[] = ['AI', 'Builder', 'Export'];

  it('derives every count from the data it was given', () => {
    const inventory = buildTestInventory({
      categories,
      features: [
        feature({ id: 'one', category: 'AI', unitTests: ['a.test.ts', 'shared.test.ts'] }),
        feature({ id: 'two', category: 'AI', unitTests: ['shared.test.ts'] }),
        feature({ id: 'three', category: 'Builder' }),
      ],
      pathways: [pathway({ id: 'x.one' })],
      reachability: [],
      testFiles: ['a.test.ts', 'shared.test.ts', 'loose.test.ts'],
    });

    expect(inventory.summary).toEqual({
      categories: 3,
      features: 3,
      testFiles: 3,
      attributedTestFiles: 2,
      unattributedTestFiles: 1,
      // Three listings over two distinct files: `shared.test.ts` twice.
      featureAssignments: 3,
      sharedTestFiles: 1,
      pathways: 1,
      claimedPathways: 0,
      featuresWithoutUnitTests: 1,
    });
    expect(inventory.unattributed).toEqual([
      { path: 'loose.test.ts', reason: 'no-feature-listed' },
    ]);
    // A category nobody uses is still listed, and says so when rendered.
    expect(inventory.categories.find((entry) => entry.category === 'Export')?.features).toEqual([]);
  });

  it('reports a pathway no feature claims', () => {
    const inventory = buildTestInventory({
      categories,
      features: [feature({ id: 'one', category: 'AI', pathways: ['x.one'] })],
      pathways: [pathway({ id: 'x.one' }), pathway({ id: 'x.two' })],
      reachability: [],
      testFiles: [],
    });

    expect(inventory.unclaimedPathways.map((entry) => entry.id)).toEqual(['x.two']);
    expect(inventory.summary.claimedPathways).toBe(1);
  });

  it('reports a file a feature lists that is not on disk', () => {
    const inventory = buildTestInventory({
      categories,
      features: [feature({ id: 'one', category: 'AI', unitTests: ['gone.test.ts'] })],
      pathways: [],
      reachability: [],
      testFiles: [],
    });

    expect(inventory.missingTestFiles.map((entry) => entry.path)).toEqual(['gone.test.ts']);
    expect(inventory.missingTestFiles[0].listedBy).toEqual(['one']);
  });

  it('takes the unreachable-code reason from the records it was given', () => {
    const inventory = buildTestInventory({
      categories,
      features: [feature({ id: 'one', category: 'AI' })],
      pathways: [],
      reachability: [record({ path: 'lib/zebra', tests: { files: ['zebra.test.ts'], count: 3 } })],
      testFiles: ['zebra.test.ts', 'other.test.ts'],
    });

    expect(inventory.unattributed).toEqual([
      { path: 'zebra.test.ts', reason: 'covers-unreachable-code', recordedAgainst: 'lib/zebra' },
      { path: 'other.test.ts', reason: 'no-feature-listed' },
    ]);
  });

  it('is order-independent across features and test files', () => {
    const features = [
      feature({ id: 'zulu', category: 'AI', unitTests: ['b.test.ts'] }),
      feature({ id: 'alpha', category: 'AI', unitTests: ['a.test.ts'] }),
    ];
    const testFiles = ['b.test.ts', 'a.test.ts'];

    const forward = buildTestInventory({
      categories,
      features,
      testFiles,
      pathways: [],
      reachability: [],
    });
    const reversed = buildTestInventory({
      categories,
      features,
      testFiles: [...testFiles].reverse(),
      pathways: [],
      reachability: [],
    });

    // Feature order is the map's and is preserved; file order never leaks in.
    expect(forward.categories[0].features.map((entry) => entry.id)).toEqual(['zulu', 'alpha']);
    expect(reversed).toEqual(forward);
  });
});

describe('the console renders the whole inventory', () => {
  const inventory = buildTestInventory();
  const html = renderToStaticMarkup(<TestConsole inventory={inventory} />);
  const text = html.replace(/<[^>]*>/g, ' ');

  it('shows every test file on disk somewhere on the page', () => {
    // The done condition, asserted against the markup rather than the data.
    for (const testFile of everyTestFileOnDisk()) {
      expect(html, `${testFile} is missing from the console`).toContain(testFile);
    }
  });

  it('shows every category and every feature', () => {
    for (const category of FEATURE_CATEGORIES) {
      expect(html, `${category} is missing`).toContain(category);
    }
    for (const entry of COVERAGE_MAP) {
      expect(html, `${entry.id} is missing`).toContain(entry.id);
      expect(html, `${entry.name} is missing`).toContain(entry.name);
    }
  });

  it('shows every pathway with its catalog detail', () => {
    for (const entry of LIVE_QA_PATHWAYS) {
      expect(html, `${entry.id} is missing`).toContain(entry.id);
      expect(html, `${entry.title} is missing`).toContain(entry.title);
    }
  });

  it('shows unattributed tests rather than hiding them', () => {
    expect(html).toContain('Under no feature');
    for (const entry of inventory.unattributed) {
      expect(html, `${entry.path} is hidden`).toContain(entry.path);
    }
    // Each bucket is labelled with why, not just dumped.
    expect(text).toContain('Covers code nothing reaches');
    expect(text).toContain('Listed under no feature');
  });

  it('gives a feature with no unit tests an honest empty state', () => {
    const bare = COVERAGE_MAP.filter((entry) => entry.unitTests.length === 0);
    expect(bare.length).toBeGreaterThan(0);

    expect(text).toContain('No unit tests mapped');
    // Said once per feature that has none — never as a zero that could read as
    // a result.
    expect(text.split('No unit tests mapped').length - 1).toBe(bare.length);
  });

  it('renders counts that match the data it was given', () => {
    const { summary } = inventory;

    for (const value of [
      summary.categories,
      summary.features,
      summary.testFiles,
      summary.attributedTestFiles,
      summary.unattributedTestFiles,
      summary.pathways,
    ]) {
      expect(html, `${value} is not rendered`).toContain(`>${value}<`);
    }
    // And it explains the gap between listings and distinct files instead of
    // printing one number that double-counts.
    expect(summary.featureAssignments).toBeGreaterThan(summary.attributedTestFiles);
    expect(text).toContain(`${summary.featureAssignments} assignments`);
  });

  it('hardcodes no count in the component', () => {
    const source = read(CONSOLE_COMPONENT);

    // Every number on the page has to come through the prop. The only digits
    // allowed in the source are the ones in class names.
    expect(source).not.toMatch(/\b\d+\s*(test files|features|pathways|categories)\b/i);
    expect(source).not.toMatch(/\d+\s*(passing|passed|failing|failed)\b/i);
  });

  it('invents no result, duration or verdict', () => {
    expect(text).not.toMatch(/\b(passed|passing|failed|failing|flaky|skipped)\b/i);
    expect(text).not.toMatch(/\b\d+\s*m?s\b/);
    expect(text).not.toMatch(/last run|duration|coverage %|\bpass rate\b/i);
  });

  it('offers no way to run anything', () => {
    // Item 12 adds execution. A disabled control now would imply otherwise.
    for (const control of ['<button', '<input', '<form', '<select', 'type="checkbox"']) {
      expect(html, `${control} should not be on a read-only page`).not.toContain(control);
    }
    expect(read(CONSOLE_COMPONENT)).not.toMatch(/onClick|onSubmit|'use client'/);
  });

  it('renders an empty category honestly instead of dropping it', () => {
    const empty = renderToStaticMarkup(
      <TestConsole
        inventory={buildTestInventory({
          categories: ['Export'],
          features: [],
          pathways: [],
          reachability: [],
          testFiles: [],
        })}
      />
    );

    expect(empty).toContain('Export');
    expect(empty.replace(/<[^>]*>/g, ' ')).toContain('No feature uses this category');
  });
});

describe('the old developer panel is still untouched', () => {
  it('keeps its own route and modules', () => {
    for (const modulePath of [
      'app/admin/(dashboard)/developer/page.tsx',
      '_admin-panel/modules/developer/ui/DevtoolsPanel.tsx',
      '_admin-panel/modules/developer/suites.ts',
      '_admin-panel/modules/developer/suites-catalog.ts',
    ]) {
      expect(existsSync(path.join(process.cwd(), modulePath)), modulePath).toBe(true);
    }

    const developer = read('app/admin/(dashboard)/developer/page.tsx');
    expect(developer).toContain('DevtoolsPanel');
    // Item 11 did not reach into the old surface to build the new console.
    expect(developer).not.toContain('TestConsole');
    expect(developer).not.toContain('buildTestInventory');
  });
});
