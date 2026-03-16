import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { LandingPage } from '@/components/landing-page';
import { resolveActiveProfileContextOrNull } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { getPortfolioPath } from '@/lib/url';

// Prevent caching during auth state changes
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let userId: string | null = null;

  try {
    const { userId: authUserId } = await auth();
    userId = authUserId;
  } catch {
    // Auth might fail during sign-out transition, treat as logged out
    userId = null;
  }

  // If user is logged in, redirect to their Follio profile
  if (userId) {
    const context = await resolveActiveProfileContextOrNull(userId);
    if (!context) {
      redirect('/onboarding');
    }

    const activeProfile = await db.profile.findUnique({
      where: { id: context.profileId },
      select: { handle: true },
    });

    if (!activeProfile?.handle) {
      redirect('/onboarding');
    }

    redirect(getPortfolioPath(activeProfile.handle));
  }

  return <LandingPage />;
}
