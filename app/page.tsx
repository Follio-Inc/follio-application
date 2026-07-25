import { auth } from '@clerk/nextjs/server';

import { ClientRedirect } from '@/components/client-redirect';
import { LandingPage } from '@/components/landing-page';
import { hasOnboardedProfile } from '@/lib/active-profile';

// Prevent caching during auth state changes
export const dynamic = 'force-dynamic';

/**
 * Marketing root.
 *
 * Anonymous visitors see the landing page.
 *
 * Authenticated users are routed with a full-document client redirect so soft
 * navigations after sign-in do not land on a blank page (a known App Router
 * issue when server `redirect()` runs during client transitions).
 */
export default async function HomePage() {
  let userId: string | null = null;

  try {
    const { userId: authUserId } = await auth();
    userId = authUserId;
  } catch {
    // Auth might fail during sign-out transition — treat as logged out.
    userId = null;
  }

  if (userId) {
    let onboarded = false;
    try {
      onboarded = await hasOnboardedProfile(userId);
    } catch {
      return <ClientRedirect href="/onboarding" message="Continuing your setup…" />;
    }

    if (!onboarded) {
      return <ClientRedirect href="/onboarding" message="Continuing your setup…" />;
    }

    return <ClientRedirect href="/dashboard" message="Opening your workspace…" />;
  }

  return <LandingPage />;
}
