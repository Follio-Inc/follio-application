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

import { existsSync, readFileSync } from 'node:fs';
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

    // Item 10 ships the shell only: Labs, Tests and Drift are routed and empty.
    for (const section of listPlatformTools()) {
      expect(section.status, section.id).toBe('planned');
      // A planned section has to name what it will show, or its placeholder
      // has nothing honest to say.
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
    // `_admin-panel/`. A shim renders one component and does nothing else, so
    // no JSX beyond the single element and no markup classes.
    for (const section of PLATFORM_SECTIONS) {
      const source = read(routeFileFor(section.href));

      expect(source, `${section.href} should render platform UI`).toContain(
        "from '@/_admin-panel/platform/ui'"
      );
      expect(source, `${section.href} must not carry markup`).not.toMatch(/className=/);
      expect(source.split('\n').length, `${section.href} is not a thin shim`).toBeLessThan(25);
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
  it('shows both the platform and the old developer panel', () => {
    const ids = ADMIN_PANEL_NAV.map((item) => item.id);

    expect(ids).toContain('platform');
    // Item 10's done condition: nav shows both surfaces.
    expect(ids).toContain('developer');

    const platform = ADMIN_PANEL_NAV.find((item) => item.id === 'platform');
    expect(platform?.href).toBe(PLATFORM_ROOT);
    expect(platform?.label).toBe('Platform');

    const developer = ADMIN_PANEL_NAV.find((item) => item.id === 'developer');
    expect(developer?.href).toBe(LEGACY_DEVELOPER_ROOT);
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

describe('the old developer panel is untouched', () => {
  it('still renders DevtoolsPanel from its own shim', () => {
    const source = read(`${ADMIN_DASHBOARD}/developer/page.tsx`);

    expect(source).toContain('DevtoolsPanel');
    expect(source).toMatch(/await requireAdmin\(\)/);
    // Item 10 must not have reached into the old surface.
    expect(source).not.toContain('platform');
  });

  it('keeps the modules the old panel is built from', () => {
    for (const modulePath of [
      '_admin-panel/modules/developer/ui/DevtoolsPanel.tsx',
      '_admin-panel/modules/developer/suites.ts',
      '_admin-panel/modules/developer/suites-catalog.ts',
    ]) {
      expect(exists(modulePath), `${modulePath} must survive until item 25`).toBe(true);
    }
  });
});

describe('client safety', () => {
  const uiFiles = [
    `${PLATFORM_UI}/index.ts`,
    `${PLATFORM_UI}/platform-shell.tsx`,
    `${PLATFORM_UI}/platform-overview.tsx`,
    `${PLATFORM_UI}/platform-section.tsx`,
    '_admin-panel/platform/nav.ts',
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
    // Three planned sections, each badged in the nav.
    expect(shell.split('Planned').length - 1).toBe(listPlatformTools().length);
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

  it('links to every tool section and says which milestone builds it', () => {
    for (const section of listPlatformTools()) {
      expect(overview, `${section.id} is missing a card`).toContain(`href="${section.href}"`);
      expect(overview, `${section.id} has no description`).toContain(section.description);
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
    for (const section of listPlatformTools()) {
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
      ...listPlatformTools().map((section) =>
        renderToStaticMarkup(<PlatformSectionPlaceholder id={section.id} />)
      ),
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
