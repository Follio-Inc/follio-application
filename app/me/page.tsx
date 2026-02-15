import { db } from '@/lib/db';
import { getPortfolioPath } from '@/lib/url';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * /me redirects authenticated users to their profile or onboarding.
 * This route is hit after Clerk sign-in (including when sign-up auto-transfers
 * to sign-in for existing accounts). It should never render — only redirect.
 */
export default async function MyProfilePage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  try {
    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: {
        profile: {
          select: { handle: true },
        },
      },
    });

    if (!user?.profile?.handle) {
      redirect('/onboarding');
    }

    redirect(getPortfolioPath(user.profile.handle));
  } catch (error: unknown) {
    // Re-throw Next.js redirect errors (redirect() uses throw internally)
    if (
      error != null &&
      typeof error === 'object' &&
      'digest' in error &&
      typeof (error as Record<string, unknown>).digest === 'string' &&
      ((error as Record<string, unknown>).digest as string).startsWith('NEXT_REDIRECT')
    ) {
      throw error;
    }
    // For any DB or unexpected errors, fall back to onboarding
    // so the user never sees a blank white page
    console.error('[/me] Error looking up user, redirecting to onboarding:', error);
    redirect('/onboarding');
  }
}
