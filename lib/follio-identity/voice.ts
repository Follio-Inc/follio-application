import { highlightLines, stringList } from './depth';
import { condense, plainText } from './text';

/**
 * Follio voice. A first impression after a QR scan — not a résumé.
 * Signal only: who they are, what they do, one or two proof points. The resume
 * door carries the rest.
 */
export const FOLLIO_VOICE = {
  maxHeadline: 72,
  /** Roughly two short sentences on a phone. */
  maxAbout: 160,
  maxHighlights: 2,
  maxExtras: 2,
} as const;

const KEYWORD_SOUP = /\s*[|•·]\s+/;

const NOISE_SENTENCE =
  /^(?:i am a |i'm a )?(?:results-driven|motivated|passionate|dedicated|dynamic|seasoned|highly motivated|detail-oriented)\b/i;

const SEEKING_SENTENCE = /\b(?:seeking|looking for)\b.*\b(?:role|position|opportunit)/i;

const COURSEWORK = /\b(?:coursework|relevant courses|modules include|subjects?:)\b/i;

const NOISE_HIGHLIGHT =
  /^(?:responsible for|duties included|worked on|worked with|tasked with|involved in|various duties|assisted with|helped with|participated in)\b/i;

const STRONG_VERB =
  /\b(?:led|built|shipped|launched|designed|created|grew|cut|reduced|increased|owned|wrote|published|invented|founded|scaled|raised|won|sold)\b/i;

function sentencesOf(value: string): string[] {
  return value
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isNoiseSentence(sentence: string): boolean {
  return NOISE_SENTENCE.test(sentence) || SEEKING_SENTENCE.test(sentence);
}

/** Headline is one identity line, not a keyword strip. */
export function rewriteHeadline(value: string | null | undefined): string | null {
  const plain = plainText(value);
  if (!plain) return null;
  const clause = plain.split(KEYWORD_SOUP)[0]?.trim() || plain;
  return condense(clause, FOLLIO_VOICE.maxHeadline);
}

/**
 * About is an introduction: drop résumé filler, keep one or two real sentences.
 */
export function rewriteAbout(value: string | null | undefined): string | null {
  const plain = plainText(value);
  if (!plain) return null;

  const kept = sentencesOf(plain).filter((sentence) => !isNoiseSentence(sentence));
  const signal = kept.length > 0 ? kept.slice(0, 2).join(' ') : plain;
  return condense(signal, FOLLIO_VOICE.maxAbout);
}

function scoreHighlight(line: string): number {
  let score = 0;
  if (/\d/.test(line)) score += 3;
  if (STRONG_VERB.test(line)) score += 2;
  if (NOISE_HIGHLIGHT.test(line)) score -= 4;
  if (line.length > 140) score -= 1;
  if (/\b(?:etc\.|and more)\b/i.test(line)) score -= 1;
  return score;
}

/**
 * Role peeks get two proof points, not the résumé bullet dump.
 * Prefers outcomes and numbers; drops duty-list filler.
 */
export function rewriteHighlights(item: {
  bullets?: string[] | null;
  bulletsHtml?: string | null;
}): string[] {
  const candidates = highlightLines(item, { max: 16, maxChars: 2000 });
  if (candidates.length === 0) return [];

  const ranked = [...candidates].sort((a, b) => scoreHighlight(b) - scoreHighlight(a));
  const picked: string[] = [];
  const seen = new Set<string>();

  for (const line of ranked) {
    if (picked.length >= FOLLIO_VOICE.maxHighlights) break;
    if (scoreHighlight(line) < 0 && picked.length > 0) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(line);
  }

  return picked;
}

/** Coursework and essays stay on the résumé. Keep the note complete when it is real. */
export function rewriteEducationNote(value: string | null | undefined): string | null {
  const plain = plainText(value);
  if (!plain) return null;
  if (COURSEWORK.test(plain)) return null;
  return plain;
}

/** Honors and activities: two facts, shown in full. */
export function rewriteExtras(values: string[] | null | undefined): string[] {
  const extras: string[] = [];
  const seen = new Set<string>();
  for (const value of stringList(values)) {
    if (extras.length >= FOLLIO_VOICE.maxExtras) break;
    const line = plainText(value);
    if (!line) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    extras.push(line);
  }
  return extras;
}
