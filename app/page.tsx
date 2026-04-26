import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { LandingPage } from '@/components/landing-page';
import { resolveActiveProfileContextOrNull } from '@/lib/active-profile';

// Prevent caching during auth state changes
export const dynamic = 'force-dynamic';

/**
 * Marketing root.
 *
 * Anonymous visitors see the landing page.
 *
 * Authenticated users are sent to the Dashboard — their workspace home.
 * Earlier versions redirected logged-in users straight to their public
 * profile (`/u/[handle]`), which made the product feel like it had no
 * "inside" and stranded users away from their editing surface.
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
    const context = await resolveActiveProfileContextOrNull(userId);
    if (!context) {
      redirect('/onboarding');
    }
    redirect('/dashboard');
  }

  return <LandingPage />;
}
