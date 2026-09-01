/**
 * Phrase matching for the recruiter lens.
 * Pure string algorithms — the DOM layer only applies the ranges.
 */

import type { TextRange } from './types';

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function startsWithWordChar(value: string): boolean {
  return /^[\p{L}\p{N}_]/u.test(value);
}

function endsWithWordChar(value: string): boolean {
  return /[\p{L}\p{N}_]$/u.test(value);
}

/**
 * Case-insensitive matcher for a resume phrase.
 * Uses word boundaries only when the phrase starts/ends with a word character
 * so "Go" does not match "Google" and "C++" still matches.
 */
export function buildPhraseRegex(phrase: string): RegExp | null {
  const trimmed = phrase.trim();
  if (!trimmed) return null;
  const escaped = escapeRegExp(trimmed).replace(/\s+/g, '\\s+');
  const prefix = startsWithWordChar(trimmed) ? '\\b' : '';
  const suffix = endsWithWordChar(trimmed) ? '\\b' : '';
  return new RegExp(`${prefix}${escaped}${suffix}`, 'gi');
}

export function phraseAppearsIn(text: string, phrase: string): boolean {
  const re = buildPhraseRegex(phrase);
  if (!re) return false;
  return re.test(text);
}

function rangesOverlap(a: TextRange, b: TextRange): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Find non-overlapping matches. Longer phrases win so "machine learning"
 * is preferred over "learning" in the same span.
 */
export function findNonOverlappingRanges(
  text: string,
  phrases: Array<{ id: string; phrase: string }>
): TextRange[] {
  if (!text || phrases.length === 0) return [];

  const candidates: TextRange[] = [];
  for (const spec of phrases) {
    const re = buildPhraseRegex(spec.phrase);
    if (!re) continue;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      if (match[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      candidates.push({
        start: match.index,
        end: match.index + match[0].length,
        phraseId: spec.id,
      });
    }
  }

  candidates.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);

  const kept: TextRange[] = [];
  for (const candidate of candidates) {
    if (kept.some((existing) => rangesOverlap(existing, candidate))) continue;
    kept.push(candidate);
  }

  kept.sort((a, b) => a.start - b.start);
  return kept;
}

export type TextSegment =
  | { type: 'text'; value: string }
  | { type: 'mark'; value: string; phraseId: string };

/** Split a string into plain text and mark segments from non-overlapping ranges. */
export function splitTextByRanges(text: string, ranges: TextRange[]): TextSegment[] {
  if (ranges.length === 0) return text ? [{ type: 'text', value: text }] : [];

  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      segments.push({ type: 'text', value: text.slice(cursor, range.start) });
    }
    segments.push({
      type: 'mark',
      value: text.slice(range.start, range.end),
      phraseId: range.phraseId,
    });
    cursor = range.end;
  }
  if (cursor < text.length) {
    segments.push({ type: 'text', value: text.slice(cursor) });
  }
  return segments;
}
