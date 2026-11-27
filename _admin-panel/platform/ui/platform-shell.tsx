'use client';

import { ExternalLink, FlaskConical, GitCompare, LayoutDashboard, TestTube } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { PlatformRole } from '../auth/types';

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

/**
 * What each role may do, in one sentence (item 28).
 *
 * Shown next to the badge so an operator who cannot see a control knows why,
 * rather than assuming the platform is broken.
 */
const ROLE_SUMMARY: Record<PlatformRole, string> = {
  viewer: 'read-only — you can inspect everything and run nothing',
  runner: 'you can run tests, Live QA and the labs, but not quarantine or delete',
  maintainer: 'full access, including quarantine, delete and role assignment',
};

export function PlatformShell({
  children,
  role,
}: {
  children: React.ReactNode;
  /** The signed-in admin's Platform role. Null when it could not be read. */
  role?: PlatformRole | null;
}) {
  const pathname = usePathname();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">Developer Platform</h1>
          <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Internal
          </span>
          {role !== undefined && (
            <span
              className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium"
              title={
                role === null
                  ? 'Your Platform role could not be read, so no action will be permitted.'
                  : ROLE_SUMMARY[role]
              }
            >
              {role ?? 'role unavailable'}
            </span>
          )}
        </div>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          One place to see whether Follio is healthy, what is covered by tests, and where the
          coverage map and the repository have drifted apart.
        </p>
      </header>

      <nav aria-label="Developer Platform sections" className="mt-5">
        <ul className="inline-flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
          {PLATFORM_SECTIONS.map((section) => {
            const Icon = ICONS[section.id];
            const isActive = isSectionActive(section, pathname);

            return (
              <li key={section.id}>
                <Link
                  href={section.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    isActive
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'text-muted-foreground hover:bg-background hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{section.label}</span>
                  {section.status === 'planned' && (
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        isActive
                          ? 'bg-primary-foreground/20 text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
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
