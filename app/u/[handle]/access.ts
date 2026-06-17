/**
 * Shared access-control helpers for public profile routes (`/u/[handle]/*`).
 *
 * The portfolio, resume, and links pages all need to:
 *  1. Determine the viewer's auth state (owner / authenticated / anonymous).
 *  2. Validate share tokens (with an optional `allowedView` constraint).
 *
 * Previously each page duplicated these helpers. They now live here, are
 * `cache()`-wrapped where it matters, and provide a single source of truth.
 */

import { cache } from 'react';

import { db } from '@/lib/db';
import { auth } from '@clerk/nextjs/server';

export type { ShareTokenView } from '@/lib/share-token';
export { validateShareToken } from '@/lib/share-token';

export type ViewerAuthState = 'owner' | 'authenticated' | 'anonymous';

/**
 * Determine the viewer's relationship to the profile identified by `handle`.
 *
 * Wrapped in `cache()` so `generateMetadata` and the page handler share a
 * single DB round-trip per request.
 */
export const getViewerAuthState = cache(async (handle: string): Promise<ViewerAuthState> => {
  try {
    const { userId } = await auth();
    if (!userId) return 'anonymous';

    const ownedProfile = await db.profile.findFirst({
      where: {
        handle,
        user: { clerkId: userId },
        isArchived: false,
      },
      select: { id: true },
    });

    return ownedProfile ? 'owner' : 'authenticated';
  } catch {
    // `auth()` can throw in edge runtimes / during prerendering. Treat any
    // failure as anonymous — access control downstream is the source of truth.
    return 'anonymous';
  }
});
