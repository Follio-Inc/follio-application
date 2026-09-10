/**
 * Follio visibility is Public, Unlisted, or Private — the same three states as
 * the attached resume. They are stored together (`resumeVisibility` + `status`)
 * so the identity page and the resume cannot drift.
 */

export type FollioVisibility = 'PUBLIC' | 'UNLISTED' | 'PRIVATE';

export type FollioPageAccessInput = {
  status?: string | null;
  resumeVisibility?: string | null;
};

/**
 * Shared visibility for the Follio and its attached resume.
 *
 * `resumeVisibility` is the source of truth. A legacy public `status` with a
 * private resume still reads as Public until the next write heals both fields.
 */
export function getFollioVisibility(input: FollioPageAccessInput): FollioVisibility {
  if (input.resumeVisibility === 'UNLISTED') return 'UNLISTED';
  if (input.resumeVisibility === 'PUBLIC') return 'PUBLIC';
  if (input.status === 'PUBLIC') return 'PUBLIC';
  return 'PRIVATE';
}

/** Profile.status only has PUBLIC | PRIVATE | DRAFT — Unlisted Follios are not PUBLIC. */
export function profileStatusForVisibility(visibility: FollioVisibility): 'PUBLIC' | 'PRIVATE' {
  return visibility === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE';
}

export function isFollioPublic(input: FollioPageAccessInput): boolean {
  return getFollioVisibility(input) === 'PUBLIC';
}

export type FollioPageOpenInput = FollioPageAccessInput & {
  isOwner: boolean;
  hasShareAccess?: boolean;
};

/**
 * Who may open `/u/{handle}`.
 *
 * - Public: anyone
 * - Unlisted: people with the share key or token
 * - Private: owner only
 */
export function canOpenFollioPage(input: FollioPageOpenInput): boolean {
  if (input.isOwner) return true;
  const visibility = getFollioVisibility(input);
  if (visibility === 'PUBLIC') return true;
  if (visibility === 'UNLISTED' && Boolean(input.hasShareAccess)) return true;
  return false;
}
