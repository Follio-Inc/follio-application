/**
 * Developer Platform section registry (PLATFORM_TODO item 10).
 *
 * The one place that knows what sections the platform has and where they live.
 * The shell, the overview and each section's placeholder all read it, so adding
 * a section is one entry here rather than an edit in four files — which is what
 * lets items 11–24 fill the sections in without touching the shell.
 *
 * **Client-safe on purpose**: data and types only, no Node APIs and nothing
 * from `platform/scan/`, which walks the filesystem. The shell is a client
 * component and imports this, so anything added here has to stay safe to send
 * to a browser. `__tests__/platform-shell.test.ts` enforces that.
 */

export type PlatformSectionId = 'overview' | 'labs' | 'tests' | 'drift';

/**
 * Whether the section does anything yet.
 *
 * `planned` is shown as exactly that. A section with no implementation says so
 * and names the milestone that delivers it; it never shows an empty chart or a
 * zero where a real number will go.
 */
export type PlatformSectionStatus = 'available' | 'planned';

export type PlatformSection = {
  id: PlatformSectionId;
  /** Absolute route, so nav links and tests agree on one spelling. */
  href: string;
  label: string;
  /** What an engineer opens it for, in one line. */
  description: string;
  status: PlatformSectionStatus;
  /** What it will show once built. The placeholder lists these verbatim. */
  plan: string[];
  /** The PLATFORM_TODO items that deliver it, named in the placeholder. */
  deliveredBy: string;
};

/** Where the platform lives under the admin surface. */
export const PLATFORM_ROOT = '/admin/platform';

/** The surface this one is replacing, still live until PLATFORM_TODO item 25. */
export const LEGACY_DEVELOPER_ROOT = '/admin/developer';

/**
 * Sections, in the order the sidebar shows them.
 *
 * Overview first because it is the only one that does anything today; the rest
 * are routed and reachable so the shell can be wired and reviewed now.
 */
export const PLATFORM_SECTIONS: PlatformSection[] = [
  {
    id: 'overview',
    href: PLATFORM_ROOT,
    label: 'Overview',
    description: 'What the platform covers, and where each tool will live.',
    status: 'available',
    plan: [],
    deliveredBy: 'item 10',
  },
  {
    id: 'labs',
    href: `${PLATFORM_ROOT}/labs`,
    label: 'Labs',
    description: 'Per-feature workbenches that run a real pipeline without writing to a profile.',
    status: 'planned',
    plan: [
      'A lab per feature, listed from the coverage map',
      'Resume import: bytes, pages, characters kept vs dropped, per-stage timing',
      'AI tokens, cost, entities and warnings for a run',
      'Two runs side by side, AI against the openresume baseline',
    ],
    deliveredBy: 'items 20–24',
  },
  {
    id: 'tests',
    href: `${PLATFORM_ROOT}/tests`,
    label: 'Tests',
    description: 'Every Vitest file and Live QA pathway, grouped by the feature it covers.',
    // Item 11 landed the read-only inventory. Running a category, reading a
    // failure and keeping history are items 12–16, and the section says so
    // on the page rather than pretending to run anything.
    status: 'available',
    plan: [
      'Run a category and read per-test name, duration and status',
      'Assertion text, expected against actual, and the stack for a failure',
      'Live QA runs with trace and screenshot links',
      'History, last pass, and flaky detection',
    ],
    deliveredBy: 'items 11–16',
  },
  {
    id: 'drift',
    href: `${PLATFORM_ROOT}/drift`,
    label: 'Drift',
    description: 'Where the coverage map and the repository disagree.',
    status: 'planned',
    plan: [
      'The nine signals `npm run platform:scan` already reports, in the browser',
      'Proposed map entries and draft tests, for review and never auto-merged',
      'Quarantine and delete, with approval and an audit record',
    ],
    deliveredBy: 'items 17–19',
  },
];

export function getPlatformSection(id: string): PlatformSection | undefined {
  return PLATFORM_SECTIONS.find((section) => section.id === id);
}

/** Sections other than the overview, in nav order. */
export function listPlatformTools(): PlatformSection[] {
  return PLATFORM_SECTIONS.filter((section) => section.id !== 'overview');
}

/**
 * Sections with no implementation yet, in nav order.
 *
 * The set that still renders `PlatformSectionPlaceholder`. It shrinks as items
 * 12–24 land, which is why callers ask for it rather than assuming every
 * tool section is empty.
 */
export function listPlannedSections(): PlatformSection[] {
  return PLATFORM_SECTIONS.filter((section) => section.status === 'planned');
}

/**
 * Whether a pathname is inside a section.
 *
 * The overview owns the platform root exactly; every other section owns its own
 * subtree, so a future `/admin/platform/labs/resume-import` still highlights
 * Labs instead of falling back to the overview.
 */
export function isSectionActive(section: PlatformSection, pathname: string): boolean {
  if (section.id === 'overview') return pathname === PLATFORM_ROOT;
  return pathname === section.href || pathname.startsWith(`${section.href}/`);
}
