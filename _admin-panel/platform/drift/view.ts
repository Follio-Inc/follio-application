import { runDriftScan } from '../scan';
import type { DriftScanOptions } from '../scan';
import type {
  AiStageFinding,
  AiStageScanReport,
  CategoryHealthReport,
  DriftReport,
  DriftSignalReport,
  FlagFinding,
  FlagScanReport,
  MapReferenceFinding,
  MapReferenceScanReport,
  PathwayFinding,
  PathwayScanReport,
  PrismaModelFinding,
  PrismaScanReport,
  ReachabilityRecordFinding,
  ReachabilityScanReport,
  SurfaceFinding,
  SurfaceScanReport,
  TestFinding,
  TestScanReport,
} from '../scan/types';
import type {
  DriftCategoryRow,
  DriftCount,
  DriftEntry,
  DriftFindingGroup,
  DriftSeverity,
  DriftSignalView,
  DriftSummary,
  DriftView,
} from './view-types';

/**
 * Projecting the drift scan onto the Drift page (PLATFORM_TODO item 17).
 *
 * Server-only, because it calls `runDriftScan`, which walks the repository and
 * parses it with the TypeScript compiler. The page calls `buildDriftView()`
 * once per render; the view it returns is plain data, and
 * `platform/ui/drift-report.tsx` renders it without importing anything from
 * here or from `platform/scan/`.
 *
 * **This file adds no judgement of its own.** Every count comes from a signal's
 * `summary`, every finding from one of its typed lists, and `ok` is passed
 * through from the report. Nothing re-walks the tree, re-resolves an import or
 * re-classifies a path: a second implementation that agreed today would
 * disagree eventually, and then the page and `npm run platform:scan` would be
 * telling an engineer two different things.
 *
 * What it *does* own is **presentation**: a title and a one-line description per
 * signal, and per list a heading, a severity and a sentence saying how to read
 * it. Those live in the two tables below so they are stated once.
 *
 * Read-only, by item 17. Nothing here writes to the coverage map, proposes an
 * edit or quarantines anything — items 18 and 19.
 */

/** Entries rendered per group. A longer list reports what it left out. */
const ENTRY_CAP = 50;

/** Values shown inline in one evidence line before it says "+N more". */
const INLINE_CAP = 6;

/**
 * The lists that are terms in `DriftReport.ok`.
 *
 * This mirrors the `ok` expression in `scan/report.ts` and exists so the page's
 * severities cannot drift from the scanner's own definition of failure. A test
 * pins the two together, and pins that `contradiction` means exactly
 * membership here.
 *
 * Signal 3's three lists joined it in PLATFORM_TODO item 17a, when the page's
 * severities were checked against the expression and found two of them sitting
 * outside it. The fix went into the scanner, not here.
 */
const FAILS_SCAN = new Set([
  'product-surface.unmapped',
  'test-attribution.stale',
  'test-attribution.misattributed',
  'live-qa-pathways.stale',
  'live-qa-pathways.missingSpec',
  'live-qa-pathways.orphanSpecs',
  'ai-stages.stale',
  'feature-flags.stale',
  'prisma-models.stale',
  'reachability.disagreements',
  'map-references.missing',
]);

type SignalMeta = { title: string; checks: string; healthyNote: string };

/** One title and one description per signal, stated once. */
const SIGNAL_META: Record<DriftSignalReport['signal'], SignalMeta> = {
  'product-surface': {
    title: 'Product surface',
    checks:
      'Every page and route handler under `app/`, against the feature `codeLocations` and `EXCLUDED` entries that claim them.',
    healthyNote:
      'Every discovered page and route handler is either claimed by a feature or excluded.',
  },
  'test-attribution': {
    title: 'Test attribution',
    checks:
      'Every file in `__tests__`, resolved through the import graph, against the `unitTests` each feature lists.',
    healthyNote:
      'No feature lists a test the import graph cannot support, and no test is attributed to a feature the graph rejects.',
  },
  'live-qa-pathways': {
    title: 'Live QA pathways',
    checks:
      'The Live QA catalog, against the `pathways` features claim and the spec files on disk.',
    healthyNote: 'Every catalogued pathway has its spec on disk and a feature that claims it.',
  },
  'ai-stages': {
    title: 'AI stages',
    checks:
      "The AI client's `MAX_TOKENS` keys and their call sites, against the `aiStages` features declare.",
    healthyNote: 'No feature declares a stage the token budget or its own code cannot support.',
  },
  'feature-flags': {
    title: 'Feature flags',
    checks:
      'The flags the flag module declares and the files that enforce them, against the `flag` each feature declares.',
    healthyNote: 'No feature declares a flag the repository does not define or does not gate on.',
  },
  'prisma-models': {
    title: 'Prisma models',
    checks:
      'Every model in the schema and the code that queries its delegate, against the `prismaModels` features declare.',
    healthyNote: 'No feature declares a model the schema or its own code cannot support.',
  },
  reachability: {
    title: 'Reachability',
    checks:
      'Every module classified from the real entry points, against the reachability records the map holds.',
    healthyNote: 'Every reachability record still matches what the module graph computes.',
  },
  'map-references': {
    title: 'Map references',
    checks: 'Every `codeLocations` and `EXCLUDED` path the map names, against the tree.',
    healthyNote: 'Every path the map names is on disk.',
  },
  'category-health': {
    title: 'Category health',
    checks:
      'How features are distributed across categories, and what each category has by way of tests, pathways and labs.',
    healthyNote:
      'Nothing in this signal fails the scan. It is a distribution report, and the gaps below are product gaps rather than defects.',
  },
};

type GroupMeta = { title: string; severity: DriftSeverity; note: string };

/**
 * One heading, one severity and one sentence per list, stated once.
 *
 * Keyed `<signal>.<field>`, where the field is the report's own property name,
 * so a reader can go from a card on the page to the array that produced it.
 *
 * The severities are not invented here. `contradiction` is exactly membership
 * in `FAILS_SCAN` above. `inconsistency` is the map or the catalog naming
 * something that is not there, which the scan does not currently fail on.
 * Everything else is a `gap` — something real that nothing claims — and its
 * note says why it is not a defect, in the scanner's own terms.
 */
const GROUP_META: Record<string, GroupMeta> = {
  'product-surface.unmapped': {
    title: 'Unmapped surfaces',
    severity: 'contradiction',
    note: 'A page or route handler nobody has accounted for. Each needs a feature `codeLocations` entry or an `EXCLUDED` one.',
  },

  'test-attribution.stale': {
    title: 'Stale `unitTests` references',
    severity: 'contradiction',
    note: 'A feature lists a test file that is not on disk, or one whose imports reach none of that feature’s code.',
  },
  'test-attribution.misattributed': {
    title: 'Misattributed tests',
    severity: 'contradiction',
    note: 'The map lists the test under features the import graph does not support.',
  },
  'test-attribution.unlisted': {
    title: 'Attributed but not listed',
    severity: 'gap',
    note: 'The import graph attributes the test to a feature whose `unitTests` does not name it. The map is incomplete, not wrong.',
  },
  'test-attribution.uncategorized': {
    title: 'Under no feature',
    severity: 'gap',
    note: 'The test reaches no feature code at all: the platform’s own tests and shared utilities. Giving them an owner they do not have would be the fiction.',
  },
  'test-attribution.deadCode': {
    title: 'Covering unreachable code',
    severity: 'gap',
    note: 'Everything the test reaches is recorded as an orphan, so it covers code no shipped entry point can run.',
  },

  'live-qa-pathways.stale': {
    title: 'Stale `pathways` references',
    severity: 'contradiction',
    note: 'A feature claims a pathway id the Live QA catalog does not define.',
  },
  'live-qa-pathways.missingSpec': {
    title: 'Catalogued with no spec file',
    severity: 'contradiction',
    note: 'The catalog names a spec that is not on disk, so the pathway cannot run.',
  },
  'live-qa-pathways.orphanSpecs': {
    title: 'Spec files the catalog does not name',
    severity: 'contradiction',
    note: 'A `*.spec.ts` under `pathways/` with no catalog entry. The file is real and can never run through the catalog, so it is invisible rather than merely unowned.',
  },
  'live-qa-pathways.unmapped': {
    title: 'Pathways no feature claims',
    severity: 'gap',
    note: 'The pathway runs and no feature’s `pathways` names it.',
  },
  'live-qa-pathways.featuresWithoutPathway': {
    title: 'Features with no pathway',
    severity: 'gap',
    note: 'Most areas genuinely have no browser coverage yet. Recorded, never failed: inventing ownership to shrink this list would turn an honest gap into a false claim.',
  },

  'ai-stages.stale': {
    title: 'Stale `aiStages` references',
    severity: 'contradiction',
    note: 'A feature declares a `MAX_TOKENS` key the budget does not define, or one whose call site is not in that feature’s code.',
  },
  'ai-stages.unbudgetedStages': {
    title: 'Stages with no budget',
    severity: 'inconsistency',
    note: 'A call site names a key the budget does not define. Legal at runtime — the client falls back to its default allowance — so reported, not failed. It still means that call has no reviewed budget.',
  },
  'ai-stages.unused': {
    title: 'Budgeted and never called',
    severity: 'gap',
    note: 'The budget defines the key and no call site names it.',
  },
  'ai-stages.unclaimed': {
    title: 'Called from code no feature owns',
    severity: 'gap',
    note: 'The key is used, and the file using it sits in no feature’s `codeLocations`.',
  },
  'ai-stages.undeclared': {
    title: 'Owned in code, not written down',
    severity: 'gap',
    note: 'A feature’s own code calls the stage and the feature’s `aiStages` does not name it.',
  },
  'ai-stages.aiFeaturesWithoutStage': {
    title: 'AI features declaring no stage',
    severity: 'gap',
    note: 'The feature’s code imports the AI client and declares no budgeted stage.',
  },
  'ai-stages.aiFeaturesWithoutClient': {
    title: 'AI-category features with no AI client',
    severity: 'gap',
    note: 'Not a gap to close: these are deterministic features that happen to sit in the AI category, and expecting a token budget from them is the mistake this list exists to prevent.',
  },

  'feature-flags.stale': {
    title: 'Stale `flag` references',
    severity: 'contradiction',
    note: 'A feature declares a flag the flag module does not define, or one nothing in that feature’s code gates on.',
  },
  'feature-flags.unenforced': {
    title: 'Declared and never read',
    severity: 'gap',
    note: 'The flag module declares it and nothing outside that module reads it, so it gates nothing.',
  },
  'feature-flags.unclaimed': {
    title: 'Enforced in code no feature owns',
    severity: 'gap',
    note: 'The flag is enforced in a file that sits in no feature’s `codeLocations`.',
  },
  'feature-flags.partiallyGated': {
    title: 'Gating on a flag they do not declare',
    severity: 'gap',
    note: 'Reported, never failed. `flag` means the whole feature is gated, so declaring it where only one door is gated would be the lie.',
  },

  'prisma-models.stale': {
    title: 'Stale `prismaModels` references',
    severity: 'contradiction',
    note: 'A feature declares a model the schema does not define, or one no query in that feature’s code touches.',
  },
  'prisma-models.unused': {
    title: 'Declared in the schema, never queried',
    severity: 'gap',
    note: 'The schema defines the model and no query in product source names its delegate.',
  },
  'prisma-models.unclaimed': {
    title: 'Queried from code no feature owns',
    severity: 'gap',
    note: 'The model is queried, and every query site sits outside every feature’s `codeLocations`.',
  },
  'prisma-models.undeclared': {
    title: 'Queried by a feature, not written down',
    severity: 'gap',
    note: 'Expected for the shared tables: `Profile` is queried from seventeen features and `User` from fourteen, and declaring them everywhere would record ownership nobody has.',
  },

  'reachability.disagreements': {
    title: 'Records the repository contradicts',
    severity: 'contradiction',
    note: 'The module graph computes something other than what the record claims: a changed class, changed importers, an entry chain that is no longer a real path, or a path with no modules under it.',
  },
  'reachability.unrecordedOrphans': {
    title: 'Orphan modules no record names',
    severity: 'gap',
    note: 'No shipped entry point reaches these, and no reachability record accounts for them yet.',
  },
  'reachability.unrecordedCallUnused': {
    title: 'Call-unused modules no record names',
    severity: 'gap',
    note: 'Something imports the module and nothing calls what it exports.',
  },
  'reachability.deadEnds': {
    title: 'Dead ends',
    severity: 'gap',
    note: 'An orphan that still has importers — every one of them itself an orphan, since a reachable importer would make it reachable. Transitively dead rather than unimported.',
  },

  'map-references.missing': {
    title: 'Mapped paths that are not on disk',
    severity: 'contradiction',
    note: 'The map names an implementation path the tree does not have. Any move candidate shown is advisory evidence only — a name match, never written back.',
  },
  'map-references.orphaned': {
    title: 'Mapped paths nothing reaches',
    severity: 'gap',
    note: 'The path is on disk and every module under it is unreachable, so the feature owns code the product never runs.',
  },
  'map-references.labsDeclared': {
    title: 'Declared labs',
    severity: 'gap',
    note: 'Listed, not checked: nothing defines where a lab module lives until PLATFORM_TODO item 20, and guessing a directory to report it missing would invent a path.',
  },

  'category-health.withoutPathway': {
    title: 'Categories with no Live QA pathway',
    severity: 'gap',
    note: 'A product gap, not a defect. Failing on it would reward writing a pathway to quiet a number.',
  },
  'category-health.withoutLab': {
    title: 'Categories with no lab',
    severity: 'gap',
    note: 'No labs exist before PLATFORM_TODO item 20.',
  },
  'category-health.withoutTests': {
    title: 'Categories where no feature lists a test',
    severity: 'gap',
    note: 'A coverage gap in the map, recorded rather than failed.',
  },
};

/** One evidence line: a label and its values, capped and counted. */
function line(label: string, values: readonly string[], cap = INLINE_CAP): string | null {
  if (values.length === 0) return null;
  const shown = values.slice(0, cap).join(', ');
  const rest = values.length - cap;

  return `${label}: ${shown}${rest > 0 ? ` (+${rest} more)` : ''}`;
}

/** Drops the evidence lines that had nothing to say. */
function evidence(...lines: (string | null)[]): string[] {
  return lines.filter((entry): entry is string => entry !== null);
}

/**
 * Builds one group from a report list, or nothing when the list is empty.
 *
 * An empty list is not a card: a page of green cards saying "0 findings" is
 * harder to read than a page that shows the signal's counts and says it is
 * healthy once.
 */
function group<T>(
  signal: string,
  id: string,
  items: readonly T[],
  toEntry: (item: T) => DriftEntry
): DriftFindingGroup | null {
  if (items.length === 0) return null;

  const key = `${signal}.${id}`;
  const meta = GROUP_META[key];
  if (meta === undefined) {
    // Unreachable while every list below is in the table; handled rather than
    // asserted so a future list renders as itself instead of crashing a page.
    return {
      id,
      title: id,
      severity: 'gap',
      note: 'No description is registered for this list.',
      failsScan: FAILS_SCAN.has(key),
      entries: items.slice(0, ENTRY_CAP).map(toEntry),
      omitted: Math.max(0, items.length - ENTRY_CAP),
    };
  }

  return {
    id,
    title: meta.title,
    severity: meta.severity,
    note: meta.note,
    failsScan: FAILS_SCAN.has(key),
    entries: items.slice(0, ENTRY_CAP).map(toEntry),
    omitted: Math.max(0, items.length - ENTRY_CAP),
  };
}

const SEVERITY_ORDER: DriftSeverity[] = ['contradiction', 'inconsistency', 'gap'];

function assemble(
  signal: DriftSignalReport['signal'],
  counts: DriftCount[],
  groups: (DriftFindingGroup | null)[]
): DriftSignalView {
  const present = groups
    .filter((entry): entry is DriftFindingGroup => entry !== null)
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
  const meta = SIGNAL_META[signal];

  return {
    signal,
    title: meta.title,
    checks: meta.checks,
    counts,
    groups: present,
    healthy: !present.some((entry) => entry.severity !== 'gap'),
    healthyNote: meta.healthyNote,
  };
}

/* ------------------------------------------------------------------ *
 * One builder per signal. Each reads that signal's own typed fields.  *
 * ------------------------------------------------------------------ */

function surfaceEntry(finding: SurfaceFinding): DriftEntry {
  return {
    label: finding.path,
    detail: finding.kind === 'page' ? 'page' : 'route handler',
    evidence: evidence(line('claimed by', finding.claimedBy)),
  };
}

function surfaceView(report: SurfaceScanReport): DriftSignalView {
  const { summary } = report;

  return assemble(
    report.signal,
    [
      { label: 'Discovered', value: summary.total, hint: 'pages and route handlers under app/' },
      { label: 'Pages', value: summary.pages },
      { label: 'Route handlers', value: summary.routes },
      { label: 'Mapped', value: summary.mapped, hint: "a feature's codeLocations claims it" },
      { label: 'Excluded', value: summary.excluded, hint: 'an EXCLUDED entry covers it' },
      { label: 'Unmapped', value: summary.unmapped, hint: 'neither — this is drift' },
    ],
    [group(report.signal, 'unmapped', report.unmapped, surfaceEntry)]
  );
}

function testEntry(finding: TestFinding): DriftEntry {
  return {
    label: finding.path,
    detail: `${finding.classification} · asserts on ${finding.assertion === 'source-text' ? 'source text' : 'behaviour'}`,
    evidence: evidence(
      line('graph attributes it to', finding.inferredFeatures),
      line('map lists it under', finding.declaredFeatures),
      line('reaches', finding.directTargets),
      line('through a barrel', finding.barrelTargets),
      line('unresolved specifiers', finding.unresolved)
    ),
  };
}

function testView(report: TestScanReport): DriftSignalView {
  const { summary } = report;

  return assemble(
    report.signal,
    [
      { label: 'Test files', value: summary.total },
      { label: 'Mapped', value: summary.mapped, hint: 'graph and map agree' },
      { label: 'Unlisted', value: summary.unlisted, hint: 'graph finds a feature the map omits' },
      {
        label: 'Misattributed',
        value: summary.misattributed,
        hint: 'map claims what the graph rejects',
      },
      { label: 'Under no feature', value: summary.uncategorized },
      { label: 'Dead code', value: summary.deadCode, hint: 'reaches only orphaned code' },
      { label: 'Source-text', value: summary.sourceText, hint: 'asserts on source, not behaviour' },
      { label: 'Unresolvable', value: summary.unresolvable, hint: 'reaches no repo path at all' },
    ],
    [
      group(report.signal, 'stale', report.stale, (entry) => ({
        label: entry.testPath,
        detail: `listed by ${entry.featureId} · ${entry.reason}`,
        evidence: [],
      })),
      group(report.signal, 'misattributed', report.misattributed, testEntry),
      group(report.signal, 'unlisted', report.unlisted, testEntry),
      group(report.signal, 'deadCode', report.deadCode, testEntry),
      group(report.signal, 'uncategorized', report.uncategorized, testEntry),
    ]
  );
}

function pathwayEntry(finding: PathwayFinding): DriftEntry {
  return {
    label: finding.id,
    detail: `${finding.area} · ${finding.stability}${finding.requiresAuth ? ' · signs in first' : ''}`,
    evidence: evidence(
      finding.specPath === null
        ? `spec ${finding.spec} is not on disk`
        : `spec ${finding.specPath}`,
      line('claimed by', finding.claimedBy)
    ),
  };
}

function pathwayView(report: PathwayScanReport): DriftSignalView {
  const { summary } = report;

  return assemble(
    report.signal,
    [
      { label: 'Pathways', value: summary.total, hint: 'in the Live QA catalog' },
      { label: 'Mapped', value: summary.mapped, hint: 'a feature claims it' },
      { label: 'Unmapped', value: summary.unmapped, hint: 'catalogued, unclaimed' },
      { label: 'Missing spec', value: summary.missingSpec, hint: 'catalog entry, no file' },
      { label: 'Orphan specs', value: summary.orphanSpecs, hint: 'file, no catalog entry' },
      { label: 'Features with one', value: summary.featuresWithPathway },
      { label: 'Features without', value: summary.featuresWithoutPathway },
    ],
    [
      group(report.signal, 'stale', report.stale, (entry) => ({
        label: entry.pathwayId,
        detail: `claimed by ${entry.featureId} · ${entry.reason}`,
        evidence: [],
      })),
      group(report.signal, 'missingSpec', report.missingSpec, pathwayEntry),
      group(report.signal, 'orphanSpecs', report.orphanSpecs, (specPath) => ({
        label: specPath,
        detail: null,
        evidence: [],
      })),
      group(report.signal, 'unmapped', report.unmapped, pathwayEntry),
      group(
        report.signal,
        'featuresWithoutPathway',
        report.featuresWithoutPathway,
        (featureId) => ({
          label: featureId,
          detail: null,
          evidence: [],
        })
      ),
    ]
  );
}

function stageEntry(finding: AiStageFinding): DriftEntry {
  return {
    label: finding.stage,
    detail: `${finding.classification} · called from ${finding.usedBy.length} ${finding.usedBy.length === 1 ? 'file' : 'files'}`,
    evidence: evidence(
      line('used by', finding.usedBy),
      line('owned in code by', finding.inferredFeatures),
      line('declared by', finding.declaredFeatures)
    ),
  };
}

function aiStageView(report: AiStageScanReport): DriftSignalView {
  const { summary } = report;

  return assemble(
    report.signal,
    [
      { label: 'Budgeted keys', value: summary.total, hint: 'MAX_TOKENS defines them' },
      { label: 'Mapped', value: summary.mapped, hint: "a feature's code calls it" },
      { label: 'Unclaimed', value: summary.unclaimed },
      { label: 'Declared', value: summary.declared, hint: "named in a feature's aiStages" },
      { label: 'Never called', value: summary.unused },
      { label: 'AI features', value: summary.aiFeatures, hint: 'their code imports the AI client' },
      { label: 'Of those, no stage', value: summary.aiFeaturesWithoutStage },
    ],
    [
      group(report.signal, 'stale', report.stale, (entry) => ({
        label: entry.stage,
        detail: `declared by ${entry.featureId} · ${entry.reason}`,
        evidence: [],
      })),
      group(report.signal, 'unbudgetedStages', report.unbudgetedStages, (stage) => ({
        label: stage,
        detail: null,
        evidence: [],
      })),
      group(report.signal, 'unused', report.unused, stageEntry),
      group(report.signal, 'unclaimed', report.unclaimed, stageEntry),
      group(report.signal, 'undeclared', report.undeclared, stageEntry),
      group(report.signal, 'aiFeaturesWithoutStage', report.aiFeaturesWithoutStage, (id) => ({
        label: id,
        detail: null,
        evidence: [],
      })),
      group(report.signal, 'aiFeaturesWithoutClient', report.aiFeaturesWithoutClient, (id) => ({
        label: id,
        detail: null,
        evidence: [],
      })),
    ]
  );
}

function flagEntry(finding: FlagFinding): DriftEntry {
  return {
    label: finding.flag,
    detail: `${finding.classification} · enforced in ${finding.enforcedIn.length} ${finding.enforcedIn.length === 1 ? 'file' : 'files'}`,
    evidence: evidence(
      line('helpers', finding.helpers),
      line('enforced in', finding.enforcedIn),
      line('owned in code by', finding.inferredFeatures),
      line('declared by', finding.declaredFeatures)
    ),
  };
}

function flagView(report: FlagScanReport): DriftSignalView {
  const { summary } = report;

  return assemble(
    report.signal,
    [
      { label: 'Declared flags', value: summary.total, hint: 'the flag module defines them' },
      { label: 'Mapped', value: summary.mapped, hint: "enforced in a feature's code" },
      { label: 'Unclaimed', value: summary.unclaimed },
      { label: 'Claimed by a feature', value: summary.declared },
      { label: 'Unenforced', value: summary.unenforced },
      { label: 'Gated features', value: summary.gatedFeatures },
    ],
    [
      group(report.signal, 'stale', report.stale, (entry) => ({
        label: entry.flag,
        detail: `declared by ${entry.featureId} · ${entry.reason}`,
        evidence: [],
      })),
      group(report.signal, 'unenforced', report.unenforced, flagEntry),
      group(report.signal, 'unclaimed', report.unclaimed, flagEntry),
      group(report.signal, 'partiallyGated', report.partiallyGated, (entry) => ({
        label: entry.featureId,
        detail: `gates on ${entry.flag} without declaring it`,
        evidence: [],
      })),
    ]
  );
}

function modelEntry(finding: PrismaModelFinding): DriftEntry {
  return {
    label: finding.model,
    detail: `${finding.classification} · queried via \`${finding.delegate}\` in ${finding.usedBy.length} ${finding.usedBy.length === 1 ? 'file' : 'files'}`,
    evidence: evidence(
      line('queried in', finding.usedBy),
      line('owned in code by', finding.inferredFeatures),
      line('declared by', finding.declaredFeatures)
    ),
  };
}

function prismaView(report: PrismaScanReport): DriftSignalView {
  const { summary } = report;

  return assemble(
    report.signal,
    [
      { label: 'Schema models', value: summary.total },
      { label: 'Mapped', value: summary.mapped, hint: "queried from a feature's code" },
      { label: 'Unclaimed', value: summary.unclaimed },
      { label: 'Declared', value: summary.declared, hint: "named in a feature's prismaModels" },
      { label: 'Never queried', value: summary.unused },
    ],
    [
      group(report.signal, 'stale', report.stale, (entry) => ({
        label: entry.model,
        detail: `declared by ${entry.featureId} · ${entry.reason}`,
        evidence: [],
      })),
      group(report.signal, 'unused', report.unused, modelEntry),
      group(report.signal, 'unclaimed', report.unclaimed, modelEntry),
      group(report.signal, 'undeclared', report.undeclared, modelEntry),
    ]
  );
}

function reachabilityEntry(finding: ReachabilityRecordFinding): DriftEntry {
  return {
    label: finding.path,
    detail: `recorded ${finding.recordedClass} · computed ${
      finding.computedClasses.length === 0 ? 'nothing' : finding.computedClasses.join(', ')
    }`,
    evidence: evidence(
      line('disagreements', finding.disagreements),
      `${finding.moduleCount} ${finding.moduleCount === 1 ? 'module' : 'modules'} under this path`,
      finding.entryChainValid
        ? null
        : 'the recorded entry chain is no longer a real path through the repository',
      line('importers the repository no longer shows', finding.lostImporters),
      line('importers the record does not name', finding.gainedImporters),
      finding.derivedEntryChain.length > 0
        ? `shortest chain now: ${finding.derivedEntryChain.join(' → ')}`
        : null
    ),
  };
}

function reachabilityView(report: ReachabilityScanReport): DriftSignalView {
  const { summary } = report;

  return assemble(
    report.signal,
    [
      { label: 'Modules', value: summary.modules, hint: 'declaration files excluded' },
      { label: 'Entry points', value: summary.entryPoints, hint: 'walked from' },
      { label: 'Live', value: summary.live },
      { label: 'Call-unused', value: summary.moduleReachableCallUnused },
      { label: 'Orphan', value: summary.orphan },
      { label: 'Records', value: summary.records },
      { label: 'In agreement', value: summary.recordsInAgreement },
      { label: 'Unrecorded orphans', value: summary.unrecordedOrphans },
    ],
    [
      group(report.signal, 'disagreements', report.disagreements, reachabilityEntry),
      group(report.signal, 'deadEnds', report.deadEnds, (entry) => ({
        label: entry.path,
        detail: null,
        evidence: evidence(line('imported by', entry.importedBy)),
      })),
      group(report.signal, 'unrecordedOrphans', report.unrecordedOrphans, (path) => ({
        label: path,
        detail: null,
        evidence: [],
      })),
      group(report.signal, 'unrecordedCallUnused', report.unrecordedCallUnused, (path) => ({
        label: path,
        detail: null,
        evidence: [],
      })),
    ]
  );
}

function referenceEntry(finding: MapReferenceFinding): DriftEntry {
  return {
    label: finding.path,
    detail: `${finding.kind === 'excluded' ? 'EXCLUDED entry' : `codeLocation of ${finding.featureId}`} · ${finding.moduleCount} ${finding.moduleCount === 1 ? 'module' : 'modules'}`,
    evidence: evidence(
      line('unreachable modules under it', finding.orphanModules),
      ...finding.moveCandidates.map(
        (candidate) =>
          `possible move (advisory): ${candidate.path} — matched on ${candidate.strength}${
            candidate.evidence.length > 0 ? ` (${candidate.evidence.join(', ')})` : ''
          }`
      ),
      finding.moveCandidatesConsidered > finding.moveCandidates.length
        ? `${finding.moveCandidatesConsidered} candidates considered in all`
        : null
    ),
  };
}

function mapReferenceView(report: MapReferenceScanReport): DriftSignalView {
  const { summary } = report;

  return assemble(
    report.signal,
    [
      { label: 'References', value: summary.total, hint: 'codeLocations and EXCLUDED paths' },
      { label: 'Present', value: summary.present },
      { label: 'Orphaned', value: summary.orphaned, hint: 'on disk, nothing reaches it' },
      { label: 'Missing', value: summary.missing, hint: 'not on disk — this is drift' },
      { label: 'codeLocations', value: summary.codeLocations },
      { label: 'EXCLUDED', value: summary.excluded },
      { label: 'Declared labs', value: summary.labsDeclared, hint: 'unverifiable until item 20' },
      { label: 'Move candidates', value: summary.moveCandidates, hint: 'advisory name matches' },
    ],
    [
      group(report.signal, 'missing', report.missing, referenceEntry),
      group(report.signal, 'orphaned', report.orphaned, referenceEntry),
      group(report.signal, 'labsDeclared', report.labsDeclared, (declared) => ({
        label: declared,
        detail: null,
        evidence: [],
      })),
    ]
  );
}

function categoryView(report: CategoryHealthReport): DriftSignalView {
  const { summary } = report;

  return assemble(
    report.signal,
    [
      { label: 'Categories', value: summary.categories },
      { label: 'Features', value: summary.features },
      { label: 'Balanced', value: summary.balanced },
      { label: 'Large', value: summary.large, hint: `at or above ${summary.largeThreshold}` },
      { label: 'Thin', value: summary.thin, hint: `below ${summary.thinThreshold}` },
      { label: 'Empty', value: summary.empty, hint: 'no feature uses the category' },
      { label: 'Without a pathway', value: summary.categoriesWithoutPathway },
      { label: 'Without a lab', value: summary.categoriesWithoutLab },
    ],
    [
      group(report.signal, 'withoutPathway', report.withoutPathway, (category) => ({
        label: category,
        detail: null,
        evidence: [],
      })),
      group(report.signal, 'withoutTests', report.withoutTests, (category) => ({
        label: category,
        detail: null,
        evidence: [],
      })),
      group(report.signal, 'withoutLab', report.withoutLab, (category) => ({
        label: category,
        detail: null,
        evidence: [],
      })),
    ]
  );
}

/**
 * One signal, projected.
 *
 * The switch is exhaustive over `DriftSignalReport`, so a tenth signal is a
 * type error here rather than a section silently missing from the page.
 */
function viewForSignal(signal: DriftSignalReport): DriftSignalView {
  switch (signal.signal) {
    case 'product-surface':
      return surfaceView(signal);
    case 'test-attribution':
      return testView(signal);
    case 'live-qa-pathways':
      return pathwayView(signal);
    case 'ai-stages':
      return aiStageView(signal);
    case 'feature-flags':
      return flagView(signal);
    case 'prisma-models':
      return prismaView(signal);
    case 'reachability':
      return reachabilityView(signal);
    case 'map-references':
      return mapReferenceView(signal);
    case 'category-health':
      return categoryView(signal);
  }
}

function categoryRows(report: DriftReport): DriftCategoryRow[] {
  const signal = report.signals.find(
    (entry): entry is CategoryHealthReport => entry.signal === 'category-health'
  );
  if (signal === undefined) return [];

  return signal.categories.map((finding) => ({
    category: finding.category,
    features: finding.features.length,
    shipped: finding.shipped,
    flagged: finding.flagged,
    unshipped: finding.unshipped,
    deprecated: finding.deprecated,
    featuresWithTests: finding.featuresWithTests,
    featuresWithPathway: finding.featuresWithPathway,
    featuresWithLab: finding.featuresWithLab,
    contradictions: finding.contradictions,
    size: finding.size,
    regroup: finding.regroup,
  }));
}

function summarize(signals: DriftSignalView[]): DriftSummary {
  const groups = signals.flatMap((signal) => signal.groups);
  const count = (severity: DriftSeverity) =>
    groups
      .filter((entry) => entry.severity === severity)
      .reduce((total, entry) => total + entry.entries.length + entry.omitted, 0);

  return {
    signals: signals.length,
    healthySignals: signals.filter((signal) => signal.healthy).length,
    signalsWithContradictions: signals.filter((signal) =>
      signal.groups.some((entry) => entry.severity === 'contradiction')
    ).length,
    contradictions: count('contradiction'),
    inconsistencies: count('inconsistency'),
    gaps: count('gap'),
  };
}

/** Projects a report onto the view. Pure: no scan, no clock, no filesystem. */
export function toDriftView(
  report: DriftReport,
  measured: { scannedAt: string; durationMs: number }
): DriftView {
  const signals = report.signals.map(viewForSignal);

  return {
    // The scanner's own verdict, passed through. Never recomputed here.
    ok: report.ok,
    scannedAt: measured.scannedAt,
    durationMs: measured.durationMs,
    signals,
    summary: summarize(signals),
    categories: categoryRows(report),
    categoryCounts: signals.find((signal) => signal.signal === 'category-health')?.counts ?? [],
    entryCap: ENTRY_CAP,
  };
}

export type DriftViewOptions = DriftScanOptions & {
  /** Clock seam, so a test can assert a deterministic view. */
  now?: () => Date;
  /** Scanner seam. Defaults to the real `runDriftScan`. */
  scan?: (options: DriftScanOptions) => DriftReport;
};

/**
 * Runs the real scan and projects it.
 *
 * Called once per page render. The scan reads the repository every time, which
 * is the point: a browser refresh is a rescan, and nothing is cached behind the
 * page where it could go stale without saying so.
 */
export function buildDriftView(options: DriftViewOptions = {}): DriftView {
  const { now, scan, ...scanOptions } = options;
  const clock = now ?? (() => new Date());

  const startedAt = clock();
  const started = Date.now();
  const report = (scan ?? runDriftScan)(scanOptions);

  return toDriftView(report, {
    scannedAt: startedAt.toISOString(),
    durationMs: Date.now() - started,
  });
}

/** Exported for the test that pins the page's severities to the scan's `ok`. */
export const FAILING_GROUPS: readonly string[] = [...FAILS_SCAN].sort();

/** Exported so a test can assert every registered list is reachable. */
export const REGISTERED_GROUPS: readonly string[] = Object.keys(GROUP_META).sort();
