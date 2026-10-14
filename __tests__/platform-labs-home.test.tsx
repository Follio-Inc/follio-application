/**
 * Labs home: features and lab status from the map (PLATFORM_TODO item 20).
 *
 * Item 20 has no `_Done when_` clause; its line is the requirement. So the
 * assertions here are about one invariant above all others: **a declared lab
 * is not a lab.** `PlatformFeature.lab` has named an intended workbench since
 * item 2, and no lab module exists until item 21 — a page that showed that as
 * available, or linked a route that is not routed, would be the first thing in
 * this platform to claim something it cannot show.
 *
 * Everything the page says about a feature comes from the coverage map. The
 * implementation registry contributes exactly one fact per lab — does it exist,
 * and where — so the two cannot disagree about a name, a category or a status.
 *
 * Synthetic maps and registries drive the states the real repository does not
 * have yet (an available lab, a duplicate id, an unknown implementation); the
 * last block runs against the real map and reports what is actually there.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { COVERAGE_MAP, FEATURE_CATEGORIES } from '@/_admin-panel/platform/coverage-map';
import type { PlatformFeature } from '@/_admin-panel/platform/coverage-map';
import {
  buildLabsView,
  findLabImplementation,
  IMPLEMENTED_LABS,
  LABS_ROOT,
  labStatusFor,
} from '@/_admin-panel/platform/labs';
import type { LabImplementation, LabsView } from '@/_admin-panel/platform/labs';
import { getPlatformSection, listPlatformTools } from '@/_admin-panel/platform/nav';
import { LabsHome } from '@/_admin-panel/platform/ui';

const LABS_PAGE = 'app/admin/(dashboard)/platform/labs/page.tsx';
const VIEW = '_admin-panel/platform/labs/view.ts';
const REGISTRY = '_admin-panel/platform/labs/registry.ts';
const TYPES = '_admin-panel/platform/labs/types.ts';
const COMPONENT = '_admin-panel/platform/ui/labs-home.tsx';
const PLATFORM_API_DIR = ['app', 'api', 'admin', 'platform'].join(path.sep);

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&rsquo;|&#8217;/g, '’')
    .replace(/&ndash;/g, '–')
    .replace(/\s+/g, ' ');
}

function feature(overrides: Partial<PlatformFeature>): PlatformFeature {
  return {
    id: 'zebra',
    name: 'Zebra',
    userDescription: 'Does the zebra thing for a person who needs it.',
    codeLocations: ['lib/utils.ts'],
    category: 'Builder',
    status: 'shipped',
    unitTests: [],
    pathways: [],
    ...overrides,
  };
}

const LAB: LabImplementation = { id: 'zebra-lab', route: `${LABS_ROOT}/zebra` };

function viewOf(features: PlatformFeature[], labs: LabImplementation[] = []): LabsView {
  return buildLabsView({ features, labs });
}

describe('the status model', () => {
  it('calls a feature with no `lab` none', () => {
    expect(labStatusFor(feature({}), [])).toBe('none');
    expect(labStatusFor({ lab: undefined }, [LAB])).toBe('none');
    expect(labStatusFor({ lab: '' }, [LAB])).toBe('none');
  });

  it('calls a declared lab with no implementation planned', () => {
    // The whole point of the item: the map naming one is a statement of
    // intent, and the page must not read it as an implementation.
    expect(labStatusFor({ lab: 'zebra-lab' }, [])).toBe('planned');
    expect(labStatusFor({ lab: 'zebra-lab' }, [{ id: 'other', route: `${LABS_ROOT}/other` }])).toBe(
      'planned'
    );
  });

  it('calls a declared lab with an implementation available', () => {
    expect(labStatusFor({ lab: 'zebra-lab' }, [LAB])).toBe('available');
    expect(findLabImplementation('zebra-lab', [LAB])).toEqual(LAB);
    expect(findLabImplementation('nope', [LAB])).toBeNull();
  });
});

describe('the view comes from the coverage map', () => {
  const features = [
    feature({ id: 'alpha', name: 'Alpha', category: 'AI', status: 'shipped', lab: 'zebra-lab' }),
    feature({ id: 'beta', name: 'Beta', category: 'AI', status: 'flagged', lab: 'planned-lab' }),
    feature({ id: 'gamma', name: 'Gamma', category: 'Builder', status: 'shipped' }),
  ];
  const view = viewOf(features, [LAB]);

  it('lists every feature exactly once', () => {
    const listed = view.categories.flatMap((entry) => entry.features.map((item) => item.id));

    expect(listed.sort()).toEqual(['alpha', 'beta', 'gamma']);
    expect(new Set(listed).size).toBe(listed.length);
    expect(view.summary.features).toBe(features.length);
  });

  it('takes the name, category, status and description from the map', () => {
    const alpha = view.categories
      .flatMap((entry) => entry.features)
      .find((item) => item.id === 'alpha')!;

    expect(alpha.name).toBe('Alpha');
    expect(alpha.category).toBe('AI');
    expect(alpha.featureStatus).toBe('shipped');
    expect(alpha.userDescription).toBe(features[0].userDescription);
    // The registry contributes one fact, and the status is the only thing it
    // decides.
    expect(alpha.labId).toBe('zebra-lab');
    expect(alpha.status).toBe('available');
    expect(alpha.route).toBe(`${LABS_ROOT}/zebra`);
  });

  it('gives a planned lab no route at all', () => {
    const beta = view.categories
      .flatMap((entry) => entry.features)
      .find((item) => item.id === 'beta')!;

    expect(beta.labId).toBe('planned-lab');
    expect(beta.status).toBe('planned');
    // Null by construction, so no renderer can link it by mistake.
    expect(beta.route).toBeNull();
  });

  it('counts what it lists', () => {
    const listed = view.categories.flatMap((entry) => entry.features);

    expect(view.summary).toEqual({
      features: 3,
      withLab: 2,
      available: 1,
      planned: 1,
      none: 1,
    });
    expect(view.summary.available + view.summary.planned + view.summary.none).toBe(listed.length);
    expect(view.summary.withLab).toBe(listed.filter((item) => item.labId !== null).length);
  });

  it('orders categories by the map’s own union, and features by id', () => {
    const full = viewOf(features);

    expect(full.categories.map((entry) => entry.category)).toEqual([...FEATURE_CATEGORIES]);
    expect(
      full.categories.find((entry) => entry.category === 'AI')!.features.map((f) => f.id)
    ).toEqual(['alpha', 'beta']);
    // Same input, same output.
    expect(buildLabsView({ features, labs: [LAB] })).toEqual(view);
  });

  it('keeps an empty category rather than dropping it', () => {
    const only = viewOf([feature({ id: 'alpha', category: 'AI' })]);
    const empty = only.categories.find((entry) => entry.category === 'Export')!;

    expect(empty.features).toEqual([]);
    expect(textOf(renderToStaticMarkup(<LabsHome view={only} />))).toContain(
      'No feature uses this category'
    );
  });

  it('does not lose a feature whose category is outside the union', () => {
    const odd = viewOf([
      feature({ id: 'stray', category: 'Nowhere' as PlatformFeature['category'] }),
    ]);
    const listed = odd.categories.flatMap((entry) => entry.features.map((item) => item.id));

    expect(listed).toContain('stray');
    expect(odd.summary.features).toBe(1);
  });
});

describe('the registry keeps to its one job', () => {
  it('carries availability only, never feature metadata', () => {
    const source = read(REGISTRY);

    // A second copy of a feature's name or category could disagree with the
    // map, and then the page would have two answers.
    for (const field of ['name:', 'category:', 'status:', 'userDescription:', 'codeLocations']) {
      expect(source, `${field} belongs to the coverage map`).not.toContain(field);
    }
    for (const lab of IMPLEMENTED_LABS) {
      expect(Object.keys(lab).sort()).toEqual(['id', 'route']);
    }
  });

  it('holds only labs that are really routed', () => {
    // Item 21 added the first entry, in the same commit that routed it. The
    // invariant the registry exists for: an entry means a page you can open.
    for (const lab of IMPLEMENTED_LABS) {
      // `/admin/platform/…` is served from `app/admin/(dashboard)/platform/…`,
      // so the route's own `/admin` prefix comes off before the join.
      const page = path.join(
        process.cwd(),
        'app/admin/(dashboard)',
        lab.route.replace(/^\/admin/, ''),
        'page.tsx'
      );
      expect(existsSync(page), `${lab.id} is registered at ${lab.route} with no page there`).toBe(
        true
      );
      expect(COVERAGE_MAP.map((entry) => entry.lab)).toContain(lab.id);
      expect(lab.route.startsWith(`${LABS_ROOT}/`)).toBe(true);
    }
    expect(new Set(IMPLEMENTED_LABS.map((lab) => lab.id)).size).toBe(IMPLEMENTED_LABS.length);
    expect(new Set(IMPLEMENTED_LABS.map((lab) => lab.route)).size).toBe(IMPLEMENTED_LABS.length);
  });

  it('reports a duplicate lab id rather than picking an owner', () => {
    const view = viewOf([
      feature({ id: 'alpha', lab: 'shared-lab' }),
      feature({ id: 'beta', lab: 'shared-lab' }),
    ]);

    expect(view.problems.map((problem) => problem.kind)).toEqual(['duplicate-lab-id']);
    expect(view.problems[0].detail).toContain('alpha, beta');
    expect(textOf(renderToStaticMarkup(<LabsHome view={view} />))).toContain(
      'The map and the registry disagree (1)'
    );
  });

  it('reports a duplicate route', () => {
    const view = viewOf(
      [feature({ id: 'alpha', lab: 'a' }), feature({ id: 'beta', lab: 'b' })],
      [
        { id: 'a', route: `${LABS_ROOT}/same` },
        { id: 'b', route: `${LABS_ROOT}/same` },
      ]
    );

    expect(view.problems.map((problem) => problem.kind)).toEqual(['duplicate-route']);
  });

  it('reports an implementation no feature declares', () => {
    const view = viewOf([feature({ id: 'alpha' })], [LAB]);

    expect(view.problems.map((problem) => problem.kind)).toEqual(['unknown-lab-id']);
    expect(view.problems[0].detail).toContain('nothing says what it is for');
    // And it invents no owner for it.
    expect(view.summary.withLab).toBe(0);
    expect(view.summary.available).toBe(0);
  });

  it('reports a route outside the labs section', () => {
    const view = viewOf(
      [feature({ id: 'alpha', lab: 'a' })],
      [{ id: 'a', route: '/admin/developer' }]
    );

    expect(view.problems.map((problem) => problem.kind)).toEqual(['route-outside-labs']);
  });

  it('finds nothing wrong with the real map and registry', () => {
    expect(buildLabsView().problems).toEqual([]);
  });
});

describe('the page', () => {
  it('renders a planned lab as planned, with no link', () => {
    const view = viewOf([feature({ id: 'alpha', name: 'Alpha', lab: 'alpha-lab' })]);
    const html = renderToStaticMarkup(<LabsHome view={view} />);
    const text = textOf(html);

    expect(text).toContain('Lab planned');
    expect(text).toContain('alpha-lab');
    expect(text).toContain('nothing implements it yet');
    // The only thing that matters: no anchor to a route that does not exist.
    expect(html).not.toContain('<a');
    expect(html).not.toContain('href=');
  });

  it('links an available lab, and only to its registered route', () => {
    const view = viewOf([feature({ id: 'alpha', lab: 'zebra-lab' })], [LAB]);
    const html = renderToStaticMarkup(<LabsHome view={view} />);

    expect(html).toContain(`href="${LABS_ROOT}/zebra"`);
    expect(textOf(html)).toContain('Open the zebra-lab lab');
    // Every anchor on the page is a registered route.
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    expect(hrefs).toEqual([LAB.route]);
  });

  it('says plainly when a feature has no lab', () => {
    const text = textOf(renderToStaticMarkup(<LabsHome view={viewOf([feature({})])} />));

    expect(text).toContain('No lab declared');
    expect(text).toContain('Not a gap');
  });

  it('shows the summary and what it means when nothing is built', () => {
    const view = viewOf([feature({ id: 'alpha', lab: 'alpha-lab' }), feature({ id: 'beta' })]);
    const text = textOf(renderToStaticMarkup(<LabsHome view={view} />));

    expect(text).toContain('No lab is built yet');
    expect(text).toContain('items 21–24');
    expect(text).toContain('Features');
    expect(text).toContain('Labs declared');
  });

  it('offers nothing to run, upload or change', () => {
    const html = renderToStaticMarkup(
      <LabsHome
        view={viewOf([feature({ id: 'alpha', lab: 'a' })], [{ id: 'a', route: `${LABS_ROOT}/a` }])}
      />
    );
    const source = read(COMPONENT);

    for (const control of ['<button', '<input', '<form', '<select', '<textarea']) {
      expect(html, `${control} belongs to item 21 at the earliest`).not.toContain(control);
    }
    expect(source).not.toMatch(/'use client'|'use server'|onClick|onSubmit|useState|fetch\(/);
    expect(textOf(html)).toContain('Nothing on this page uploads a file, runs a pipeline');
  });

  it('is a thin, server-rendered shim behind admin auth', () => {
    const page = read(LABS_PAGE);

    expect(page).toMatch(/await requireAdmin\(\)/);
    expect(page).toContain('buildLabsView()');
    expect(page).toContain('LabsHome');
    expect(page).not.toContain('PlatformSectionPlaceholder');
    expect(page).toContain("dynamic = 'force-dynamic'");
    // No markup, no logic, no client bundle.
    expect(page).not.toMatch(/className=|\.map\(|\.filter\(|'use client'/);
  });
});

describe('item 20 builds no lab and touches nothing else', () => {
  it('needs no endpoint of its own', () => {
    expect(existsSync(path.join(process.cwd(), PLATFORM_API_DIR))).toBe(true);

    // The index is derived from typed data during the page's own render, so
    // nothing under the platform's API surface reaches it. A *lab* may have a
    // run endpoint — item 21's does — but the home does not.
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]
      );

    for (const file of walk(path.join(process.cwd(), PLATFORM_API_DIR))) {
      expect(readFileSync(file, 'utf8'), `${file} must not render the index`).not.toMatch(
        /buildLabsView|LabsHome/
      );
    }
  });

  it('keeps the pipeline out of the index itself', () => {
    // Item 21 built the Resume Lab in its own module. The index still only
    // reads the map and the registry: it runs nothing.
    for (const file of [VIEW, REGISTRY, TYPES, COMPONENT]) {
      expect(read(file), `${file} must not run a pipeline`).not.toMatch(
        /extractTextFromPDF|runResumeParseAgent|importResumeWithAI|openai|MAX_TOKENS/i
      );
    }
  });

  it('reads nothing and writes nothing', () => {
    for (const file of [VIEW, REGISTRY, TYPES, COMPONENT]) {
      const source = read(file);

      expect(source, `${file} must not reach the filesystem`).not.toMatch(/from 'node:/);
      expect(source).not.toMatch(/readFileSync|writeFileSync|rmSync|renameSync|child_process/);
      expect(source).not.toMatch(/prisma|@\/lib\/db/i);
    }
  });

  it('builds no second feature catalogue', () => {
    const source = read(VIEW);

    // Every feature fact is read from the map that was passed in.
    expect(source).toContain("from '../coverage-map'");
    expect(source).not.toMatch(/name: '|userDescription: '|featureStatus: '/);

    // The one category literal is the bucket for a feature whose category is
    // outside the map's union — not a copy of a category the map declares.
    const literals = [...source.matchAll(/category: '([^']+)'/g)].map((match) => match[1]);
    expect(literals).toEqual(['Uncategorised']);
    expect([...FEATURE_CATEGORIES]).not.toContain('Uncategorised');
  });

  it('leaves the other sections and the old panel alone', () => {
    for (const file of [
      'app/admin/(dashboard)/platform/tests/page.tsx',
      'app/admin/(dashboard)/platform/drift/page.tsx',
      'app/admin/(dashboard)/developer/page.tsx',
      '_admin-panel/modules/developer/ui/DevtoolsPanel.tsx',
    ]) {
      expect(existsSync(path.join(process.cwd(), file)), file).toBe(true);
      expect(read(file), `${file} must not know about labs`).not.toMatch(/platform\/labs|LabsHome/);
    }
  });

  it('marks the section built, and keeps the placeholder for the next one', () => {
    expect(getPlatformSection('labs')?.status).toBe('available');
    for (const section of listPlatformTools()) {
      expect(section.status, section.id).toBe('available');
    }
    // Still exported and still honest; nothing routes it today.
    expect(
      existsSync(path.join(process.cwd(), '_admin-panel/platform/ui/platform-section.tsx'))
    ).toBe(true);
  });
});

describe('the real coverage map', () => {
  const view = buildLabsView();
  const html = renderToStaticMarkup(<LabsHome view={view} />);
  const text = textOf(html);

  it('lists every feature in the map, once', () => {
    const listed = view.categories.flatMap((entry) => entry.features.map((item) => item.id));

    expect(listed.sort()).toEqual(COVERAGE_MAP.map((entry) => entry.id).sort());
    expect(view.summary.features).toBe(COVERAGE_MAP.length);
  });

  it('counts the declared labs the map actually has', () => {
    const declared = COVERAGE_MAP.filter((entry) => entry.lab !== undefined);

    // Relational, not a baseline: the map decides these numbers.
    expect(view.summary.withLab).toBe(declared.length);
    expect(view.summary.available).toBe(IMPLEMENTED_LABS.length);
    expect(view.summary.planned).toBe(declared.length - IMPLEMENTED_LABS.length);
    expect(view.summary.none).toBe(COVERAGE_MAP.length - declared.length);
  });

  it('shows a built lab as available and links it, a declared one as planned', () => {
    const built = new Set(IMPLEMENTED_LABS.map((lab) => lab.id));
    const listed = view.categories.flatMap((entry) => entry.features);

    for (const item of listed.filter((entry) => entry.labId !== null)) {
      const isBuilt = built.has(item.labId!);
      expect(item.status, item.id).toBe(isBuilt ? 'available' : 'planned');
      // A link exists only where a route does. This is the invariant item 20
      // exists for, and item 21 is the first case where it is non-trivial.
      expect(item.route === null, item.id).toBe(!isBuilt);
      if (isBuilt) expect(html).toContain(`href="${item.route}"`);
      expect(text).toContain(item.labId!);
    }

    // Every anchor on the page is a route the registry registered.
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    for (const href of hrefs) {
      expect(
        IMPLEMENTED_LABS.map((lab) => lab.route),
        `${href} is not registered`
      ).toContain(href);
    }
  });

  it('renders every category and every feature name from the map', () => {
    for (const category of FEATURE_CATEGORIES) {
      expect(text, `${category} is missing`).toContain(category);
    }
    for (const entry of COVERAGE_MAP) {
      expect(text, `${entry.id} is missing`).toContain(entry.id);
      expect(text, `${entry.name} is missing`).toContain(entry.name);
    }
  });
});
