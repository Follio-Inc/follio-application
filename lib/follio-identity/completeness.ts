import { getFollioVisibility } from './page-access';
import type { FollioCompleteness, FollioCompletenessInput } from './types';

/**
 * What the owner still needs before the Follio is a confident first impression.
 */
export function getFollioCompleteness(input: FollioCompletenessInput): FollioCompleteness {
  const hasName = Boolean(input.firstName?.trim() || input.lastName?.trim());
  const hasPhoto = Boolean(input.avatarUrl?.trim());
  const hasHeadline = Boolean(input.headline?.trim());
  const hasPublicContact = Boolean(
    (input.email?.trim() && input.emailPublic) || (input.phone?.trim() && input.phonePublic)
  );
  const visibility = getFollioVisibility({
    status: input.status,
    resumeVisibility: input.resumeVisibility,
  });
  const isPublic = visibility === 'PUBLIC';
  const isShareable = visibility !== 'PRIVATE';

  const missing: string[] = [];
  if (!hasName) missing.push('Add your name');
  if (!hasHeadline) missing.push('Add a one-line headline');
  if (!hasPhoto) missing.push('Add a photo');
  if (!hasPublicContact) missing.push('Make email or phone visible to visitors');
  if (!isShareable) missing.push('Set your Follio to Public or Unlisted so the link works');

  return {
    hasName,
    hasPhoto,
    hasHeadline,
    hasPublicContact,
    isPublic,
    readyToShare: hasName && isShareable,
    missing,
  };
}
