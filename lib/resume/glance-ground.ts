/**
 * Keeps a model's highlights honest.
 * The prompt picks phrases and writes the summary. This drops anything the
 * resume does not support: phrases that are not on the page, invented numbers,
 * unknown employers, duty-list filler, and skills the bullets never mention.
 * It never rewrites a line into a new claim.
 */

import { companyKey, type GlanceCompanyFacts, type GlanceFacts } from '@/lib/resume/glance-facts';
import {
  emptyGlance,
  GLANCE_LIMITS,
  type GlanceCompany,
  type ResumeGlance,
} from '@/lib/resume/glance';

const DUTY =
  /^(?:responsible for|duties included|worked on|worked with|tasked with|involved in|assisted with|helped with|participated in)\b/i;

/** A phrase covering more than this share of its bullet restyles the bullet, not a phrase in it. */
const WHOLE_BULLET_SHARE = 0.75;

const STOP = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'into',
  'over',
  'their',
  'them',
  'were',
  'was',
  'are',
  'been',
  'have',
  'has',
  'had',
  'its',
  'his',
  'her',
  'our',
  'your',
]);

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed || null;
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(text).filter((item): item is string => Boolean(item));
}

/** Digits the line introduces. "$2M" and "40%" count. A digit hiding inside a longer number does not. */
function numberTokens(value: string): string[] {
  return value.match(/\$?\d[\d,]*(?:\.\d+)?%?/g) ?? [];
}

function hasForeignNumber(line: string, corpus: string): boolean {
  const allowed = new Set<string>();
  for (const token of numberTokens(corpus)) {
    const lower = token.toLowerCase();
    allowed.add(lower);
    allowed.add(lower.replace(/[$%,]/g, ''));
  }
  return numberTokens(line).some((token) => {
    const lower = token.toLowerCase();
    return !allowed.has(lower) && !allowed.has(lower.replace(/[$%,]/g, ''));
  });
}

function significant(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9+%]+/)
    .filter((word) => word.length > 2 && !STOP.has(word));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Where `term` sits in `hay` as a whole word, case-insensitive. "Go" is not inside "Google". */
function findTerm(hay: string, term: string): number {
  const startsWord = /^[a-z0-9]/i.test(term);
  const endsWord = /[a-z0-9]$/i.test(term);
  const pattern = new RegExp(
    `${startsWord ? '(?<![a-z0-9])' : ''}${escapeRegExp(term)}${endsWord ? '(?![a-z0-9])' : ''}`,
    'i'
  );
  return hay.search(pattern);
}

function allBullets(company: GlanceCompanyFacts): string[] {
  return company.roles.flatMap((role) => role.bullets);
}

function onlyDuties(company: GlanceCompanyFacts): boolean {
  const bullets = allBullets(company);
  return bullets.length === 0 || bullets.every((bullet) => DUTY.test(bullet));
}

/** Strip the quotes and trailing punctuation a model wraps around a copied span. */
function trimSpan(value: string): string {
  return value.replace(/^[\s"'“”‘’.,;:]+|[\s"'“”‘’.,;:]+$/g, '');
}

type Span = { bullet: number; start: number; end: number; text: string };

/** Find the phrase in a bullet and return the bullet's own words, so the mark matches the page. */
function locatePhrase(phrase: string, bullets: string[]): Span | null {
  const needle = trimSpan(phrase);
  // A lone word is a tool name or filler; the skill tags already carry those.
  if (needle.split(' ').length < 2 || needle.length > GLANCE_LIMITS.phraseChars) return null;
  if (DUTY.test(needle) || significant(needle).length === 0) return null;

  for (let index = 0; index < bullets.length; index += 1) {
    const bullet = bullets[index] ?? '';
    const start = findTerm(bullet, needle);
    if (start < 0) continue;
    if (needle.length / bullet.length > WHOLE_BULLET_SHARE) return null;
    const end = start + needle.length;
    return { bullet: index, start, end, text: bullet.slice(start, end) };
  }
  return null;
}

function groundPhrases(candidates: string[], bullets: string[]): string[] {
  const spans: Span[] = [];
  for (const candidate of candidates) {
    const span = locatePhrase(candidate, bullets);
    if (!span) continue;
    const overlaps = spans.some(
      (kept) => kept.bullet === span.bullet && span.start < kept.end && kept.start < span.end
    );
    if (overlaps) continue;
    spans.push(span);
    if (spans.length >= GLANCE_LIMITS.phrases) break;
  }
  return spans.map((span) => span.text);
}

function sameLine(a: string, b: string): boolean {
  const norm = (value: string) => trimSpan(value).toLowerCase();
  return norm(a) === norm(b);
}

/** One line, made of the bullets' own words, with no number they do not contain. */
function groundSummary(line: string | null, company: GlanceCompanyFacts): string | null {
  if (!line || line.length > GLANCE_LIMITS.summaryChars) return null;
  if (DUTY.test(line)) return null;
  const bullets = allBullets(company);
  const corpus = [company.company, ...company.roles.map((role) => role.title), ...bullets].join(
    '\n'
  );
  if (hasForeignNumber(line, corpus)) return null;
  if (bullets.some((bullet) => sameLine(line, bullet))) return null;
  if (company.roles.some((role) => sameLine(line, role.title))) return null;
  const words = significant(line);
  if (words.length === 0) return null;
  const hay = corpus.toLowerCase();
  const hits = words.filter((word) => hay.includes(word));
  if (hits.length / words.length < 0.6) return null;
  return line;
}

/** Words share a stem when one is the other, or both are long and open with the same five letters. */
function sameStem(a: string, b: string): boolean {
  if (a === b) return true;
  return a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5);
}

/** "Mentoring" from "mentored": every word of the tag has a stem in the bullets. */
function provenPractice(skill: string, corpus: string): boolean {
  const words = skill
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter(Boolean);
  if (words.length === 0) return false;
  const vocabulary = corpus.toLowerCase().split(/[^a-z0-9+#.]+/);
  // "Led" is how resumes say leadership; it shares no five-letter stem with it.
  if (vocabulary.includes('led')) vocabulary.push('leading', 'leadership');
  return words.every((word) => vocabulary.some((known) => sameStem(word, known)));
}

/**
 * A tag only when the company's own bullets prove it. A named tool reads the
 * way the bullet spells it; a practice must be built from the bullets' words.
 */
function groundSkills(candidates: string[], company: GlanceCompanyFacts): string[] {
  const bullets = allBullets(company);
  const corpus = [...bullets, ...company.roles.map((role) => role.title)].join('\n');
  const out: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const skill = trimSpan(candidate);
    if (!skill || skill.length > GLANCE_LIMITS.skillChars || hasForeignNumber(skill, corpus)) {
      continue;
    }
    let found: string | null = null;
    for (const bullet of bullets) {
      const start = findTerm(bullet, skill);
      if (start >= 0) {
        // A tool keeps the bullet's spelling ("Go", "PostgreSQL"); a lowercase practice keeps the tag's title case.
        const literal = bullet.slice(start, start + skill.length);
        found = /[A-Z]/.test(literal) ? literal : skill;
        break;
      }
    }
    if (!found && provenPractice(skill, corpus)) found = skill;
    if (!found) continue;
    const key = found.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(found);
    if (out.length >= GLANCE_LIMITS.skills) break;
  }
  return out;
}

type Raw = { phrases: string[]; summary: string | null; skills: string[] };

/** Turn a model payload into highlights the page can draw. Unknown shapes become no highlights. */
export function groundGlance(facts: GlanceFacts, model: unknown): ResumeGlance {
  if (!model || typeof model !== 'object') return emptyGlance();
  const rows = (model as Record<string, unknown>).companies;
  if (!Array.isArray(rows)) return emptyGlance();

  // A model that splits one employer into two objects still gets one set of highlights.
  const byKey = new Map<string, Raw>();
  for (const item of rows) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const name = text(row.company);
    if (!name) continue;
    const key = companyKey(name);
    const previous = byKey.get(key);
    byKey.set(key, {
      phrases: [...(previous?.phrases ?? []), ...list(row.phrases)],
      summary: previous?.summary ?? text(row.summary),
      skills: [...(previous?.skills ?? []), ...list(row.skills)],
    });
  }

  const companies = facts.companies.flatMap((source): GlanceCompany[] => {
    const raw = byKey.get(companyKey(source.company));
    if (!raw || onlyDuties(source)) return [];
    const bullets = allBullets(source);
    const company: GlanceCompany = {
      company: source.company,
      phrases: groundPhrases(raw.phrases, bullets),
      summary: groundSummary(raw.summary, source),
      skills: groundSkills(raw.skills, source),
    };
    if (!company.summary && company.skills.length === 0 && company.phrases.length === 0) return [];
    return [company];
  });

  return { version: 2, companies };
}
