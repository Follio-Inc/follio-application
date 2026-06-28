'use client';

/**
 * SiteHeader
 *
 * The chrome bar shown across every public profile route
 * (`/u/[handle]`, `/u/[handle]/resume`).
 *
 * Three personalities, one rule: *the chrome should belong to the
 * person looking at it, not the person being looked at.*
 *
 *   1. Logged-in viewer (owner OR authenticated user)
 *      → Identical workspace chrome to `/dashboard`. Logo, Dashboard
 *        link, avatar. The user never loses their navigation context
 *        just because they clicked into someone's resume.
 *        This mirrors how LinkedIn, Notion, and Linear behave: the
 *        signed-in nav follows you everywhere.
 *
 *   2. Anonymous viewer
 *      → Quiet marketing chrome: brand mark + "Sign in" / "Get
 *        started". They arrived via a shared link to look at a
 *        person, not the product, so the chrome doesn't shout — it
 *        just identifies the platform and offers a clear path in.
 *
 *   3. Custom-template portfolio (any auth state)
 *      → Minimal chrome (logo + auth widget only). A custom template
 *        is a designed surface; the workspace nav would fight it.
 *        Logged-in users still get to their workspace via the avatar
 *        menu's Dashboard link — they don't lose the path home,
 *        they just lose the *visual weight* of the nav.
 */

import Link from 'next/link';

import { AppHeader } from '@/components/app-header';
import { UserMenu } from '@/components/auth/user-menu';
import { DashboardTopbar } from '@/components/dashboard-sidebar';
import { Logo } from '@/components/Logo';
import { OwnerOrAuthControls } from '@/components/profile-navbar';

import type { TemplateNavbarTheme } from '@/lib/portfolio/templates/types';

type AuthState = 'owner' | 'authenticated' | 'anonymous';

interface SiteHeaderProps {
  profileHandle: string;
  authState: AuthState;
  /**
   * Template-driven theming. When set, we collapse to the minimal
   * chrome so the template's design isn't fighting our workspace
   * nav for visual attention.
   */
  navbarTheme?: TemplateNavbarTheme | null;
}

export function SiteHeader({ profileHandle, authState, navbarTheme }: SiteHeaderProps) {
  // ── Branch 3: custom-template portfolio ──────────────────────────
  // Templates are designed surfaces. The chrome stays out of the way.
  if (navbarTheme) {
    return (
      <AppHeader
        navbarTheme={navbarTheme}
        left={<Logo href="/" size="md" />}
        right={<OwnerOrAuthControls authState={authState} profileHandle={profileHandle} />}
      />
    );
  }

  // ── Branch 1: logged-in viewer ───────────────────────────────────
  // Same chrome they see on /dashboard. Predictable. Their workspace
  // travels with them.
  if (authState !== 'anonymous') {
    return (
      <DashboardTopbar>
        <UserMenu />
      </DashboardTopbar>
    );
  }

  // ── Branch 2: anonymous viewer ───────────────────────────────────
  // They came to look at a person. The chrome quietly identifies the
  // platform and offers two doors in — no nav, no noise.
  return <AppHeader left={<Logo href="/" size="md" />} right={<AnonymousActions />} />;
}

/* ──────────────────────── Anonymous actions ─────────────────────── */

/**
 * The signed-out CTA pair. Modern monochrome pair: ghost "Sign in"
 * sits next to a high-contrast "Get started" pill. Identical
 * geometry to the dashboard's nav pills so the bar still feels
 * coherent.
 */
function AnonymousActions() {
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
