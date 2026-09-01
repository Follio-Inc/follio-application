import { stripHtmlTags } from '@/lib/html-utils';

/** Visible text only — Follio never shows markup. */
export function plainText(value: string | null | undefined): string | null {
  if (!value) return null;
  const stripped = stripHtmlTags(value).replace(/\s+/g, ' ').trim();
  return stripped || null;
}

/**
 * Shorten to a sentence boundary inside the budget, falling back to a word
 * boundary. Cutting mid-sentence reads worse than cutting early.
 */
export function condense(value: string | null | undefined, maxChars: number): string | null {
  const plain = plainText(value);
  if (!plain || plain.length <= maxChars) return plain;

  const window = plain.slice(0, maxChars);
  const lastSentence = Math.max(
    window.lastIndexOf('. '),
    window.lastIndexOf('! '),
    window.lastIndexOf('? ')
  );
  // Only honor a sentence break if it keeps a useful amount of text.
  if (lastSentence > maxChars * 0.4) {
    return window.slice(0, lastSentence + 1);
  }

  const lastWord = window.lastIndexOf(' ');
  return `${(lastWord > 0 ? window.slice(0, lastWord) : window).trimEnd()}…`;
}
