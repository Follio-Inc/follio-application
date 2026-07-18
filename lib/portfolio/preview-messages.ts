/**
 * Live Preview Messaging Contract
 *
 * The portfolio editor renders its preview in an iframe (so the template keeps
 * its own document scroll / fixed nav). To make edits feel instant — no reload,
 * no blank flash — the editor streams the working draft into that iframe via
 * `postMessage` instead of reloading it on every change.
 *
 * Both sides import these constants so the message contract never drifts.
 */

import type { TemplatePortfolio, TemplateSectionType } from './templates/types';

/** Sent by the preview iframe once it has mounted and can accept a draft. */
export const PREVIEW_READY = 'follio-preview-ready' as const;

/** Sent by the editor whenever the working draft changes. */
export const PREVIEW_DRAFT = 'follio-preview-draft' as const;

/** Sent by the preview iframe when the owner clicks a section to edit it. */
export const PREVIEW_SECTION_CLICK = 'follio-preview-section-click' as const;

/** Sent by the editor when the owner jumps to a section so the preview can scroll. */
export const PREVIEW_SCROLL_TO_SECTION = 'follio-preview-scroll-to-section' as const;

export interface PreviewReadyMessage {
  type: typeof PREVIEW_READY;
}

export interface PreviewDraftMessage {
  type: typeof PREVIEW_DRAFT;
  draft: TemplatePortfolio;
}

export interface PreviewSectionClickMessage {
  type: typeof PREVIEW_SECTION_CLICK;
  sectionId: string;
  sectionType: TemplateSectionType;
}

export interface PreviewScrollToSectionMessage {
  type: typeof PREVIEW_SCROLL_TO_SECTION;
  sectionId: string;
}

export type PreviewMessage =
  | PreviewReadyMessage
  | PreviewDraftMessage
  | PreviewSectionClickMessage
  | PreviewScrollToSectionMessage;

/** Narrowing guard for messages arriving from the preview iframe. */
export function isPreviewReadyMessage(data: unknown): data is PreviewReadyMessage {
  return (
    typeof data === 'object' && data !== null && (data as { type?: unknown }).type === PREVIEW_READY
  );
}

/** Narrowing guard for draft messages arriving from the editor. */
export function isPreviewDraftMessage(data: unknown): data is PreviewDraftMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === PREVIEW_DRAFT &&
    typeof (data as { draft?: unknown }).draft === 'object' &&
    (data as { draft?: unknown }).draft !== null
  );
}

/** Narrowing guard for section-click messages from the preview iframe. */
export function isPreviewSectionClickMessage(data: unknown): data is PreviewSectionClickMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === PREVIEW_SECTION_CLICK &&
    typeof (data as { sectionId?: unknown }).sectionId === 'string' &&
    typeof (data as { sectionType?: unknown }).sectionType === 'string'
  );
}

/** Narrowing guard for scroll-to-section messages from the editor. */
export function isPreviewScrollToSectionMessage(
  data: unknown
): data is PreviewScrollToSectionMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === PREVIEW_SCROLL_TO_SECTION &&
    typeof (data as { sectionId?: unknown }).sectionId === 'string'
  );
}
