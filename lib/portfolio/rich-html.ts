/**
 * Portfolio Medium-style rich HTML — constrained block formatting.
 *
 * Allowed blocks: paragraph, heading (h2/h3), quote (blockquote).
 * Allowed inline: bold, italic, underline.
 * Allowed layout: text-align left | center | right (no justify — Medium-like).
 *
 * Not allowed (keeps templates consistent): lists, links, images, tables, code.
 */

import { escapeHtml, isHtmlEmpty, stripHtmlTags } from '@/lib/html-utils';

import type DOMPurifyType from 'dompurify';

type DOMPurifyInstance = Pick<
  typeof DOMPurifyType,
  'sanitize' | 'addHook' | 'removeHook' | 'removeAllHooks'
>;

let purify: DOMPurifyInstance | null = null;

function getPurify(): DOMPurifyInstance {
  if (!purify) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    purify = require('isomorphic-dompurify') as DOMPurifyInstance;
  }
  return purify;
}

const PORTFOLIO_HTML_TAGS = [
  'p',
  'br',
  'h2',
  'h3',
  'blockquote',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'span',
] as const;

const PORTFOLIO_HTML_ATTRS = ['style', 'class'] as const;

/** True when the string already has portfolio block markup. */
export function isPortfolioRichHtml(value: string | null | undefined): boolean {
  if (!value) return false;
  return /<(?:p|h2|h3|blockquote)\b/i.test(value);
}

/** Keep only Medium-like alignments (left / center / right). */
function normalizePortfolioAlignments(html: string): string {
  return html.replace(/text-align:\s*justify/gi, 'text-align: left');
}

/**
 * Sanitize HTML from the portfolio Medium-style editor before storage or render.
 */
export function sanitizePortfolioHtml(html: string | null | undefined): string {
  if (!html) return '';
  const cleaned = getPurify().sanitize(html, {
    ALLOWED_TAGS: [...PORTFOLIO_HTML_TAGS],
    ALLOWED_ATTR: [...PORTFOLIO_HTML_ATTRS],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'srcset', 'href'],
    FORBID_TAGS: [
      'script',
      'style',
      'iframe',
      'object',
      'embed',
      'form',
      'img',
      'svg',
      'a',
      'ul',
      'ol',
      'li',
    ],
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  });
  return normalizePortfolioAlignments(cleaned);
}

/**
 * Normalize a stored portfolio long-form field.
 * - Portfolio rich HTML → sanitized HTML
 * - Plain text / resume HTML → plain text (no tags)
 */
export function toPortfolioStoredText(value: string | null | undefined): string {
  if (!value) return '';
  if (isPortfolioRichHtml(value)) {
    const cleaned = sanitizePortfolioHtml(value);
    return isHtmlEmpty(cleaned) ? '' : cleaned;
  }
  return stripHtmlTags(value).replace(/\s+/g, ' ').trim();
}

/** Empty check that understands portfolio HTML. */
export function isPortfolioTextEmpty(value: string | null | undefined): boolean {
  if (!value) return true;
  if (isPortfolioRichHtml(value)) return isHtmlEmpty(sanitizePortfolioHtml(value));
  return stripHtmlTags(value).trim().length === 0;
}

/**
 * Ensure TipTap has loadable HTML. Plain strings become a single paragraph.
 */
export function toPortfolioEditorHtml(value: string | null | undefined): string {
  if (!value || isPortfolioTextEmpty(value)) return '';
  if (isPortfolioRichHtml(value)) return sanitizePortfolioHtml(value);
  return `<p>${escapeHtml(value.trim())}</p>`;
}

/** Plain-text extraction for SEO / AI / previews. */
export function portfolioHtmlToPlainText(value: string | null | undefined): string {
  if (!value) return '';
  return stripHtmlTags(
    value.replace(/<\/(?:h2|h3|blockquote)>/gi, '\n').replace(/<(?:h2|h3|blockquote)\b[^>]*>/gi, '')
  )
    .replace(/\s+/g, ' ')
    .trim();
}
