/**
 * Pure share-message and email-subject builders.
 * UI dialogs compose these; they must not invent copy inline.
 */

import type { LinkShareKind } from './types';

function signOff(firstName: string | null | undefined): string {
  return firstName?.trim() || '';
}

function contentLabelForKind(kind: LinkShareKind): string {
  if (kind === 'portfolio') return 'portfolio';
  if (kind === 'cover-letter') return 'cover letter';
  return 'resume';
}

/**
 * Default message when a share URL exists (resume / portfolio / unlisted cover letter).
 * Always includes the URL on its own line.
 */
export function buildLinkShareMessage(
  firstName: string | null | undefined,
  shareUrl: string,
  kind: LinkShareKind
): string {
  const contentLabel = contentLabelForKind(kind);
  return [
    'Hi,',
    '',
    `I'd love to share my ${contentLabel} with you. You can view it here:`,
    shareUrl,
    '',
    'Best,',
    signOff(firstName),
  ].join('\n');
}

/**
 * Default message for private documents (e.g. cover letter when PRIVATE).
 * Must never include a Follio / public URL.
 */
export function buildPrivateDocumentShareMessage(
  firstName: string | null | undefined,
  documentLabel: string
): string {
  return [
    'Hi,',
    '',
    `I'm sharing my ${documentLabel} with you as a PDF attachment (or I'll send it separately).`,
    '',
    'Best,',
    signOff(firstName),
  ].join('\n');
}

/** Email subject for link-based share. */
export function buildLinkShareEmailSubject(
  firstName: string | null | undefined,
  kind: LinkShareKind
): string {
  const contentLabel = contentLabelForKind(kind);
  const name = firstName?.trim();
  return name ? `${name} shared a ${contentLabel} with you` : `Shared a ${contentLabel} with you`;
}

/** Email subject for private document share (title preferred). */
export function buildPrivateDocumentShareEmailSubject(
  title: string | null | undefined,
  documentLabel: string
): string {
  const trimmed = title?.trim();
  return trimmed || `My ${documentLabel}`;
}
