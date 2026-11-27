/**
 * Draws highlights into the resume itself. Pure, so the page and the tests
 * read the same result.
 *
 * Marks wrap words already in the bullet HTML; they never add text. Inserts
 * are placed in the document flow under the company heading, so every block
 * below moves down by their height and nothing overlaps.
 */

import { companyKey } from './glance-facts';

import type { ResumeGlance } from './glance';

export type GlanceInsert = {
  summary: string | null;
  skills: string[];
};

export type EntryHighlights = {
  /** Phrases to draw with a marker inside this entry's bullets. */
  phrases: string[];
  /** Summary and skill boxes. Only the first entry of a company carries them. */
  insert: GlanceInsert | null;
};

/**
 * Match each visible experience entry to its company's highlights.
 * Several roles at one company share the marks; the boxes sit under the first
 * role's heading so the company reads as one job.
 */
export function highlightsByEntry(
  entries: ReadonlyArray<{ id: string; company: string | null | undefined }>,
  glance: ResumeGlance | null | undefined
): Map<string, EntryHighlights> {
  const out = new Map<string, EntryHighlights>();
  if (!glance || glance.companies.length === 0) return out;

  const byKey = new Map(glance.companies.map((company) => [companyKey(company.company), company]));
  const placed = new Set<string>();

  for (const entry of entries) {
    if (!entry.company) continue;
    const key = companyKey(entry.company);
    const company = byKey.get(key);
    if (!company) continue;
    const hasInsert = Boolean(company.summary) || company.skills.length > 0;
    const insert =
      hasInsert && !placed.has(key) ? { summary: company.summary, skills: company.skills } : null;
    if (insert) placed.add(key);
    if (!insert && company.phrases.length === 0) continue;
    out.set(entry.id, { phrases: company.phrases, insert });
  }
  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** How a plain-text character can appear inside serialized HTML text. */
function charPattern(char: string): string {
  switch (char) {
    case '&':
      return '(?:&amp;|&#38;|&)';
    case '<':
      return '&lt;';
    case '>':
      return '&gt;';
    case '"':
      return '(?:"|&quot;|&#34;)';
    case "'":
      return "(?:'|&#39;|&#x27;|&apos;)";
    default:
      return escapeRegExp(char);
  }
}

function phrasePattern(phrase: string): RegExp | null {
  const words = phrase.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const source = words
    .map((word) => Array.from(word).map(charPattern).join(''))
    .join('(?:\\s|&nbsp;|&#160;)+');
  return new RegExp(source, 'gi');
}

const WORD_CHAR = /[a-z0-9]/i;

type Range = { start: number; end: number };

function entityRanges(segment: string): Range[] {
  return Array.from(segment.matchAll(/&[#a-z0-9]+;/gi), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}

/** First whole-word match of `pattern` in `segment` that does not overlap `taken` or split an entity. */
function findFree(segment: string, pattern: RegExp, taken: Range[]): Range | null {
  const entities = entityRanges(segment);
  const splitsEntity = (at: number) =>
    entities.some((entity) => at > entity.start && at < entity.end);
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(segment)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (match[0].length === 0) {
      pattern.lastIndex += 1;
      continue;
    }
    const before = segment[start - 1];
    const after = segment[end];
    const first = match[0][0] ?? '';
    const last = match[0][match[0].length - 1] ?? '';
    const cutsWordStart = WORD_CHAR.test(first) && before !== undefined && WORD_CHAR.test(before);
    const cutsWordEnd = WORD_CHAR.test(last) && after !== undefined && WORD_CHAR.test(after);
    const overlaps = taken.some((range) => start < range.end && range.start < end);
    const brokenEntity = splitsEntity(start) || splitsEntity(end);
    if (!cutsWordStart && !cutsWordEnd && !overlaps && !brokenEntity) return { start, end };
    pattern.lastIndex = start + 1;
  }
  return null;
}

/**
 * Wrap each phrase's first appearance in a marker `<mark>`. Only text between
 * tags is touched, so markup and attributes stay as sanitized. A phrase that
 * crosses a formatting tag is left unmarked rather than breaking the markup.
 */
export function markPhrasesInHtml(html: string, phrases: readonly string[]): string {
  if (!html || phrases.length === 0) return html;

  const patterns = [...phrases]
    .sort((a, b) => b.length - a.length)
    .map(phrasePattern)
    .filter((pattern): pattern is RegExp => pattern !== null);
  const pending = new Set(patterns);

  const parts = html.split(/(<[^>]*>)/);
  return parts
    .map((part, index) => {
      if (index % 2 === 1 || !part || pending.size === 0) return part;
      const taken: Range[] = [];
      for (const pattern of patterns) {
        if (!pending.has(pattern)) continue;
        const range = findFree(part, pattern, taken);
        if (!range) continue;
        taken.push(range);
        pending.delete(pattern);
      }
      if (taken.length === 0) return part;
      taken.sort((a, b) => a.start - b.start);
      let out = '';
      let cursor = 0;
      for (const range of taken) {
        out += part.slice(cursor, range.start);
        out += `<mark class="glance-mark">${part.slice(range.start, range.end)}</mark>`;
        cursor = range.end;
      }
      return out + part.slice(cursor);
    })
    .join('');
}
