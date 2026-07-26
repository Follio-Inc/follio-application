/**
 * Shared utilities for handling HTML content in bullet points and rich text fields.
 *
 * Bullets are stored as `string[]` in the database. Each string may be:
 * - Plain text (legacy data from imports/parsing): "Led a team of 5 engineers"
 * - HTML-formatted (from the rich text editor): "<strong>Led</strong> a team of 5 engineers"
 *
 * These utilities ensure seamless round-tripping between the editor (HTML) and
 * the database (string[]) without losing formatting or double-escaping.
 */

import type DOMPurifyType from 'dompurify';

type DOMPurifyInstance = Pick<
  typeof DOMPurifyType,
  'sanitize' | 'addHook' | 'removeHook' | 'removeAllHooks'
>;

let domPurifyInstance: DOMPurifyInstance | null = null;
let domPurifyHookRegistered = false;

/**
 * Lazily initialize DOMPurify so serverless route handlers (e.g. PDF export)
 * do not pull in jsdom at module load time — that can crash Vercel functions
 * before the request handler runs.
 */
function getDOMPurify(): DOMPurifyInstance {
  if (!domPurifyInstance) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    domPurifyInstance = require('isomorphic-dompurify') as DOMPurifyInstance;
  }

  if (!domPurifyHookRegistered) {
    domPurifyInstance.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A' && node.hasAttribute('href')) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    });
    domPurifyHookRegistered = true;
  }

  return domPurifyInstance;
}

// ─── HTML Detection ─────────────────────────────────────────────────────────

/** Common inline HTML tags produced by the Tiptap rich text editor */
const HTML_TAG_PATTERN = /<(?:strong|em|u|s|br|p|a|span|sub|sup|code)\b[^>]*>/i;

/**
 * Check whether a string contains HTML formatting tags.
 * Used to distinguish between plain-text bullets (legacy data) and
 * HTML-formatted bullets (from the rich text editor).
 */
export function containsHtmlFormatting(str: string): boolean {
  return HTML_TAG_PATTERN.test(str);
}

// ─── HTML Emptiness Check ───────────────────────────────────────────────────

/**
 * Check whether an HTML string is effectively empty (no visible text content).
 * Returns true for null, undefined, empty string, whitespace-only strings,
 * and strings that contain only HTML tags with no text (e.g. `<p></p>`, `<p><br></p>`).
 */
export function isHtmlEmpty(html: string | null | undefined): boolean {
  if (!html) return true;
  const text = html
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, '')
    .trim();
  return text.length === 0;
}

// ─── HTML Escaping / Stripping ──────────────────────────────────────────────

/** Escape special characters for safe HTML injection of plain text. */
export function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Strip HTML tags to produce plain text.
 * Handles `<br>` and `</p>` as line breaks, then strips remaining tags.
 */
export function stripHtmlTags(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{2,}/g, '\n')
    .trim();
}

// ─── HTML Sanitization ──────────────────────────────────────────────────────

/**
 * The exact set of tags the Tiptap rich text editor can produce. Anything
 * outside this allowlist (e.g. `<script>`, `<img>`, `<iframe>`) is stripped.
 */
const ALLOWED_HTML_TAGS = [
  'p',
  'br',
  'span',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'a',
  'sub',
  'sup',
  'code',
  'ul',
  'ol',
  'li',
] as const;

/**
 * Attributes that survive sanitization. `style` is needed for `text-align`,
 * `class` / `data-bullet-style` for bullet styling, and the link attributes
 * for anchors. URL attributes are protocol-checked by DOMPurify's allowlist.
 */
const ALLOWED_HTML_ATTRS = [
  'href',
  'target',
  'rel',
  'style',
  'class',
  'data-bullet-style',
] as const;

/**
 * URI schemes permitted in `href`/`src` attributes. Notably excludes
 * `javascript:` and `data:` to prevent script injection through links.
 */
const SAFE_URI_REGEXP = /^(?:https?|mailto|tel):|^(?:\/|#|\.)/i;

/**
 * Sanitize rich-text HTML that originates from user input (the Tiptap editor,
 * resume imports, etc.) before it is rendered via `dangerouslySetInnerHTML`.
 *
 * This is the single trust boundary for stored HTML. It must be applied at
 * every render site on public pages — content authored by one user is shown to
 * arbitrary visitors, so an unsanitized bullet such as
 * `<img src=x onerror=alert(document.cookie)>` would otherwise be a stored XSS
 * vector.
 *
 * Allows only the tags/attributes the editor produces, restricts link
 * protocols to a safe set, and forces external links to open with
 * `rel="noopener noreferrer"`.
 *
 * Returns an empty string for null/undefined/empty input.
 */
export function sanitizeRichHtml(html: string | null | undefined): string {
  if (!html) return '';

  return getDOMPurify().sanitize(html, {
    ALLOWED_TAGS: [...ALLOWED_HTML_TAGS],
    ALLOWED_ATTR: [...ALLOWED_HTML_ATTRS],
    ALLOWED_URI_REGEXP: SAFE_URI_REGEXP,
    // Forbid any inline event handlers and other dangerous vectors outright.
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'srcset'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'img', 'svg', 'math'],
    // Keep the result as an HTML string (not a DOM node).
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  });
}

// ─── Bullet ↔ HTML Conversion ───────────────────────────────────────────────

/**
 * Convert a string[] of bullets into an HTML bullet list for the Tiptap editor.
 *
 * Each bullet is wrapped in `<li><p>…</p></li>`. Bullets that already contain
 * HTML formatting (e.g. `<strong>`) are inserted as-is; plain text bullets are
 * escaped to prevent accidental HTML interpretation.
 *
 * Bullets that already contain a `<p>` wrapper (e.g. `<p style="text-align: center">…</p>`)
 * are not double-wrapped. This allows alignment to survive the round-trip.
 *
 * The `data-bullet-style` attribute is included so the custom Tiptap BulletList
 * extension can parse the style back when loading content.
 */
export function bulletsToHtml(bullets: string[] | undefined | null): string {
  if (!bullets || bullets.length === 0) return '';
  const items = bullets
    .map((b) => {
      // If the bullet already has a <p> wrapper (from preserved alignment), don't double-wrap
      if (/^<p[\s>]/i.test(b.trim())) {
        return `<li>${b}</li>`;
      }
      const content = containsHtmlFormatting(b) ? b : escapeHtml(b);
      return `<li><p>${content}</p></li>`;
    })
    .join('');
  return `<ul class="rich-text-bullets bullet-style-disc" data-bullet-style="disc">${items}</ul>`;
}

/**
 * Extract bullet strings from an HTML bullet list produced by the Tiptap editor.
 *
 * Preserves inline formatting tags (`<strong>`, `<em>`, `<u>`, etc.) within
 * each bullet so they survive the round-trip to the database and back.
 *
 * Falls back to splitting on newlines if no `<li>` elements are found.
 *
 * Works in both browser and server (SSR) environments.
 */
export function htmlToBullets(html: string): string[] {
  if (!html) return [];

  // Use regex-based extraction that works in both browser and server environments
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  const matches: string[] = [];
  let match;

  while ((match = liRegex.exec(html)) !== null) {
    let inner = match[1].trim();

    // Tiptap wraps each <li> content in a <p> tag.
    // Only strip PLAIN <p> tags (no attributes). When the <p> has attributes
    // (e.g. style="text-align: center"), keep it so alignment survives the round-trip.
    const plainPMatch = inner.match(/^<p>([\s\S]*)<\/p>$/i);
    if (plainPMatch) {
      inner = plainPMatch[1];
    }
    // If <p> has attributes, leave the full <p style="...">content</p> intact
    // so it persists through the database and renders correctly in the preview.

    if (inner.trim().length > 0) {
      matches.push(inner.trim());
    }
  }

  if (matches.length > 0) return matches;

  // Fallback: strip tags and split on newlines
  const text = stripHtmlTags(html);
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

// ─── Text Alignment Detection & Modification ────────────────────

/**
 * Regex matching non-justify text-align values in TipTap-generated HTML.
 * TipTap adds `style="text-align: left|center|right"` to elements; the absence
 * of any text-align means the editor's `defaultAlignment` is used (justify).
 */
const NON_JUSTIFY_ALIGN_RE = /text-align:\s*(?:left|center|right)/i;
const NON_JUSTIFY_ALIGN_RE_GLOBAL = /text-align:\s*(?:left|center|right)/gi;

/**
 * Check whether an HTML string is fully justified.
 *
 * Returns `true` when the HTML contains NO non-justify text-align declarations.
 * Null, undefined and empty strings are considered "fully justified" because
 * the TipTap editor defaults to justify alignment for new content.
 */
export function isHtmlFullyJustified(html: string | null | undefined): boolean {
  if (!html) return true;
  return !NON_JUSTIFY_ALIGN_RE.test(html);
}

/**
 * Rewrite every non-justify text-align value to `justify` in the given HTML.
 *
 * Preserves all other inline styles and attributes. Returns `null` for null
 * input so it can be used safely with nullable database fields.
 */
export function justifyHtmlContent(html: string): string;
export function justifyHtmlContent(html: null | undefined): null;
export function justifyHtmlContent(html: string | null | undefined): string | null;
export function justifyHtmlContent(html: string | null | undefined): string | null {
  if (html == null) return null;
  return html.replace(NON_JUSTIFY_ALIGN_RE_GLOBAL, 'text-align: justify');
}
