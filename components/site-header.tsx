'use client';

/**
 * SiteHeader
 *
 * Authenticated workspace chrome for public profile routes
 * (`/u/[handle]`, `/u/[handle]/resume`).
 *
 * Anonymous visitors see no top bar — branding and sign-up live in
 * `<PublicProfileFooter>` instead (see `<PublicProfileChrome>`).
 *
 * Logged-in viewers (owner or any authenticated user) get the same
 * dashboard top bar they see on `/dashboard`, so navigation context
 * never disappears when opening a shared link.
 */

import { UserMenu } from '@/components/auth/user-menu';
import { DashboardTopbar } from '@/components/dashboard-sidebar';

type AuthState = 'owner' | 'authenticated' | 'anonymous';

interface SiteHeaderProps {
  authState: AuthState;
  className?: string;
}

export function SiteHeader({ authState, className }: SiteHeaderProps) {
  if (authState === 'anonymous') {
    return null;
  }

  return (
    <DashboardTopbar className={className}>
      <UserMenu />
    </DashboardTopbar>
  );
}
