/**
 * Decide whether a Wikipedia search hit is actually the company or school
 * we asked for. A wrong page is worse than no insight, so the bar is high.
 */

const LEGAL_FILLER = new Set([
  'inc',
  'llc',
  'ltd',
  'corp',
  'corporation',
  'company',
  'co',
  'group',
  'holdings',
  'the',
  'incorporated',
  'limited',
  'plc',
  'gmbh',
]);

const SCHOOL_HINTS = /\b(university|college|institute|school|academy)\b/i;
const DISAMBIGUATION = /\bdisambiguation\b/i;

export type WikipediaSearchHit = {
  title: string;
  description?: string | null;
  excerpt?: string | null;
};

export function normalizeInsightName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token && !LEGAL_FILLER.has(token))
    .join(' ')
    .trim();
}

export function scoreWikipediaHit(
  name: string,
  hit: WikipediaSearchHit,
  kind: 'company' | 'school'
): number {
  if (DISAMBIGUATION.test(hit.title) || DISAMBIGUATION.test(hit.description ?? '')) return 0;

  const query = normalizeInsightName(name);
  const title = normalizeInsightName(hit.title);
  if (!query || !title) return 0;

  let score = 0;
  if (title === query) score = 100;
  else if (title.startsWith(query) || query.startsWith(title)) score = 82;
  else {
    const queryTokens = query.split(' ');
    const titleTokens = new Set(title.split(' '));
    const overlap = queryTokens.filter((token) => titleTokens.has(token)).length;
    if (overlap === 0) return 0;
    const ratio = overlap / queryTokens.length;
    if (ratio === 1) score = 74;
    else if (ratio >= 0.6) score = 56;
    else return 0;
  }

  if (kind === 'school' && SCHOOL_HINTS.test(hit.title)) score += 8;
  return score;
}

/** Best Wikipedia title for this brand, or null when nothing is trustworthy. */
export function pickWikipediaTitle(
  name: string,
  hits: WikipediaSearchHit[],
  kind: 'company' | 'school'
): string | null {
  let best: { title: string; score: number } | null = null;
  for (const hit of hits) {
    const score = scoreWikipediaHit(name, hit, kind);
    if (score < 56) continue;
    if (!best || score > best.score) best = { title: hit.title, score };
  }
  return best?.title ?? null;
}

/** First two sentences, used as the peek blurb. */
export function peekSummary(extract: string, maxChars = 220): string {
  const trimmed = extract.replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  const sentences = trimmed.match(/[^.!?]+[.!?]+/g);
  if (sentences && sentences.length > 0) {
    const two = `${sentences[0]}${sentences[1] ?? ''}`.trim();
    if (two.length <= maxChars) return two;
  }
  if (trimmed.length <= maxChars) return trimmed;
  const window = trimmed.slice(0, maxChars);
  const last = window.lastIndexOf(' ');
  return `${(last > 0 ? window.slice(0, last) : window).trimEnd()}…`;
}
