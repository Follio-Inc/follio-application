import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { UserMenu } from '@/components/auth/user-menu';
import { ClientRedirect } from '@/components/client-redirect';
import { DashboardTopbar } from '@/components/dashboard-sidebar';
import { WorkspaceUnavailable } from '@/components/workspace-unavailable';
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
    return <WorkspaceUnavailable />;
  }

  if (!onboarded) {
    return <ClientRedirect href="/onboarding" message="Continuing your setup…" />;
  }

  return (
    // One viewport-sized surface. The shell is pinned so the page behind it
    // (white) cannot show as a second background, and only <main> scrolls.
    // Without min-h-0, the flex child grows with its content and the window
    // scrolls as well — a wheel over the gray area then moves the resume
    // inside that box and clips a thumbnail against the gray/white seam.
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-muted/30">
      <DashboardTopbar>
        <UserMenu />
      </DashboardTopbar>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">{children}</main>
    </div>
  );
}
