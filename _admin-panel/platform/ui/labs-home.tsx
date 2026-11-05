import Link from 'next/link';

import { cn } from '@/lib/utils';

import type { LabCategory, LabFeature, LabStatus, LabsView } from '../labs/types';

import { platformAction } from './action-styles';

/**
 * Labs home: every feature, and whether it has a workbench
 * (PLATFORM_TODO item 20).
 *
 * A server component that renders a prop, like the Test Console's inventory.
 * It imports the Labs module's **types** only, and there is nothing to import
 * anyway — the view is derived from the coverage map and the implementation
 * registry, both of which are typed data.
 *
 * Read-only, and an index. Nothing here uploads, runs, parses or calls an AI
 * stage; the Resume Lab is item 21 and the rest are 22–24.
 *
 * The rule the page is built around: **a declared lab is not a lab.** A
 * feature whose map entry names one is shown as planned, in plain words, with
 * no link — because the route does not exist and a link to it would be the
 * only broken thing on the page.
 */

const STATUS_LABELS: Record<LabStatus, string> = {
  available: 'Lab available',
  planned: 'Lab planned',
  none: 'No lab declared',
};

function Count({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
      {hint !== undefined && (
        <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: LabStatus }) {
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        status === 'available' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
        status === 'planned' && 'bg-amber-500/10 text-amber-700 dark:text-amber-500',
        status === 'none' && 'bg-muted text-muted-foreground'
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function FeatureRow({ feature }: { feature: LabFeature }) {
  return (
    <li className="border-t px-5 py-4 first:border-t-0">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold">{feature.name}</h4>
        <code className="font-mono text-xs text-muted-foreground">{feature.id}</code>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {feature.featureStatus}
        </span>
        <StatusPill status={feature.status} />
      </div>

      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{feature.userDescription}</p>

      <p className="mt-1 text-xs text-muted-foreground">
        {feature.status === 'available' && feature.route !== null && (
          <span className="flex flex-wrap items-center gap-2">
            <Link href={feature.route} className={platformAction()}>
              Open the {feature.labId} lab
            </Link>
            <code className="font-mono">{feature.route}</code>
          </span>
        )}
        {feature.status === 'planned' && (
          <>
            The map declares <code className="font-mono">{feature.labId}</code> and nothing
            implements it yet, so there is nowhere to go. Not linked, because the route does not
            exist.
          </>
        )}
        {feature.status === 'none' && (
          <>
            No <code className="font-mono">lab</code> in this feature&rsquo;s map entry. Not a gap:
            a workbench earns its place by showing something a test cannot.
          </>
        )}
      </p>
    </li>
  );
}

function CategorySection({ entry }: { entry: LabCategory }) {
  const withLab = entry.features.filter((feature) => feature.labId !== null).length;

  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-4">
        <h3 className="text-sm font-semibold">{entry.category}</h3>
        <p className="text-xs text-muted-foreground">
          {entry.features.length} {entry.features.length === 1 ? 'feature' : 'features'} · {withLab}{' '}
          with a lab declared
        </p>
      </header>

      {entry.features.length === 0 ? (
        <p className="border-t px-5 py-4 text-sm text-muted-foreground">
          No feature uses this category. It is declared in the map and currently unused.
        </p>
      ) : (
        <ul>
          {entry.features.map((feature) => (
            <FeatureRow key={feature.id} feature={feature} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function LabsHome({ view }: { view: LabsView }) {
  const { summary } = view;

  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">Labs</h2>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Index
          </span>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Every feature the coverage map declares, and whether it has a workbench. A lab runs a real
          pipeline against a fixture and shows what happened at each stage — without writing to a
          profile. The feature names, categories, statuses and descriptions below are the
          map&rsquo;s; this page adds one fact per feature, which is whether its lab exists yet.
        </p>
      </header>

      <section>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Count label="Features" value={summary.features} />
          <Count label="Labs declared" value={summary.withLab} hint="the map names one" />
          <Count label="Available" value={summary.available} hint="built and routed" />
          <Count label="Planned" value={summary.planned} hint="declared, not built" />
          <Count label="No lab" value={summary.none} />
        </div>
        <p className="mt-2 max-w-3xl text-xs text-muted-foreground">
          {summary.available === 0 ? (
            <>
              <strong>No lab is built yet.</strong> The {summary.planned}{' '}
              {summary.planned === 1 ? 'feature' : 'features'} below marked planned declare one in
              the map, which is a statement of intent and not an implementation — PLATFORM_TODO
              items 21–24 build them. A lab appears here as available only once it is routed under{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-[10px]">{view.labsRoot}</code>.
            </>
          ) : (
            <>
              {summary.available} of {summary.withLab} declared{' '}
              {summary.withLab === 1 ? 'lab is' : 'labs are'} built and routed under{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-[10px]">{view.labsRoot}</code>. A
              planned one is listed without a link, because its route does not exist.
            </>
          )}
        </p>
      </section>

      {view.problems.length > 0 && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
          <h3 className="text-sm font-semibold">
            The map and the registry disagree ({view.problems.length})
          </h3>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Reported rather than resolved — inventing an owner for a lab nobody declares would be
            the same mistake the drift page refuses to make for an unmapped file.
          </p>
          <ul className="mt-2 space-y-1">
            {view.problems.map((problem) => (
              <li key={problem.detail} className="text-sm text-muted-foreground">
                <code className="font-mono text-[11px]">{problem.kind}</code> — {problem.detail}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="space-y-4">
        {view.categories.map((entry) => (
          <CategorySection key={entry.category} entry={entry} />
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Read-only. Nothing on this page uploads a file, runs a pipeline or calls an AI stage: the
        Resume Lab is PLATFORM_TODO item 21, and the labs after it are 22&ndash;24.
      </p>
    </div>
  );
}
