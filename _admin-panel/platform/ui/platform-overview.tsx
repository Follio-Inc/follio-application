import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { LEGACY_DEVELOPER_ROOT, listPlatformTools } from '../nav';

/**
 * The Developer Platform home (PLATFORM_TODO item 10).
 *
 * Deliberately carries no numbers. Every figure an operator would want here —
 * how many tests pass, whether the map has drifted, how many modules are
 * unreachable — comes from running something, and running it is items 11 to 19.
 * A zero or a placeholder chart in the meantime would be a claim the platform
 * cannot back, so this page says what each section is for and which milestone
 * builds it, and nothing else.
 *
 * A server component: static markup, no state, no client bundle.
 */
export function PlatformOverview() {
  const tools = listPlatformTools();

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Where this is going</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          The coverage map and the drift scan behind this platform already run from the command line
          — <code className="rounded bg-muted px-1 py-0.5 text-xs">npm run platform:scan</code>{' '}
          reports nine signals over the repository. This surface is the shell those tools will be
          rendered into. The sections below are routed and reachable so the structure can be
          reviewed now; none of them reads the repository yet.
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Sections</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((section) => (
            <Link
              key={section.id}
              href={section.href}
              className="group flex h-full flex-col rounded-xl border bg-card p-5 shadow-sm transition-colors hover:border-foreground/20"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{section.label}</h3>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {section.status === 'available' ? 'Available' : 'Planned'}
                </span>
              </div>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{section.description}</p>
              {section.status === 'planned' && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Arrives in PLATFORM_TODO {section.deliveredBy}
                </p>
              )}
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-foreground">
                Open section
                <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Two surfaces, for now</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Nothing was taken away to build this. The first Developer Platform — health checks, the
          Vitest suite runner, Live QA, the resume reader and the smoke checklist — is still at{' '}
          <Link
            href={LEGACY_DEVELOPER_ROOT}
            className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
          >
            {LEGACY_DEVELOPER_ROOT}
          </Link>{' '}
          and is the one to use today. It is retired only once this platform covers what it does.
        </p>
      </section>
    </div>
  );
}
