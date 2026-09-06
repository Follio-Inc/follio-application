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

  try {
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
  } catch {
    // jsdom can fail on serverless. Do not strip lists/alignment — that made
    // the on-screen resume look fine while the PDF lost bullets and justify.
    return sanitizeRichHtmlFallback(html);
  }
}

/**
 * Keep list markup and text-align when DOMPurify/jsdom is unavailable.
 * Strips scripts, event handlers, and disallowed tags without flattening
 * `<ul>`/`<li>` to plain text.
 */
export function sanitizeRichHtmlFallback(html: string): string {
  let out = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?(?:iframe|object|embed|form|img|svg|math|link|meta|video|audio)\b[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(?:href|src)\s*=\s*(['"])\s*(?:javascript|data|vbscript):[\s\S]*?\1/gi, '');

  out = out.replace(/<\/?([a-z0-9-]+)([^>]*)>/gi, (full, rawTag: string, rawAttrs: string) => {
    const tag = rawTag.toLowerCase();
    const isClose = full.startsWith('</');
    if (!(ALLOWED_HTML_TAGS as readonly string[]).includes(tag)) {
      return '';
    }
    if (isClose) return `</${tag}>`;
    const kept: string[] = [];
    const attrRe =
      /\s(href|target|rel|style|class|data-bullet-style)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRe.exec(rawAttrs)) !== null) {
      const name = attrMatch[1].toLowerCase();
      const value = attrMatch[3] ?? attrMatch[4] ?? attrMatch[5] ?? '';
      if (name === 'href' && value && !SAFE_URI_REGEXP.test(value)) continue;
      kept.push(`${name}="${escapeHtml(value)}"`);
    }
    const attrStr = kept.length > 0 ? ` ${kept.join(' ')}` : '';
    return `<${tag}${attrStr}>`;
  });

  return out;
}

/**
 * Inner HTML for one resume bullet `<li>`. Alignment lives on the inner `<p>`
 * (the stored editor HTML), never the list item — Chromium print drops markers
 * when the `<li>` is justified. Used by both CleanResumeView and PDF export.
 */
export function resumeBulletInnerHtml(bullet: string): string {
  if (containsHtmlFormatting(bullet)) {
    const inner = sanitizeRichHtml(bullet);
    if (/^<p[\s>/]/i.test(inner.trim())) {
      return justifyHtmlContent(inner) ?? inner;
    }
    return `<p style="text-align: justify">${inner}</p>`;
  }
  return `<p style="text-align: justify">${escapeHtml(bullet)}</p>`;
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
        return `<li>${justifyHtmlContent(b)}</li>`;
      }
      const content = containsHtmlFormatting(b) ? b : escapeHtml(b);
      return `<li><p style="text-align: justify">${content}</p></li>`;
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

    // Tiptap wraps each <li> in a <p>. Strip a plain <p> or a default-justify
    // <p> so bullets[] stay as content. Keep other alignments (left/center/right)
    // as a full <p style="..."> so they survive the round-trip.
    const unwrapped = unwrapDefaultBulletParagraph(inner);
    if (unwrapped !== null) {
      inner = unwrapped;
    }

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

const NON_JUSTIFY_ALIGN_RE = /text-align:\s*(?:left|center|right)/i;
const NON_JUSTIFY_ALIGN_RE_GLOBAL = /text-align:\s*(?:left|center|right)/gi;
const BLOCK_OPEN_RE = /<(p|h[1-6])(\s[^>]*)?>/gi;

/**
 * Unwrap `<p>` or `<p style="text-align: justify">` so default-justified
 * bullets store as content. Returns null when the paragraph has a
 * non-default alignment that must be kept on the tag.
 */
function unwrapDefaultBulletParagraph(inner: string): string | null {
  const wrapped = inner.match(/^<p([^>]*)>([\s\S]*)<\/p>$/i);
  if (!wrapped) return null;
  const attrs = wrapped[1].trim();
  const body = wrapped[2];
  if (!attrs) return body;
  if (/^style\s*=\s*["']text-align:\s*justify;?\s*["']$/i.test(attrs)) return body;
  return null;
}

/**
 * True when every paragraph/heading already has `text-align: justify` in the
 * stored HTML — not merely "the preview CSS will make it look justified".
 */
export function isHtmlFullyJustified(html: string | null | undefined): boolean {
  if (!html) return true;
  if (NON_JUSTIFY_ALIGN_RE.test(html)) return false;
  const opens = html.match(BLOCK_OPEN_RE);
  if (!opens) return true;
  return opens.every((tag) => /text-align\s*:\s*justify/i.test(tag));
}

/**
 * Write `text-align: justify` into the HTML itself (editor content), replacing
 * left/center/right and filling in paragraphs that had no alignment.
 */
export function justifyHtmlContent(html: string): string;
export function justifyHtmlContent(html: null | undefined): null;
export function justifyHtmlContent(html: string | null | undefined): string | null;
export function justifyHtmlContent(html: string | null | undefined): string | null {
  if (html == null) return null;
  const replaced = html.replace(NON_JUSTIFY_ALIGN_RE_GLOBAL, 'text-align: justify');
  return replaced.replace(/<(p|h[1-6])(\s[^>]*)?>/gi, (full, tag: string, rawAttrs?: string) => {
    if (/text-align\s*:/i.test(full)) return full;
    const attrs = rawAttrs ?? '';
    const styleMatch = attrs.match(/style\s*=\s*("([^"]*)"|'([^']*)')/i);
    if (styleMatch) {
      const quote = styleMatch[1].startsWith("'") ? "'" : '"';
      const val = (styleMatch[2] ?? styleMatch[3] ?? '').trim();
      const next = val
        ? `${val}${val.endsWith(';') ? '' : ';'} text-align: justify`
        : 'text-align: justify';
      return full.replace(styleMatch[0], `style=${quote}${next}${quote}`);
    }
    if (attrs.trim()) {
      return `<${tag}${attrs} style="text-align: justify">`;
    }
    return `<${tag} style="text-align: justify">`;
  });
}
