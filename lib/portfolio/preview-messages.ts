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

import type { TemplatePortfolio } from './templates/types';

/** Sent by the preview iframe once it has mounted and can accept a draft. */
export const PREVIEW_READY = 'follio-preview-ready' as const;

/** Sent by the editor whenever the working draft changes. */
export const PREVIEW_DRAFT = 'follio-preview-draft' as const;

export interface PreviewReadyMessage {
  type: typeof PREVIEW_READY;
}

export interface PreviewDraftMessage {
  type: typeof PREVIEW_DRAFT;
  draft: TemplatePortfolio;
}

export type PreviewMessage = PreviewReadyMessage | PreviewDraftMessage;

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
