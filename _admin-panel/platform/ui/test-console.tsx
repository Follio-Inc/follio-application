import type {
  CategoryTests,
  FeatureTests,
  TestInventory,
  UnattributedReason,
  UnattributedTest,
} from '../tests/types';

/**
 * The Test Console's read-only inventory view (PLATFORM_TODO item 11).
 *
 * A server component that renders a prop. It imports the inventory's **types**
 * only, so the module that walks `__tests__` cannot follow it into a browser
 * bundle; the route shim builds the data and passes it down.
 *
 * Everything on this page is either a path, a name or a count of the rows
 * beside it. There is no result, no duration, no last run and no pass rate,
 * because nothing has been run — item 12 adds that. There are no controls for
 * the same reason: a disabled run button would imply the feature exists.
 */

const REASON_HEADINGS: Record<UnattributedReason, { title: string; note: string }> = {
  'covers-unreachable-code': {
    title: 'Covers code nothing reaches',
    note: 'The coverage map records these against a module no shipped entry point reaches, so they are deliberately listed under no feature. Attaching them to one would claim coverage of code the product never runs.',
  },
  'no-feature-listed': {
    title: 'Listed under no feature',
    note: 'Shared infrastructure and the Developer Platform’s own tests. The map explains each one rather than giving it an owner it does not have — see the header of `coverage-map/map.ts`.',
  },
};

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}

function TestPath({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
      {children}
    </code>
  );
}

function FeatureRow({ feature }: { feature: FeatureTests }) {
  return (
    <div className="border-t px-5 py-4 first:border-t-0">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold">{feature.name}</h4>
        <code className="font-mono text-xs text-muted-foreground">{feature.id}</code>
        <Pill>{feature.status}</Pill>
        {feature.flag && (
          <span className="font-mono text-[10px] text-muted-foreground">{feature.flag}</span>
        )}
      </div>

      <div className="mt-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Unit tests{feature.unitTests.length > 0 && ` (${feature.unitTests.length})`}
        </p>
        {feature.unitTests.length === 0 ? (
          <p className="mt-1.5 text-sm text-muted-foreground">
            No unit tests mapped. The map lists none for this feature, which is a gap in coverage
            and not a result.
          </p>
        ) : (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {feature.unitTests.map((test) => (
              <li key={test.path} className="flex items-center gap-1.5">
                <TestPath>{test.path}</TestPath>
                {test.shared && (
                  <span className="text-[10px] text-muted-foreground">
                    also under {test.listedBy.filter((id) => id !== feature.id).join(', ')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Live QA pathways{feature.pathways.length > 0 && ` (${feature.pathways.length})`}
        </p>
        {feature.pathways.length === 0 ? (
          <p className="mt-1.5 text-sm text-muted-foreground">
            No Live QA pathway mapped. Most areas have no browser coverage yet.
          </p>
        ) : (
          <ul className="mt-1.5 space-y-1">
            {feature.pathways.map((pathway) => (
              <li key={pathway.id} className="flex flex-wrap items-center gap-2 text-sm">
                <code className="font-mono text-xs text-foreground">{pathway.id}</code>
                <span className="text-muted-foreground">{pathway.title}</span>
                <Pill>{pathway.area}</Pill>
                <Pill>{pathway.stability}</Pill>
                {pathway.requiresAuth && <Pill>auth</Pill>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CategorySection({ entry }: { entry: CategoryTests }) {
  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-4">
        <h3 className="text-sm font-semibold">{entry.category}</h3>
        <p className="text-xs text-muted-foreground">
          {entry.features.length} {entry.features.length === 1 ? 'feature' : 'features'} ·{' '}
          {entry.uniqueTestFiles} unit {entry.uniqueTestFiles === 1 ? 'test' : 'tests'} ·{' '}
          {entry.uniquePathways} {entry.uniquePathways === 1 ? 'pathway' : 'pathways'}
        </p>
      </header>

      {entry.features.length === 0 ? (
        <p className="border-t px-5 py-4 text-sm text-muted-foreground">
          No feature uses this category. It is declared in the map and currently unused.
        </p>
      ) : (
        <div>
          {entry.features.map((feature) => (
            <FeatureRow key={feature.id} feature={feature} />
          ))}
        </div>
      )}
    </section>
  );
}

function UnattributedGroup({
  reason,
  entries,
}: {
  reason: UnattributedReason;
  entries: UnattributedTest[];
}) {
  const heading = REASON_HEADINGS[reason];

  return (
    <div className="border-t px-5 py-4 first:border-t-0">
      <h4 className="text-sm font-semibold">
        {heading.title} ({entries.length})
      </h4>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{heading.note}</p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {entries.map((entry) => (
          <li key={entry.path} className="flex items-center gap-1.5">
            <TestPath>{entry.path}</TestPath>
            {entry.recordedAgainst && (
              <span className="font-mono text-[10px] text-muted-foreground">
                {entry.recordedAgainst}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TestConsole({ inventory }: { inventory: TestInventory }) {
  const { summary } = inventory;
  const reasons: UnattributedReason[] = ['covers-unreachable-code', 'no-feature-listed'];
  const grouped = reasons
    .map((reason) => ({
      reason,
      entries: inventory.unattributed.filter((entry) => entry.reason === reason),
    }))
    .filter((group) => group.entries.length > 0);

  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">Tests</h2>
          <Pill>Read-only</Pill>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Every test file in the repository and every Live QA pathway in the catalog, grouped by the
          feature the coverage map says it covers. Categories and ownership come from the map, so
          this list cannot disagree with what the drift scan checks. Nothing here has been run —
          running a category arrives in PLATFORM_TODO item 12.
        </p>
      </header>

      <section>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Count label="Categories" value={summary.categories} />
          <Count label="Features" value={summary.features} />
          <Count label="Test files" value={summary.testFiles} />
          <Count label="Mapped to a feature" value={summary.attributedTestFiles} />
          <Count label="Under no feature" value={summary.unattributedTestFiles} />
          <Count label="Live QA pathways" value={summary.pathways} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Counts are of the rows below, read from the map and the `__tests__` directory at page
          load.
          {summary.featureAssignments !== summary.attributedTestFiles && (
            <>
              {' '}
              Features list {summary.featureAssignments} assignments across{' '}
              {summary.attributedTestFiles} distinct files, because {summary.sharedTestFiles}{' '}
              {summary.sharedTestFiles === 1 ? 'file is' : 'files are'} shared by more than one
              feature and appear under each.
            </>
          )}
          {summary.featuresWithoutUnitTests > 0 && (
            <>
              {' '}
              {summary.featuresWithoutUnitTests} of {summary.features} features list no unit test.
            </>
          )}
        </p>
      </section>

      <div className="space-y-4">
        {inventory.categories.map((entry) => (
          <CategorySection key={entry.category} entry={entry} />
        ))}
      </div>

      {grouped.length > 0 && (
        <section className="rounded-xl border bg-card shadow-sm">
          <header className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-4">
            <h3 className="text-sm font-semibold">
              Under no feature ({summary.unattributedTestFiles})
            </h3>
            <p className="text-xs text-muted-foreground">
              Shown, not hidden — a test the map does not account for is the thing worth seeing.
            </p>
          </header>
          {grouped.map((group) => (
            <UnattributedGroup key={group.reason} reason={group.reason} entries={group.entries} />
          ))}
        </section>
      )}

      {inventory.unclaimedPathways.length > 0 && (
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold">
            Pathways no feature claims ({inventory.unclaimedPathways.length})
          </h3>
          <ul className="mt-2 space-y-1">
            {inventory.unclaimedPathways.map((pathway) => (
              <li key={pathway.id} className="flex flex-wrap items-center gap-2 text-sm">
                <code className="font-mono text-xs text-foreground">{pathway.id}</code>
                <span className="text-muted-foreground">{pathway.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {inventory.missingTestFiles.length > 0 && (
        <section className="rounded-xl border border-dashed bg-card p-5">
          <h3 className="text-sm font-semibold">
            Listed by a feature, not on disk ({inventory.missingTestFiles.length})
          </h3>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            The map claims coverage from a file that is not there. This is drift, not a gap, and
            `npm run platform:scan` fails on it.
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {inventory.missingTestFiles.map((test) => (
              <li key={test.path} className="flex items-center gap-1.5">
                <TestPath>{test.path}</TestPath>
                <span className="text-[10px] text-muted-foreground">
                  {test.listedBy.join(', ')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
