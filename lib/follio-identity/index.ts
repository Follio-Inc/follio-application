/**
 * Note: `./qr` is deliberately not re-exported here — it pulls in a Node-only
 * dependency. Server components import it directly from '@/lib/follio-identity/qr'.
 */
export { buildFollioIdentity, condense, formatDuration, toDialString } from './build-identity';
export type { BuildFollioIdentityOptions } from './build-identity';
export { cloakContactValue, unveilContactValue } from './cloak';
export { splitFollioLinks } from './links';
export type { SplitFollioLinks } from './links';
export {
  FOLLIO_VOICE,
  rewriteAbout,
  rewriteEducationNote,
  rewriteExtras,
  rewriteHeadline,
  rewriteHighlights,
} from './voice';
export { canShowResumeDoor, canShowWorkDoor, embedAsVisitor } from './doors';
export {
  canOpenFollioPage,
  getFollioVisibility,
  isFollioPublic,
  profileStatusForVisibility,
} from './page-access';
export type { FollioPageAccessInput, FollioPageOpenInput, FollioVisibility } from './page-access';
export { getFollioCompleteness } from './completeness';
export { follioCardActions, follioCardDoors, follioCardFacts } from './card';
export type {
  FollioCardAction,
  FollioCardDoor,
  FollioCardDoorAction,
  FollioCardFact,
} from './card';
export { formatArrangement, highlightLines } from './depth';
export { buildVCard, vcardFilename } from './vcard';
export type { FollioVCardInput } from './vcard';
export type {
  FollioCompleteness,
  FollioCompletenessInput,
  FollioContact,
  FollioCurrentRole,
  FollioDoors,
  FollioEducationItem,
  FollioExperienceItem,
  FollioIdentity,
  FollioLink,
  FollioLinkKind,
} from './types';
