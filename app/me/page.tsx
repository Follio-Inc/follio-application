import { db } from '@/lib/db';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * /me now redirects to /u/[handle].
 * Profile viewing is unified under /u/[handle] — the navbar adapts based on auth state.
 */
export default async function MyProfilePage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

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

  redirect(`/u/${user.profile.handle}`);
}
