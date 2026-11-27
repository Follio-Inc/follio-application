/**
 * Decide whether a resume phrase actually supports a job requirement.
 *
 * The model proposes quotes. This file is the part that keeps a green mark
 * honest: a requirement is green only when the resume shares its specific
 * words (or a known equivalent, such as React and React.js). Generic
 * wording, benefits, and soft-skill filler never become marks.
 */

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
  'you',
  'will',
  'can',
  'able',
  'via',
  'per',
  'such',
  'than',
  'then',
  'also',
  'not',
  'but',
  'all',
  'any',
  'who',
  'what',
  'when',
  'where',
  'which',
  'while',
  'about',
  'across',
  'after',
  'before',
  'between',
  'within',
  'including',
  'include',
  'includes',
  'plus',
  'strong',
  'good',
  'great',
  'excellent',
  'proven',
  'solid',
  'deep',
  'hands',
  'hand',
  'high',
  'highly',
  'well',
  'very',
  'etc',
  'other',
]);

/** Words that show up on every posting and do not identify a requirement. */
const WEAK = new Set([
  'experience',
  'experiences',
  'year',
  'years',
  'yrs',
  'skill',
  'skills',
  'knowledge',
  'ability',
  'abilities',
  'work',
  'working',
  'worked',
  'development',
  'developer',
  'software',
  'team',
  'teams',
  'role',
  'roles',
  'responsible',
  'responsibility',
  'responsibilities',
  'environment',
  'professional',
  'required',
  'requirements',
  'preferred',
  'qualification',
  'qualifications',
  'looking',
  'candidate',
  'must',
  'should',
  'need',
  'needs',
  'familiar',
  'familiarity',
  'understanding',
  'background',
  'related',
  'relevant',
  'similar',
  'equivalent',
  'minimum',
  'least',
  'more',
  'building',
  'build',
  'built',
  'using',
  'use',
  'used',
  'develop',
  'developing',
  'degree',
  'degrees',
]);

/** Soft skills. They are real words, and they are not what this screen marks. */
const SOFT = new Set([
  'communication',
  'communications',
  'interpersonal',
  'teamwork',
  'passionate',
  'motivated',
  'motivation',
  'starter',
  'detail',
  'oriented',
  'hardworking',
  'dynamic',
  'synergy',
  'collaborative',
  'collaboration',
  'player',
  'attitude',
  'multitasking',
  'organized',
  'organisation',
  'organization',
  'friendly',
  'personable',
  'energetic',
  'enthusiastic',
  'flexible',
  'flexibility',
]);

const SHORT_OK = new Set(['go', 'js', 'ts', 'ml', 'ai', 'qa', 'ui', 'ux', 'cs']);

/** Written forms that mean the same tool or credential. */
const ALIASES: Record<string, string> = {
  js: 'javascript',
  javascript: 'javascript',
  ts: 'typescript',
  typescript: 'typescript',
  node: 'nodejs',
  nodejs: 'nodejs',
  react: 'react',
  reactjs: 'react',
  k8s: 'kubernetes',
  kubernetes: 'kubernetes',
  postgres: 'postgresql',
  postgresql: 'postgresql',
  psql: 'postgresql',
  golang: 'go',
  go: 'go',
  py: 'python',
  python: 'python',
  'c++': 'cpp',
  cpp: 'cpp',
  'c#': 'csharp',
  csharp: 'csharp',
  bs: 'bachelor',
  bsc: 'bachelor',
  ba: 'bachelor',
  bachelor: 'bachelor',
  bachelors: 'bachelor',
  ms: 'master',
  msc: 'master',
  master: 'master',
  masters: 'master',
  phd: 'phd',
  doctorate: 'phd',
};

const BOILERPLATE = [
  /equal opportunity/i,
  /without regard to/i,
  /\beeo\b/i,
  /competitive (?:salary|pay|compensation|benefits)/i,
  /fast-paced environment/i,
  /benefits package/i,
  /what you'?ll (?:love|enjoy|get)/i,
  /we offer\b/i,
  /about (?:us|the company|our company)\b/i,
  /our mission\b/i,
  /perks and benefits/i,
];

export function tokenize(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9]+(?:\+\+|#)?(?:\.[a-z0-9]+)*/g) ?? [];
}

export function canon(token: string): string {
  if (ALIASES[token]) return ALIASES[token];
  const folded = token.replace(/\./g, '');
  return ALIASES[folded] ?? folded;
}

function isSpecific(token: string): boolean {
  if (STOP.has(token) || WEAK.has(token) || SOFT.has(token)) return false;
  if (/^\d+$/.test(token)) return true;
  if (token.length > 2) return true;
  return SHORT_OK.has(token);
}

/** Surrounding words. They do not, by themselves, make a requirement or prove one. */
const CONTEXT = new Set([
  'production',
  'web',
  'services',
  'service',
  'applications',
  'application',
  'apps',
  'app',
  'senior',
  'junior',
  'modern',
  'large',
  'scalable',
  'scale',
  'plus',
]);

/** The words that identify a requirement, with equivalents collapsed. */
export function requirementTokens(quote: string, label: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const token of tokenize(`${quote} ${label}`)) {
    if (!isSpecific(token)) continue;
    const name = canon(token);
    if (seen.has(name)) continue;
    seen.add(name);
    tokens.push(name);
  }
  return tokens;
}

/** Skill, tool, or domain words. Numbers and filler around them are handled apart. */
function coreTokens(text: string): string[] {
  return requirementTokens(text, '').filter((token) => !CONTEXT.has(token) && !/^\d+$/.test(token));
}

/** The name of the requirement: the label when it has one, otherwise the quote. */
function namedTokens(quote: string, label: string): string[] {
  const fromLabel = coreTokens(label);
  return fromLabel.length > 0 ? fromLabel : coreTokens(quote);
}

function tokenSet(quotes: string[]): Set<string> {
  return new Set(quotes.flatMap((quote) => tokenize(quote).filter(isSpecific).map(canon)));
}

export function yearsAsked(text: string): number | null {
  const match = text.match(/(\d+)\s*\+?\s*(?:years|yrs)\b/i);
  return match ? Number(match[1]) : null;
}

export function yearsShown(text: string): number | null {
  const found = [...text.matchAll(/(\d+)\s*\+?\s*(?:years|yrs)\b/gi)];
  if (found.length === 0) return null;
  return Math.max(...found.map((match) => Number(match[1])));
}

export function isBoilerplate(quote: string): boolean {
  const trimmed = quote.trim();
  if (!trimmed) return true;
  return BOILERPLATE.some((pattern) => {
    const match = trimmed.match(pattern);
    if (!match || match.index == null) return false;
    const longEnough = match[0].length >= Math.min(trimmed.length, 24);
    const coversQuote = match[0].length / trimmed.length >= 0.45;
    return longEnough || coversQuote;
  });
}

/** A requirement the screen should mark. Soft filler and empty phrases are not. */
export function isScreenable(quote: string, label: string): boolean {
  if (isBoilerplate(quote)) return false;
  if (namedTokens(quote, label).length > 0) return true;
  return yearsAsked(`${quote} ${label}`) != null;
}

/**
 * True when these resume phrases, together, cover the requirement.
 * The requirement's name has to appear. A year count has to be met when the
 * posting asks for one. Extra words such as "production" do not all have to.
 */
export function evidenceSetSupports(jdQuote: string, label: string, quotes: string[]): boolean {
  const asked = yearsAsked(`${jdQuote} ${label}`);
  const shownValues = quotes.map(yearsShown).filter((value): value is number => value != null);
  const shown = shownValues.length > 0 ? Math.max(...shownValues) : null;
  if (asked != null && (shown == null || shown < asked)) return false;

  const named = namedTokens(jdQuote, label);
  if (named.length === 0) return asked != null;
  const have = tokenSet(quotes);
  return named.every((token) => have.has(token));
}

/**
 * True when this one resume phrase is worth a line.
 * A phrase that shares nothing with the requirement is not drawn.
 */
export function quoteContributes(jdQuote: string, label: string, evidence: string): boolean {
  const have = tokenSet([evidence]);
  if (namedTokens(jdQuote, label).some((token) => have.has(token))) return true;
  return yearsAsked(`${jdQuote} ${label}`) != null && yearsShown(evidence) != null;
}
