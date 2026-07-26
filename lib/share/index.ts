/**
 * Document share foundation.
 *
 * One UI: `components/share-dialog` (`ShareDialog`) for resume, portfolio,
 * and cover letter. Cover letters omit Public (Unlisted | Private only).
 *
 * Shared here: message builders, email subjects, webmail compose, clipboard.
 * Backend differs by product:
 * - Resume / portfolio → `/api/profile` + `/api/profile/unlisted-key`
 * - Cover letter → `/api/cover-letters/[id]` + `…/unlisted-key`
 */

export type { LinkShareKind, RestrictedDocumentVisibility, ShareDeliveryMode } from './types';

export {
  buildLinkShareEmailSubject,
  buildLinkShareMessage,
  buildPrivateDocumentShareEmailSubject,
  buildPrivateDocumentShareMessage,
} from './messages';

export { copyTextToClipboard } from './clipboard';

export {
  WEBMAIL_PROVIDERS,
  detectWebmailProvider,
  openWebmailCompose,
  type WebmailProvider,
} from './webmail';
