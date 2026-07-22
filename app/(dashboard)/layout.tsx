import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { UserMenu } from '@/components/auth/user-menu';
import { ClientRedirect } from '@/components/client-redirect';
import { DashboardTopbar } from '@/components/dashboard-sidebar';
import { hasOnboardedProfile } from '@/lib/active-profile';

// Auth + onboarding state must not be cached — abandoned signups would
// otherwise flash an empty dashboard shell before a soft redirect.
export const dynamic = 'force-dynamic';

/**
 * Hard gate for the authenticated workspace.
 *
 * Incomplete accounts (no Profile) never get dashboard chrome. We use a
 * full-document client redirect instead of next/navigation `redirect()` so
 * soft navigations do not collapse into a blank page.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  let onboarded = false;
  try {
    onboarded = await hasOnboardedProfile(userId);
  } catch {
    // Fail closed: send them to onboarding rather than a blank shell.
    return <ClientRedirect href="/onboarding" message="Continuing your setup…" />;
  }

  if (!onboarded) {
    return <ClientRedirect href="/onboarding" message="Continuing your setup…" />;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-muted/30">
      <DashboardTopbar>
        <UserMenu />
      </DashboardTopbar>

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
