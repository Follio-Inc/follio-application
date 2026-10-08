'use client';

import { ExternalLink, FlaskConical, GitCompare, LayoutDashboard, TestTube } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

import {
  LEGACY_DEVELOPER_ROOT,
  PLATFORM_SECTIONS,
  isSectionActive,
  type PlatformSectionId,
} from '../nav';

/**
 * The Developer Platform shell: title, section nav, and a frame for whatever
 * the section renders (PLATFORM_TODO item 10).
 *
 * A client component because the active section comes from the pathname. It
 * imports the section registry and nothing else from `platform/` — in
 * particular nothing from `platform/scan/`, which reads the filesystem and
 * would not survive being bundled for a browser. Section content arrives as
 * `children` from a server component, so items 11–24 can render server data
 * inside this frame without the shell changing.
 *
 * Sits inside the existing admin shell, so this adds a section nav rather than
 * a second sidebar, and reuses the same card, border and muted-foreground
 * conventions as the rest of `/admin`.
 */

const ICONS: Record<PlatformSectionId, React.ElementType> = {
  overview: LayoutDashboard,
  labs: FlaskConical,
  tests: TestTube,
  drift: GitCompare,
};

export function PlatformShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">Developer Platform</h1>
          <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Internal
          </span>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          One place to see whether Follio is healthy, what is covered by tests, and where the
          coverage map and the repository have drifted apart.
        </p>
      </header>

      <nav aria-label="Developer Platform sections" className="mt-5 border-b">
        <ul className="-mb-px flex flex-wrap gap-1">
          {PLATFORM_SECTIONS.map((section) => {
            const Icon = ICONS[section.id];
            const isActive = isSectionActive(section, pathname);

            return (
              <li key={section.id}>
                <Link
                  href={section.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{section.label}</span>
                  {section.status === 'planned' && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Planned
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="py-6">{children}</div>

      <footer className="border-t pt-4">
        <p className="text-xs text-muted-foreground">
          The first Developer Platform is still live and unchanged at{' '}
          <Link
            href={LEGACY_DEVELOPER_ROOT}
            className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2 hover:no-underline"
          >
            {LEGACY_DEVELOPER_ROOT}
            <ExternalLink className="h-3 w-3" />
          </Link>
          . Both surfaces run side by side until this one replaces it.
        </p>
      </footer>
    </div>
  );
}
