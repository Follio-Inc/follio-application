import Link from 'next/link';

import { PLATFORM_ROOT, getPlatformSection, type PlatformSectionId } from '../nav';

/**
 * A routed section that has no implementation yet (PLATFORM_TODO item 10).
 *
 * Item 10 is the shell: Labs, Tests and Drift are real routes so the navigation
 * can be wired and reviewed, and each one says plainly that it is empty and
 * which milestone fills it. No skeleton rows, no zeroed counters, no sample
 * data — an empty state that looks like a loaded one is worse than an honest
 * blank, because the next person cannot tell which it is.
 *
 * Items 11–24 replace the call to this component in the section's page shim.
 * Nothing else about the section has to change.
 *
 * A server component: static markup from the section registry.
 */
export function PlatformSectionPlaceholder({ id }: { id: PlatformSectionId }) {
  const section = getPlatformSection(id);

  if (!section) {
    // Unreachable through the routed pages, which pass a literal id the type
    // checker has already narrowed. Handled rather than asserted so a future
    // caller gets a usable page instead of a crash.
    return (
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Unknown section</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          No section is registered as{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">{id}</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">{section.label}</h2>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Not built yet
          </span>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{section.description}</p>
      </header>

      <section className="rounded-xl border border-dashed bg-card p-5">
        <h3 className="text-sm font-semibold">Nothing here yet</h3>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          This section is routed and reachable so the platform shell can be wired up, and it reports
          nothing because it reads nothing. It arrives in PLATFORM_TODO {section.deliveredBy}.
        </p>

        {section.plan.length > 0 && (
          <>
            <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              What it will show
            </h4>
            <ul className="mt-2 space-y-1.5">
              {section.plan.map((entry) => (
                <li key={entry} className="flex gap-2 text-sm text-muted-foreground">
                  <span aria-hidden className="select-none text-muted-foreground/60">
                    —
                  </span>
                  <span>{entry}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <Link
        href={PLATFORM_ROOT}
        className="inline-flex text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground hover:no-underline"
      >
        Back to the platform overview
      </Link>
    </div>
  );
}
