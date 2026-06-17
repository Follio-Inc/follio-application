import { db } from '@/lib/db';

/**
 * The named "views" a share token can be restricted to. `null` / undefined
 * means no restriction.
 */
export type ShareTokenView = 'resume' | 'links' | 'portfolio';

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
  // concurrent requests — the cost is one indexed update.
  await db.shareToken.update({
    where: { id: shareToken.id },
    data: { viewCount: { increment: 1 } },
  });

  return true;
}
