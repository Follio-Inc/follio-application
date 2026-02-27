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

// ─── HTML Escaping / Stripping ──────────────────────────────────────────────

/** Escape special characters for safe HTML injection of plain text. */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
