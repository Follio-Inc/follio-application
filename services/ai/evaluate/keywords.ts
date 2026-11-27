/**
 * Count keywords on a resume and a job description.
 *
 * The score is a ratio, not a model judgment: of the keywords on one side,
 * how many also appear on the other. Aliases collapse written equivalents.
 * Token boundaries keep Java from matching JavaScript.
 */

import {
  ACRONYM_DENY,
  ALIAS_GROUPS,
  KEYWORD_PHRASES,
  KEYWORD_TERMS,
  SHORT_ACRONYMS,
} from './keyword-lexicon';
import type { JobKeyword, KeywordMatch } from './types';

const MAX_KEYWORDS = 40;

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'as',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'should',
  'could',
  'may',
  'might',
  'must',
  'can',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
  'you',
  'your',
  'we',
  'our',
  'they',
  'their',
  'who',
  'what',
  'which',
  'when',
  'where',
  'why',
  'how',
  'all',
  'each',
  'every',
  'both',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'nor',
  'not',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  'just',
  'about',
  'into',
  'over',
  'after',
  'before',
  'between',
  'under',
  'again',
  'further',
  'then',
  'once',
  'here',
  'there',
  'also',
  'job',
  'role',
  'position',
  'team',
  'work',
  'working',
  'worked',
  'experience',
  'experienced',
  'years',
  'year',
  'including',
  'include',
  'includes',
  'required',
  'require',
  'requirements',
  'preferred',
  'requirement',
  'responsibilities',
  'responsibility',
  'qualifications',
  'qualification',
  'ability',
  'able',
  'using',
  'use',
  'used',
  'across',
  'within',
  'well',
  'strong',
  'good',
  'great',
  'excellent',
  'please',
  'apply',
  'application',
  'company',
  'opportunity',
  'candidate',
  'candidates',
  'description',
  'benefit',
  'benefits',
  'equal',
  'employer',
  'salary',
  'competitive',
  'skills',
  'skill',
  'looking',
  'join',
  'plus',
  'based',
  'multiple',
  'various',
  'several',
  'through',
  'during',
  'while',
  'built',
  'build',
  'building',
  'led',
  'lead',
  'leading',
  'managed',
  'manage',
  'managing',
  'developed',
  'developing',
  'designed',
  'created',
  'helped',
  'supported',
  'delivered',
  'shipped',
  'responsible',
  'communication',
  'collaborative',
  'collaboration',
  'fast',
  'paced',
  'environment',
  'people',
  'etc',
  'eg',
  'ie',
]);

const aliasToId = new Map<string, string>();
const formsById = new Map<string, string[]>();

for (const group of ALIAS_GROUPS) {
  const id = group[0] ?? '';
  if (!id) continue;
  formsById.set(id, [...group]);
  for (const member of group) aliasToId.set(member, id);
}

const lexicon = new Set<string>([...KEYWORD_TERMS, ...KEYWORD_PHRASES, ...aliasToId.keys()]);

const TOKEN_RE =
  /[A-Za-z](?:\.[A-Za-z])+\.?|[A-Za-z][A-Za-z0-9+#]*(?:\.[A-Za-z0-9]+)+|\.NET|C\+\+|C#|[A-Za-z][A-Za-z0-9]*/g;

export interface Token {
  raw: string;
  /** Lower case, dots and apostrophes removed; C++ is "cplusplus". */
  fold: string;
  index: number;
}

interface FoundKeyword {
  id: string;
  label: string;
  index: number;
  rank: number;
}

function foldToken(raw: string): string {
  const lower = raw.toLowerCase().replace(/[’']/g, '');
  if (lower === 'c++') return 'cplusplus';
  if (lower === 'c#') return 'csharp';
  if (lower === '.net') return 'dotnet';
  return lower.replace(/\./g, '');
}

function canonical(phrase: string): string | null {
  if (!phrase || STOPWORDS.has(phrase)) return null;
  return aliasToId.get(phrase) ?? (lexicon.has(phrase) ? phrase : null);
}

function formsFor(id: string): string[] {
  return formsById.get(id) ?? [id];
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(TOKEN_RE)) {
    const raw = match[0];
    if (!raw) continue;
    const fold = foldToken(raw);
    if (!fold) continue;
    tokens.push({ raw, fold, index: match.index ?? 0 });
  }
  return tokens;
}

function isCamel(raw: string): boolean {
  return /[a-z][A-Z]/.test(raw) || /^iOS$/i.test(raw);
}

function acronymId(raw: string): string | null {
  if (!/^[A-Z][A-Z0-9]{1,5}$/.test(raw)) return null;
  if (ACRONYM_DENY.has(raw)) return null;
  if (raw.length === 2 && !SHORT_ACRONYMS.has(raw) && !/\d/.test(raw)) return null;
  const fold = raw.toLowerCase();
  if (STOPWORDS.has(fold)) return null;
  return aliasToId.get(fold) ?? fold;
}

function degreeId(raw: string): string | null {
  const dottedOrCaps = raw.includes('.') || raw === raw.toUpperCase();
  if (!dottedOrCaps) return null;
  if (/^b\.?s\.?$/i.test(raw)) return 'bachelors';
  if (/^m\.?s\.?$/i.test(raw)) return 'masters';
  if (/^ph\.?d\.?$/i.test(raw)) return 'phd';
  return null;
}

function symbolId(raw: string): string | null {
  const lower = raw.toLowerCase();
  if (lower === 'c++') return 'cplusplus';
  if (lower === 'c#') return 'csharp';
  if (lower === '.net') return 'dotnet';
  return null;
}

function phraseLabel(text: string, slice: Token[]): string {
  const start = slice[0]?.index ?? 0;
  const endToken = slice[slice.length - 1];
  const end = endToken ? endToken.index + endToken.raw.length : start;
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

function extractKeywords(text: string): FoundKeyword[] {
  const tokens = tokenize(text);
  const found = new Map<string, FoundKeyword>();
  const consumed = new Set<number>();

  const consider = (id: string, label: string, index: number, rank: number) => {
    const clean = label.replace(/\s+/g, ' ').trim();
    if (!id || !clean || clean.length > 48 || STOPWORDS.has(id)) return;
    const existing = found.get(id);
    if (!existing) {
      found.set(id, { id, label: clean, index, rank });
      return;
    }
    if (index < existing.index) {
      existing.index = index;
      existing.label = clean;
    }
    if (rank > existing.rank) existing.rank = rank;
  };

  for (const size of [3, 2]) {
    for (let i = 0; i + size <= tokens.length; i += 1) {
      const slice = tokens.slice(i, i + size);
      if (slice.some((token) => consumed.has(token.index))) continue;
      const phrase = slice.map((token) => token.fold).join(' ');
      const id = canonical(phrase);
      if (!id || !phrase.includes(' ')) continue;
      consider(id, phraseLabel(text, slice), slice[0]?.index ?? 0, 4);
      for (const token of slice) consumed.add(token.index);
    }
  }

  for (const token of tokens) {
    if (consumed.has(token.index)) continue;
    const symbol = symbolId(token.raw);
    if (symbol) {
      consider(symbol, token.raw, token.index, 3);
      consumed.add(token.index);
      continue;
    }
    const degree = degreeId(token.raw);
    if (degree) {
      consider(degree, token.raw, token.index, 3);
      consumed.add(token.index);
      continue;
    }
    const acronym = acronymId(token.raw);
    if (acronym) {
      consider(acronym, token.raw, token.index, 3);
      consumed.add(token.index);
    }
  }

  for (const token of tokens) {
    if (consumed.has(token.index) || token.fold.length < 2) continue;
    if (isCamel(token.raw)) {
      consider(canonical(token.fold) ?? token.fold, token.raw, token.index, 3);
      consumed.add(token.index);
    }
  }

  for (const token of tokens) {
    if (consumed.has(token.index) || token.fold.length < 2) continue;
    const id = canonical(token.fold);
    if (!id) continue;
    consider(id, token.raw, token.index, 2);
    consumed.add(token.index);
  }

  const counts = new Map<string, { count: number; token: Token }>();
  for (const token of tokens) {
    if (consumed.has(token.index) || token.fold.length < 5 || STOPWORDS.has(token.fold)) continue;
    const bucket = counts.get(token.fold);
    if (bucket) bucket.count += 1;
    else counts.set(token.fold, { count: 1, token });
  }
  for (const [fold, bucket] of counts) {
    if (bucket.count < 2) continue;
    consider(fold, bucket.token.raw, bucket.token.index, 1);
  }

  const ranked = [...found.values()].sort((a, b) => b.rank - a.rank || a.index - b.index);
  const kept = new Set(ranked.slice(0, MAX_KEYWORDS).map((keyword) => keyword.id));
  return [...found.values()]
    .filter((keyword) => kept.has(keyword.id))
    .sort((a, b) => a.index - b.index);
}

function occurs(tokens: readonly Token[], keyword: Pick<JobKeyword, 'id' | 'forms'>): boolean {
  for (const form of keyword.forms ?? formsFor(keyword.id)) {
    if (form.includes(' ')) {
      const parts = form.split(' ');
      for (let i = 0; i + parts.length <= tokens.length; i += 1) {
        const window = tokens.slice(i, i + parts.length).map((token) => token.fold);
        if (window.every((fold, index) => fold === parts[index])) return true;
      }
      continue;
    }
    if (tokens.some((token) => token.fold === form && token.fold.length >= 2)) return true;
  }
  return false;
}

function coverage(present: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((100 * present) / total);
}

function split(keywords: FoundKeyword[], other: Token[]): { present: string[]; absent: string[] } {
  const present: string[] = [];
  const absent: string[] = [];
  for (const keyword of keywords) {
    if (occurs(other, keyword)) present.push(keyword.label);
    else absent.push(keyword.label);
  }
  return { present, absent };
}

/** Keywords from each side, and which of them show up on the other side. */
export function matchKeywords(resumeText: string, jobText: string): KeywordMatch {
  const resumeTokens = tokenize(resumeText);
  const jobTokens = tokenize(jobText);
  const resumeKeywords = extractKeywords(resumeText);
  const jobKeywords = extractKeywords(jobText);
  const job = split(jobKeywords, resumeTokens);
  const resume = split(resumeKeywords, jobTokens);

  return {
    jobCoverage: coverage(job.present.length, jobKeywords.length),
    resumeCoverage: coverage(resume.present.length, resumeKeywords.length),
    presentOnResume: job.present,
    missingFromResume: job.absent,
    presentInJob: resume.present,
    onlyOnResume: resume.absent,
  };
}

/** The keywords a posting asks for, in posting order. */
export function readJobKeywords(jobText: string): JobKeyword[] {
  return extractKeywords(jobText).map(({ id, label }) => ({ id, label }));
}

/** Which of `keywords` appear in `text`, as the posting writes them. */
export function keywordsIn(text: string, keywords: readonly JobKeyword[]): string[] {
  if (keywords.length === 0 || !text.trim()) return [];
  const tokens = tokenize(text);
  return keywords.filter((keyword) => occurs(tokens, keyword)).map((keyword) => keyword.label);
}

/** A term's tokens, folded and joined: "Node.js" is "nodejs", "CI/CD" is "ci cd". */
export function foldPhrase(text: string): string {
  return tokenize(text)
    .map((token) => token.fold)
    .join(' ');
}

/** One id for every way of writing a term: "Node.js" and "node" are both "nodejs". */
export function termId(term: string): string {
  const phrase = foldPhrase(term);
  return aliasToId.get(phrase) ?? phrase;
}

/** The phrase with its last word made plural or singular, or null when that does not apply. */
export function otherNumber(phrase: string): string | null {
  const words = phrase.split(' ');
  const last = words[words.length - 1] ?? '';
  if (last.length < 3 || /\d$/.test(last)) return null;
  const swapped =
    last.endsWith('s') && !last.endsWith('ss')
      ? last.length > 3
        ? last.slice(0, -1)
        : null
      : `${last}s`;
  return swapped ? [...words.slice(0, -1), swapped].join(' ') : null;
}

/**
 * Every written form of a term and its aliases: their alias groups, and the
 * plural or singular of the last word, so "microservice" finds "microservices".
 */
export function termForms(term: string, aliases: readonly string[] = []): string[] {
  const forms = new Set<string>();
  for (const written of [term, ...aliases]) {
    const phrase = foldPhrase(written);
    if (!phrase) continue;
    const id = aliasToId.get(phrase);
    for (const form of id ? formsFor(id) : [phrase]) {
      forms.add(form);
      const other = otherNumber(form);
      if (other) forms.add(other);
    }
  }
  return [...forms];
}

/** Text tokenized once, for checking many terms against it. Tokens are in reading order. */
export type TextIndex = readonly Token[];

export function indexText(text: string): TextIndex {
  return tokenize(text);
}

export function hasTerm(index: TextIndex, forms: readonly string[]): boolean {
  return forms.length > 0 && occurs(index, { id: '', forms });
}
