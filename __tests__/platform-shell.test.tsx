/**
 * Developer Platform shell: route shims, navigation and placeholders
 * (PLATFORM_TODO item 10).
 *
 * Item 10 is architecture, not markup, so these assert the things that would
 * actually break later: that the routes exist and stay thin, that every nav
 * href resolves to a real route file, that the admin guard is on every page,
 * that the old panel is untouched, and that no server-only scanner module can
 * reach a client component.
 *
 * The source-text assertions read the route files on purpose. There is no way
 * to render a React Server Component that calls `requireAdmin()` under Vitest
 * without a request, a Clerk session and a database, and a test that mocked all
 * three would prove that the mocks agree with each other rather than that the
 * guard is present. Reading the file proves the guard is present.
 *
 * The shell itself is rendered, not read: `renderToStaticMarkup` gives the real
 * markup, so the navigation assertions are about links a browser would follow
 * rather than about strings in a source file. They check the links and the
 * honest empty states, not the markup around them — there are no snapshots
 * here, because a snapshot would fail on every styling change and prove
 * nothing about the structure item 10 exists to establish.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// `PlatformShell` reads the active section from the pathname. Mocked rather
// than stubbed out so the active-state assertions below exercise the real
// `isSectionActive` logic.
const CURRENT_PATH = '/admin/platform';
vi.mock('next/navigation', () => ({ usePathname: () => CURRENT_PATH }));

import { ADMIN_PANEL_NAV } from '@/_admin-panel/nav';
import {
  LEGACY_DEVELOPER_ROOT,
  PLATFORM_ROOT,
  PLATFORM_SECTIONS,
  getPlatformSection,
  isSectionActive,
  listPlannedSections,
  listPlatformTools,
} from '@/_admin-panel/platform/nav';
import {
  PlatformOverview,
  PlatformSectionPlaceholder,
  PlatformShell,
} from '@/_admin-panel/platform/ui';

const ADMIN_DASHBOARD = 'app/admin/(dashboard)';
const PLATFORM_UI = '_admin-panel/platform/ui';

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function exists(relativePath: string): boolean {
  return existsSync(path.join(process.cwd(), relativePath));
}

/** The route file Next.js would serve for an `/admin/...` pathname. */
function routeFileFor(href: string): string {
  const segments = href.replace(/^\/admin\/?/, '');
  return segments === ''
    ? `${ADMIN_DASHBOARD}/page.tsx`
    : `${ADMIN_DASHBOARD}/${segments}/page.tsx`;
}

describe('platform section registry', () => {
  it('registers overview plus the three sections item 10 names', () => {
    expect(PLATFORM_SECTIONS.map((section) => section.id)).toEqual([
      'overview',
      'labs',
      'tests',
      'drift',
    ]);
    expect(listPlatformTools().map((section) => section.id)).toEqual(['labs', 'tests', 'drift']);
  });

  it('describes every section well enough to act on', () => {
    for (const section of PLATFORM_SECTIONS) {
      expect(section.href.startsWith(PLATFORM_ROOT), section.id).toBe(true);
      expect(section.label.length, section.id).toBeGreaterThan(0);
      // Product language, not a one-word stub.
      expect(section.description.length, section.id).toBeGreaterThan(30);
      expect(section.deliveredBy.length, section.id).toBeGreaterThan(0);
      expect(getPlatformSection(section.id)?.href).toBe(section.href);
    }
    expect(getPlatformSection('not-a-section')).toBeUndefined();
  });

  it('says plainly which sections do nothing yet', () => {
    const overview = getPlatformSection('overview');
    expect(overview?.status).toBe('available');
    expect(overview?.plan).toEqual([]);

    // Item 10 shipped the shell with Labs, Tests and Drift routed and empty;
    // items 11, 17 and 20 filled them in, and as of item 20 none is planned.
    // The invariant is asserted rather than today's membership, so a section
    // added later still has to be honest about itself.
    for (const section of listPlatformTools()) {
      expect(['available', 'planned'], section.id).toContain(section.status);
    }
    for (const section of listPlannedSections()) {
      // A planned section has to name what it will show, or its placeholder
      // has nothing honest to say.
      expect(section.plan.length, section.id).toBeGreaterThan(0);
      expect(section.deliveredBy.length, section.id).toBeGreaterThan(0);
    }
    // Every section now reads the repository, so none may claim otherwise.
    // `PlatformSectionPlaceholder` is kept for the next section to be routed
    // before it is built; its own rendering is asserted below.
    expect(listPlannedSections()).toEqual([]);
    for (const section of listPlatformTools()) {
      expect(section.status, `${section.id} should be built by now`).toBe('available');
      expect(section.plan.length, section.id).toBeGreaterThan(0);
    }
  });

  it('highlights the owning section for a nested path', () => {
    const labs = getPlatformSection('labs')!;
    const overview = getPlatformSection('overview')!;

    expect(isSectionActive(overview, PLATFORM_ROOT)).toBe(true);
    expect(isSectionActive(overview, labs.href)).toBe(false);
    expect(isSectionActive(labs, labs.href)).toBe(true);
    // A future `/labs/resume-import` must keep Labs active, not fall back.
    expect(isSectionActive(labs, `${labs.href}/resume-import`)).toBe(true);
    expect(isSectionActive(labs, `${PLATFORM_ROOT}/labsomething`)).toBe(false);
  });
});

describe('platform routes', () => {
  it('serves every nav href from a real route file', () => {
    for (const section of PLATFORM_SECTIONS) {
      const routeFile = routeFileFor(section.href);
      expect(exists(routeFile), `${section.href} has no route file at ${routeFile}`).toBe(true);
    }
  });

  it('puts the admin guard on every platform page', () => {
    for (const section of PLATFORM_SECTIONS) {
      const source = read(routeFileFor(section.href));

      expect(source, `${section.href} must use the existing guard`).toContain("from '@/lib/admin'");
      expect(source, `${section.href} must call requireAdmin`).toMatch(/await requireAdmin\(\)/);
      // Not indexable, and never cached: the guard has to run per request.
      expect(source).toContain('robots');
      expect(source).toContain("dynamic = 'force-dynamic'");
    }
  });

  it('keeps the route files thin shims', () => {
    // `.cursor/rules/admin-panel.mdc`: real panel logic lives in
    // `_admin-panel/`. A shim composes components and does nothing else — no
    // markup, no branching, no iteration, no state, no fetching.
    //
    // Not a line count. A composition shim grows with the number of components
    // it wires, and the Tests page now passes two runners; length was never the
    // thing worth forbidding.
    for (const section of PLATFORM_SECTIONS) {
      const source = read(routeFileFor(section.href));

      expect(source, `${section.href} should render platform UI`).toContain(
        "from '@/_admin-panel/platform/ui'"
      );
      expect(source, `${section.href} must not carry markup`).not.toMatch(/className=/);
      expect(source, `${section.href} must not build markup`).not.toMatch(
        /<(div|section|p|span|h[1-6])[\s>]/
      );
      for (const logic of ['if (', 'for (', '.map(', '.filter(', 'useState', 'fetch(']) {
        expect(source, `${section.href} carries logic: ${logic}`).not.toContain(logic);
      }
    }
  });

  it('wraps the sections in the shell through one layout', () => {
    const layout = read(`${ADMIN_DASHBOARD}/platform/layout.tsx`);

    expect(layout).toContain('PlatformShell');
    expect(layout).toContain("from '@/_admin-panel/platform/ui'");
    expect(layout).not.toMatch(/className=/);
  });
});

describe('admin sidebar', () => {
  it('shows one canonical Developer Platform entry', () => {
    const ids = ADMIN_PANEL_NAV.map((item) => item.id);

    expect(ids).toContain('platform');
    // Item 10 put two surfaces in the sidebar while the new one was built.
    // Item 25 retired the old panel, so only one is a module now — two
    // entries would present a retired tool as still supported.
    expect(ids).not.toContain('developer');

    const platform = ADMIN_PANEL_NAV.find((item) => item.id === 'platform');
    expect(platform?.href).toBe(PLATFORM_ROOT);
    expect(platform?.label).toBe('Platform');
    expect(platform?.description).not.toMatch(/replaces Developer/i);

    // The route still resolves, as a redirect — it is just not a module.
    expect(ADMIN_PANEL_NAV.map((item) => item.href)).not.toContain(LEGACY_DEVELOPER_ROOT);
  });

  it('gives every sidebar module an icon', () => {
    // The shell's ICONS map is typed `Record<AdminPanelModuleId, …>`, so a
    // missing entry is a type error — this catches the href drifting instead.
    const shell = read(`${ADMIN_DASHBOARD}/components/admin-shell.tsx`);

    for (const item of ADMIN_PANEL_NAV) {
      expect(shell, `${item.id} has no icon in the admin shell`).toMatch(
        new RegExp(`\\b${item.id}:`)
      );
    }
  });

  it('serves every sidebar module from a real route file', () => {
    for (const item of ADMIN_PANEL_NAV) {
      const routeFile = routeFileFor(item.href);
      expect(exists(routeFile), `${item.href} has no route file at ${routeFile}`).toBe(true);
    }
  });
});

/** Every TypeScript file under a directory. Used by the retirement sweep. */
function walk(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? walk(path.join(dir, entry.name))
        : /\.tsx?$/.test(entry.name)
          ? [path.join(dir, entry.name)]
          : []
    );
  } catch {
    return [];
  }
}

describe('the old developer panel is retired (item 25)', () => {
  /** Everything item 25 deleted, named one by one rather than by pattern. */
  const RETIRED = [
    '_admin-panel/modules/developer/ui/DevtoolsPanel.tsx',
    '_admin-panel/modules/developer/suites.ts',
    '_admin-panel/modules/developer/suites-catalog.ts',
    // The panel's own UI, which nothing else imported.
    '_admin-panel/modules/developer/ui/LiveQaTab.tsx',
    '_admin-panel/modules/developer/ui/ResumeReaderTab.tsx',
    '_admin-panel/modules/developer/ui/styles.ts',
    '_admin-panel/modules/developer/ui/use-devtools.ts',
    // The two endpoints that existed only to serve it.
    'app/api/admin/developer/catalog/route.ts',
    'app/api/admin/developer/test/route.ts',
  ];

  it('deleted every retired module', () => {
    for (const modulePath of RETIRED) {
      expect(exists(modulePath), `${modulePath} must be gone`).toBe(false);
    }
    expect(exists('_admin-panel/modules/developer/ui')).toBe(false);
  });

  it('leaves nothing importing them', () => {
    // The whole repository, not a curated list: a single surviving import
    // would be a broken build, and a stale one in a test would be a lie.
    const roots = ['app', '_admin-panel', 'components', 'lib', 'services', '__tests__', 'scripts'];
    const offenders: string[] = [];

    for (const root of roots) {
      for (const file of walk(path.join(process.cwd(), root))) {
        const relative = file
          .slice(process.cwd().length + 1)
          .split(path.sep)
          .join('/');
        const source = readFileSync(file, 'utf8');

        // Path-qualified specifiers, from anywhere in the repository.
        const qualified =
          /from '[^']*(suites-catalog|developer\/suites|DevtoolsPanel|ui\/LiveQaTab|ui\/ResumeReaderTab|ui\/use-devtools)'/.test(
            source
          );
        // Bare relative ones count only inside the module that held them;
        // plenty of unrelated code has its own `./styles`.
        const sibling =
          relative.startsWith('_admin-panel/modules/developer/') &&
          /from '\.[./]*\/?(suites|suites-catalog|LiveQaTab|ResumeReaderTab|use-devtools|styles)'/.test(
            source
          );

        if (qualified || sibling) offenders.push(relative);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('redirects /admin/developer to the platform instead of rendering a panel', () => {
    const source = read(`${ADMIN_DASHBOARD}/developer/page.tsx`);

    expect(source).toContain("redirect('/admin/platform')");
    expect(source).toContain("from 'next/navigation'");
    // No legacy UI, and no retired import.
    expect(source).not.toContain('DevtoolsPanel');
    expect(source).not.toMatch(/suites|LiveQaTab|ResumeReaderTab/);
    // Thin: a redirect and its metadata, nothing else.
    expect(source).not.toMatch(/className=|useState|<div/);
  });

  it('keeps the shared infrastructure the platform runs on', () => {
    // Living under `modules/developer/` is not what made the panel legacy.
    // These are what the Test Console, Live QA and the Resume Lab import.
    for (const modulePath of [
      '_admin-panel/modules/developer/guard.ts',
      '_admin-panel/modules/developer/process-tree.ts',
      '_admin-panel/modules/developer/live-qa/runner.ts',
      '_admin-panel/modules/developer/live-qa/catalog.ts',
      '_admin-panel/modules/developer/live-qa/fixtures.ts',
      '_admin-panel/modules/developer/live-qa/triage.ts',
      '_admin-panel/modules/developer/live-qa/playwright.config.ts',
    ]) {
      expect(exists(modulePath), `${modulePath} is shared and must survive`).toBe(true);
    }
  });

  it('leaves the module barrel exporting only what survives', () => {
    const barrel = read('_admin-panel/modules/developer/index.ts');

    expect(barrel).not.toMatch(/suites/);
    expect(barrel).toContain('guard');
  });
});

describe('client safety', () => {
  const uiFiles = [
    `${PLATFORM_UI}/index.ts`,
    `${PLATFORM_UI}/platform-shell.tsx`,
    `${PLATFORM_UI}/platform-overview.tsx`,
    `${PLATFORM_UI}/platform-section.tsx`,
    `${PLATFORM_UI}/test-console.tsx`,
    `${PLATFORM_UI}/run-progress.tsx`,
    `${PLATFORM_UI}/use-run-execution.ts`,
    `${PLATFORM_UI}/test-history.tsx`,
    `${PLATFORM_UI}/drift-report.tsx`,
    `${PLATFORM_UI}/drift-quarantine-panel.tsx`,
    `${PLATFORM_UI}/labs-home.tsx`,
    `${PLATFORM_UI}/resume-lab.tsx`,
    '_admin-panel/platform/nav.ts',
    '_admin-panel/platform/tests/types.ts',
    '_admin-panel/platform/tests/execution-types.ts',
    '_admin-panel/platform/tests/history-types.ts',
    '_admin-panel/platform/drift/view-types.ts',
    '_admin-panel/platform/drift/proposal-types.ts',
    '_admin-panel/platform/drift/quarantine-types.ts',
    '_admin-panel/platform/labs/types.ts',
    '_admin-panel/platform/labs/registry.ts',
    '_admin-panel/platform/labs/view.ts',
    '_admin-panel/platform/labs/resume-import-ai/types.ts',
    '_admin-panel/platform/labs/resume-import-ai/pricing.ts',
    '_admin-panel/platform/labs/resume-import-ai/comparison-types.ts',
  ];

  it('keeps the scanner out of the shell', () => {
    // The scanners walk the filesystem. One import of them from a client
    // component and the admin bundle stops building — or worse, builds and
    // ships a filesystem walker to a browser.
    for (const file of uiFiles) {
      const source = read(file);

      // Matched against specifiers, not prose: these files discuss the rule in
      // their own doc comments.
      expect(source, `${file} must not import the scanner`).not.toMatch(
        /from '[^']*platform\/scan/
      );
      expect(source, `${file} must not import a node module`).not.toMatch(/from 'node:/);
      expect(source, `${file} must not read the filesystem`).not.toMatch(
        /readFileSync\(|readdirSync\(/
      );
    }
  });

  it('marks only the component that needs the browser as a client component', () => {
    // `usePathname` forces the shell to be a client component; the overview and
    // the placeholders are static, so they stay on the server.
    expect(read(`${PLATFORM_UI}/platform-shell.tsx`).startsWith("'use client'")).toBe(true);
    expect(read(`${PLATFORM_UI}/platform-overview.tsx`)).not.toContain("'use client'");
    expect(read(`${PLATFORM_UI}/platform-section.tsx`)).not.toContain("'use client'");
    expect(read(`${PLATFORM_UI}/test-console.tsx`)).not.toContain("'use client'");
  });

  it('keeps the section registry free of anything server-only', () => {
    const source = read('_admin-panel/platform/nav.ts');

    expect(source).not.toMatch(/from '(node:|fs|path)/);
    expect(source).not.toContain('process.');
  });
});

describe('the shell renders', () => {
  const shell = renderToStaticMarkup(
    <PlatformShell>
      <p>section content</p>
    </PlatformShell>
  );

  it('names itself as the internal Developer Platform', () => {
    expect(shell).toContain('Developer Platform');
    expect(shell).toContain('Internal');
  });

  it('shows a nav entry for Overview, Labs, Tests and Drift', () => {
    for (const section of PLATFORM_SECTIONS) {
      // The label a person clicks, and the href a browser follows.
      expect(shell, `${section.id} is missing from the nav`).toContain(section.label);
      expect(shell, `${section.id} has no link`).toContain(`href="${section.href}"`);
    }
    expect(shell).toContain('aria-label="Developer Platform sections"');
  });

  it('marks the section matching the current path, and only that one', () => {
    const current = shell.split('aria-current="page"').length - 1;
    expect(current).toBe(1);
    // Mocked pathname is the platform root, so Overview owns it.
    const overview = getPlatformSection('overview')!;
    expect(shell).toMatch(
      new RegExp(
        `href="${overview.href}"[^>]*aria-current="page"|aria-current="page"[^>]*href="${overview.href}"`
      )
    );
  });

  it('labels the sections that do nothing yet', () => {
    // One badge per planned section, and none for a section that works.
    expect(shell.split('Planned').length - 1).toBe(listPlannedSections().length);
    for (const section of listPlatformTools()) {
      // Badged or not, every tool is still reachable from the nav.
      expect(shell, `${section.id} is missing from the nav`).toContain(`href="${section.href}"`);
    }
  });

  it('renders whatever the section passed in', () => {
    // How items 11–24 plug in: server-rendered content arrives as children.
    expect(shell).toContain('<p>section content</p>');
  });

  it('keeps the old panel one click away', () => {
    expect(shell).toContain(`href="${LEGACY_DEVELOPER_ROOT}"`);
    expect(shell).toContain('side by side');
  });
});

describe('the overview renders', () => {
  const overview = renderToStaticMarkup(<PlatformOverview />);

  it('links to every tool section and says which milestone builds the empty ones', () => {
    for (const section of listPlatformTools()) {
      expect(overview, `${section.id} is missing a card`).toContain(`href="${section.href}"`);
      expect(overview, `${section.id} has no description`).toContain(section.description);
    }
    // "Arrives in …" belongs only to a section that has not arrived.
    for (const section of listPlannedSections()) {
      expect(overview, `${section.id} does not name its milestone`).toContain(section.deliveredBy);
    }
  });

  it('points at the surface that still does the work today', () => {
    expect(overview).toContain(`href="${LEGACY_DEVELOPER_ROOT}"`);
    expect(overview).toContain('npm run platform:scan');
  });
});

describe('an unbuilt section renders honestly', () => {
  it('says it is empty and names what will fill it', () => {
    for (const section of listPlannedSections()) {
      const html = renderToStaticMarkup(<PlatformSectionPlaceholder id={section.id} />);

      expect(html, `${section.id} does not name itself`).toContain(section.label);
      expect(html, `${section.id} does not admit it is empty`).toContain('Not built yet');
      expect(html).toContain('Nothing here yet');
      expect(html, `${section.id} does not name its milestone`).toContain(section.deliveredBy);
      // Every planned line is shown, so the page is useful without pretending
      // to have data.
      for (const entry of section.plan) {
        expect(html, `${section.id} drops a plan line`).toContain(entry);
      }
      expect(html).toContain(`href="${PLATFORM_ROOT}"`);
    }
  });

  it('claims no measurement anywhere in the rendered shell', () => {
    // The strongest form of the no-fake-data rule: assert on what a person
    // would read, not on the source that produced it. Tags come off first,
    // because SVG path data and Tailwind class names are full of digits that
    // say nothing about the product.
    const text = [
      renderToStaticMarkup(
        <PlatformShell>
          <PlatformOverview />
        </PlatformShell>
      ),
      // Rendered for a real section rather than for the planned set, which is
      // empty as of item 20: the rule is about the placeholder's own copy, and
      // it still has to hold for whichever section is routed before it is
      // built next.
      renderToStaticMarkup(<PlatformSectionPlaceholder id="labs" />),
    ]
      .join('\n')
      .replace(/<[^>]*>/g, ' ');

    // A count of anything the platform has not measured.
    expect(text).not.toMatch(/\d+\s*(tests?|features?|pathways?|findings?|modules?|errors?)\b/i);
    // A verdict, with or without a number in front of it.
    expect(text).not.toMatch(/\d+\s*(passing|passed|failing|failed)\b/i);
    expect(text).not.toMatch(/\b(all|no)\s+tests?\b/i);

    // And the positive half of the same rule: it says what it is instead.
    expect(text).toContain('Not built yet');
    expect(text).toContain('Nothing here yet');
  });

  it('handles an unregistered section instead of crashing', () => {
    // Unreachable through the routed pages, which pass a literal id. Rendered
    // here so a future caller gets a page rather than an exception.
    const html = renderToStaticMarkup(
      // @ts-expect-error — deliberately outside PlatformSectionId
      <PlatformSectionPlaceholder id="not-a-section" />
    );

    expect(html).toContain('Unknown section');
  });
});

describe('placeholders claim nothing', () => {
  it('hardcodes no count or verdict in the components themselves', () => {
    // The rendered check above is the real one. This is the same rule a layer
    // down, so a literal "12 tests passed" typed into a component fails even
    // if it sits behind a condition the render test does not reach. Both use
    // the same patterns deliberately: a plan line that says "flaky detection"
    // is honest copy about what a section will do, and must keep passing.
    const source = [`${PLATFORM_UI}/platform-overview.tsx`, `${PLATFORM_UI}/platform-section.tsx`]
      .map(read)
      .join('\n');

    expect(source).not.toMatch(/\d+\s*(tests?|features?|pathways?|findings?|modules?|errors?)\b/i);
    expect(source).not.toMatch(/\d+\s*(passing|passed|failing|failed)\b/i);
  });

  it('names the milestone that fills each empty section', () => {
    for (const section of listPlatformTools()) {
      expect(section.deliveredBy, section.id).toMatch(/item/);
    }
    expect(read(`${PLATFORM_UI}/platform-section.tsx`)).toContain('deliveredBy');
  });
});
