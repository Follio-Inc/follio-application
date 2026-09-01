/**
 * Doors are the deeper views reachable from a Follio: the resume and the work
 * page. Each honors its own visibility setting so a person can share their
 * Follio publicly while keeping the resume behind a link.
 */

type AuthState = 'owner' | 'authenticated' | 'anonymous';

function isReachable(
  visibility: string | null | undefined,
  authState: AuthState,
  hasUnlistedAccess: boolean
): boolean {
  if (authState === 'owner') return true;
  if (visibility === 'PUBLIC') return true;
  return visibility === 'UNLISTED' && hasUnlistedAccess;
}

/**
 * Dashboard iframe of the live Follio. Access still uses the owner session so
 * unpublished pages load; doors and chrome must look like a stranger's visit.
 */
export function embedAsVisitor(): { authState: AuthState; hasUnlistedAccess: boolean } {
  return { authState: 'anonymous', hasUnlistedAccess: false };
}

/** Whether a visitor (or owner previewing as visitor) should see the Resume door. */
export function canShowResumeDoor(
  resumeVisibility: string | null | undefined,
  authState: AuthState,
  hasUnlistedAccess: boolean
): boolean {
  return isReachable(resumeVisibility, authState, hasUnlistedAccess);
}

/** Whether a visitor should see the Work door. */
export function canShowWorkDoor(
  portfolioEnabled: boolean,
  portfolioVisibility: string | null | undefined,
  authState: AuthState,
  hasUnlistedAccess: boolean
): boolean {
  if (!portfolioEnabled) return false;
  return isReachable(portfolioVisibility, authState, hasUnlistedAccess);
}
