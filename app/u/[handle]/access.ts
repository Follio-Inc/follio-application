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

export type ViewerAuthState = 'owner' | 'authenticated' | 'anonymous';

/**
 * The named "views" a share token can be restricted to. `null` / undefined
 * means no restriction.
 */
export type ShareTokenView = 'resume' | 'links' | 'portfolio';

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
    // failure as anonymous \u2014 access control downstream is the source of truth.
    return 'anonymous';
  }
});

/**
 * Validate a share token for a given handle.
 *
 * - Returns `false` for missing/expired/exhausted tokens or if the token
 *   doesn't belong to a profile with this handle.
 * - When `allowedView` is provided, the token must either have no view
 *   restriction (`allowedView == null` on the row) or match exactly.
 * - On a successful validation the view counter is incremented so
 *   max-view limits work correctly.
 */
export async function validateShareToken(
  handle: string,
  token: string,
  allowedView?: ShareTokenView
): Promise<boolean> {
  if (!token) return false;

  const shareToken = await db.shareToken.findUnique({
    where: { token },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      maxViews: true,
      viewCount: true,
      allowedView: true,
    },
  });

  if (!shareToken) return false;

  // Token must belong to an active profile with this handle.
  const matchingProfile = await db.profile.findFirst({
    where: {
      userId: shareToken.userId,
      handle,
      isArchived: false,
    },
    select: { id: true },
  });
  if (!matchingProfile) return false;

  if (shareToken.expiresAt && shareToken.expiresAt < new Date()) return false;
  if (shareToken.maxViews && shareToken.viewCount >= shareToken.maxViews) return false;

  // View-restriction check: only enforce when caller specifies a view.
  if (allowedView && shareToken.allowedView && shareToken.allowedView !== allowedView) {
    return false;
  }

  // Increment view count. Awaited so max-view limits stay consistent across
  // concurrent requests \u2014 the cost is one indexed update.
  await db.shareToken.update({
    where: { id: shareToken.id },
    data: { viewCount: { increment: 1 } },
  });

  return true;
}
