'use client';

import Link from 'next/link';

import { AppHeader } from '@/components/app-header';
import { UserMenu } from '@/components/auth/user-menu';
import { DashboardTopbar } from '@/components/dashboard-sidebar';
import { Logo } from '@/components/Logo';

import type { TemplateNavbarTheme } from '@/lib/portfolio/templates/types';

type AuthState = 'owner' | 'authenticated' | 'anonymous';

interface ProfileNavbarProps {
  authState: AuthState;
  profileHandle?: string;
  /** When provided, forces the navbar into the template's color mode */
  navbarTheme?: TemplateNavbarTheme | null;
}

/**
 * Public profile chrome for the Links route.
 *
 * Mirrors `<SiteHeader>` so the links page behaves the same way every
 * other public surface does: a logged-in viewer sees their workspace
 * nav (so they never lose their context), an anonymous viewer sees a
 * quiet brand + sign-up chrome, and a templated portfolio gets the
 * minimal chrome so the template's design isn't fought.
 */
export function ProfileNavbar({ authState, profileHandle, navbarTheme }: ProfileNavbarProps) {
  // Templated chrome — stay out of the design's way.
  if (navbarTheme) {
    return (
      <AppHeader
        navbarTheme={navbarTheme}
        left={<Logo href="/" size="md" />}
        right={<OwnerOrAuthControls authState={authState} profileHandle={profileHandle} />}
      />
    );
  }

  // Logged-in viewer — their workspace nav travels with them.
  if (authState !== 'anonymous') {
    return (
      <DashboardTopbar>
        <UserMenu />
      </DashboardTopbar>
    );
  }

  // Anonymous — brand + the two doors in.
  return <AppHeader left={<Logo href="/" size="md" />} right={<AnonymousControls />} />;
}

/**
 * Right-aligned auth/owner control cluster.
 *
 * Reused by `SiteHeader` so that the new slim chrome and the legacy
 * `ProfileNavbar` share a single source of truth for the avatar menu,
 * dashboard button, and signed-out CTAs.
 */
export function OwnerOrAuthControls({
  authState,
}: {
  authState: AuthState;
  profileHandle?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {(authState === 'owner' || authState === 'authenticated') && <UserMenu />}
      {authState === 'anonymous' && <AnonymousControls />}
    </div>
  );
}

// --- Anonymous: subtle, modern sign-in / sign-up pair ---
function AnonymousControls() {
  return (
    <>
      <Link
        href="/sign-in"
        className="hidden h-8 items-center rounded-full px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:inline-flex"
      >
        Sign in
      </Link>
      <Link
        href="/sign-up"
        className="inline-flex h-8 items-center rounded-full bg-foreground px-3.5 text-[13px] font-medium text-background shadow-sm transition-all hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        Get started
      </Link>
    </>
  );
}
