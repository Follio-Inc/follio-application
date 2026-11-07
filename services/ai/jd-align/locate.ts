/**
 * Find a model's quote inside the original document.
 * The returned range is a slice of the document, never a rewrite.
 */

export interface LocatedQuote {
  start: number;
  end: number;
  quote: string;
}

function fold(value: string): string {
  return value
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\u00a0/g, ' ');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanNeedle(quote: string): string {
  return quote
    .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, '')
    .replace(/^(?:[-*•–—]\s+)+/, '')
    .trim();
}

function needlesFor(quote: string): string[] {
  const cleaned = cleanNeedle(quote);
  if (cleaned.length < 2) return [];
  const stripped = cleaned.replace(/[.,;:]+$/g, '').trim();
  const unique = [cleaned];
  if (stripped && stripped !== cleaned && stripped.length >= 3) unique.push(stripped);
  return unique;
}

function locateFlexible(haystack: string, quote: string): LocatedQuote | null {
  const parts = quote.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const body = parts.map(escapeRegExp).join('\\s+');
  const startsWord = /^[\p{L}\p{N}_]/u.test(parts[0] ?? '');
  const endsWord = /[\p{L}\p{N}_]$/u.test(parts[parts.length - 1] ?? '');
  const pattern = `${startsWord ? '(?<![\\p{L}\\p{N}_])' : ''}${body}${endsWord ? '(?![\\p{L}\\p{N}_])' : ''}`;
  const match = new RegExp(pattern, 'iu').exec(haystack);
  if (!match || match.index == null || match[0].length === 0) return null;
  const start = match.index;
  const end = start + match[0].length;
  return { start, end, quote: haystack.slice(start, end) };
}

/**
 * Locate `quote` in `haystack`.
 * Case and extra spaces are allowed. A short word such as "Go" does not
 * match inside "Google".
 */
export function locateQuote(haystack: string, quote: string): LocatedQuote | null {
  const source = fold(haystack);
  for (const needle of needlesFor(fold(quote))) {
    if (needle.length > 240) continue;
    const found = locateFlexible(source, needle);
    if (!found) continue;
    return {
      start: found.start,
      end: found.end,
      quote: haystack.slice(found.start, found.end),
    };
  }
  return null;
}
