/**
 * Share product kinds and delivery modes.
 *
 * Link-capable products:
 * - `resume` / `portfolio` — Public | Unlisted | Private
 * - `cover-letter` — Unlisted | Private only (never Public)
 *
 * Delivery:
 * - `link` — recipient opens a Follio URL
 * - `private` — PDF + email draft only (no Follio URL)
 */

/** Content that can be shared via a Follio link. */
export type LinkShareKind = 'resume' | 'portfolio' | 'cover-letter';

/**
 * How a document is shared with recipients.
 *
 * - `link` — recipient opens a Follio URL
 * - `private` — no Follio URL; share a PDF (and optional email draft)
 */
export type ShareDeliveryMode = 'link' | 'private';

/** Visibility options for cover letters (Public is intentionally omitted). */
export type RestrictedDocumentVisibility = 'PRIVATE' | 'UNLISTED';
