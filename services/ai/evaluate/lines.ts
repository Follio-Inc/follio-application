/**
 * Read one resume line the way a resume writer grades it: how it opens,
 * whether it has a number, whether it says what changed, and whether it
 * carries filler. Word lists, no model, so it can run on every keystroke.
 */

import { EDIT_PLACEHOLDER } from '@/lib/resume-edit/types';

import type { LineSignals } from './types';

/** Past this many words a bullet stops reading as one line. The writing prompt uses the same limit. */
export const LONG_LINE_WORDS = 30;

/** Openers that describe a duty or hide who did the work. Longest first, so the longest match wins. */
const WEAK_OPENERS = [
  'was responsible for',
  'were responsible for',
  'responsible for',
  'duties included',
  'duties include',
  'tasked with',
  'in charge of',
  'was involved in',
  'involved in',
  'was part of',
  'part of',
  'participated in',
  'worked on',
  'worked with',
  'helped to',
  'helped with',
  'helped',
  'helping',
  'assisted with',
  'assisted in',
  'assisted',
  'handled',
  'i',
  'my',
  'we',
  'our',
];

/** Words that pad a line without adding meaning. */
const FILLER = [
  'responsible for',
  'duties included',
  'successfully',
  'effectively',
  'various',
  'a variety of',
  'in order to',
  'a number of',
  'utilized',
  'utilizing',
  'utilize',
  'was able to',
  'were able to',
  'on a daily basis',
  'in terms of',
  'helped to',
];

/** Verbs that say what changed, in every form a bullet uses them. */
const RESULT_WORDS = new Set(
  [
    ['increased', 'increase', 'increasing', 'increases'],
    ['reduced', 'reduce', 'reducing', 'reduces'],
    ['cut', 'cuts', 'cutting'],
    ['grew', 'grow', 'growing', 'grows', 'grown'],
    ['saved', 'save', 'saving', 'saves'],
    ['improved', 'improve', 'improving', 'improves'],
    ['raised', 'raise', 'raising', 'raises'],
    ['boosted', 'boost', 'boosting', 'boosts'],
    ['lowered', 'lower', 'lowering', 'lowers'],
    ['decreased', 'decrease', 'decreasing', 'decreases'],
    ['accelerated', 'accelerate', 'accelerating', 'accelerates'],
    ['doubled', 'double', 'doubling', 'doubles'],
    ['tripled', 'triple', 'tripling', 'triples'],
    ['halved', 'halve', 'halving', 'halves'],
    ['eliminated', 'eliminate', 'eliminating', 'eliminates'],
    ['prevented', 'prevent', 'preventing', 'prevents'],
    ['generated', 'generate', 'generating', 'generates'],
    ['won', 'win', 'winning', 'wins'],
    ['achieved', 'achieve', 'achieving', 'achieves'],
    ['expanded', 'expand', 'expanding', 'expands'],
    ['shortened', 'shorten', 'shortening', 'shortens'],
    ['sped'],
    ['lifted', 'lift', 'lifting', 'lifts'],
    ['recovered', 'recover', 'recovering', 'recovers'],
    ['avoided', 'avoid', 'avoiding', 'avoids'],
    ['earned', 'earn', 'earning', 'earns'],
    ['exceeded', 'exceed', 'exceeding', 'exceeds'],
    ['surpassed', 'surpass', 'surpassing', 'surpasses'],
    ['secured', 'secure', 'securing', 'secures'],
    ['minimized', 'minimize', 'minimizing', 'minimised', 'minimise'],
    ['maximized', 'maximize', 'maximizing', 'maximised', 'maximise'],
  ].flat()
);

/** Action verbs a regular "-ed" rule misses: irregular past tense and present tense for a current role. */
const ACTION_WORDS = new Set([
  'led',
  'lead',
  'built',
  'build',
  'ran',
  'run',
  'drove',
  'drive',
  'wrote',
  'write',
  'made',
  'make',
  'set',
  'began',
  'took',
  'brought',
  'sold',
  'sell',
  'taught',
  'teach',
  'chose',
  'became',
  'found',
  'founded',
  'held',
  'kept',
  'oversaw',
  'oversee',
  'rebuilt',
  'rebuild',
  'rewrote',
  'rewrite',
  'spun',
  'split',
  'undertook',
  'upheld',
  'overcame',
  'forecast',
  'own',
  'manage',
  'design',
  'develop',
  'partner',
  'mentor',
  'scale',
  'ship',
  'launch',
  'analyze',
  'analyse',
  'create',
  'deliver',
  'define',
  'coordinate',
  'maintain',
  'direct',
  'architect',
  'implement',
  'automate',
  'migrate',
  'negotiate',
  'establish',
  'streamline',
  'optimize',
  'optimise',
  'plan',
  'research',
  'test',
  'train',
  'advise',
  'coach',
  'hire',
  'recruit',
  'present',
  'publish',
  'prototype',
  'review',
  'audit',
  'model',
  'produce',
  'edit',
  'curate',
  'organize',
  'facilitate',
  'champion',
  'spearhead',
  'pioneer',
  'redesign',
  'refactor',
  'standardize',
  'consolidate',
  'integrate',
  'deploy',
  'monitor',
  'resolve',
  'investigate',
  'identify',
  'evaluate',
  'assess',
  'operate',
  'supervise',
  'head',
  'chair',
]);

/** "-ed" words that are not verbs when they open a line. */
const NOT_VERBS = new Set(['need', 'seed', 'speed', 'feed', 'bed', 'red', 'shed', 'embedded']);

/** Words that state a figure without digits. */
const NUMBER_WORDS =
  /\b(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|fifty|dozens?|hundreds|thousands|millions|billions|twice|doubled|tripled|quadrupled|halved)\b/i;

const RESULT_PHRASES = /\b(?:resulting in|leading to|which led to|led to a)\b/i;
const PERCENT = /(?:\d|\[__\])\s*%|\bpercent\b/i;
const MONEY = /[$€£]\s?(?:\d|\[__\])/;
const MULTIPLIER = /\b\d+(?:\.\d+)?x\b/i;
const FROM_TO = /\bfrom\s+\S*\d\S*\s+to\s+\S*\d/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const FILLER_PATTERNS = FILLER.map((phrase) => new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'i'));

function firstWord(text: string): string {
  const match = text.match(/[A-Za-z][A-Za-z'’-]*/);
  return match ? match[0].toLowerCase().replace(/[’']/g, '') : '';
}

function findWeakOpener(text: string): string | null {
  const lower = text.toLowerCase();
  for (const phrase of WEAK_OPENERS) {
    if (!lower.startsWith(phrase)) continue;
    const next = lower.charAt(phrase.length);
    if (next === '' || /[\s,:;.]/.test(next)) return text.slice(0, phrase.length);
  }
  return null;
}

function isActionVerb(word: string): boolean {
  const verb = word.replace(/^co-/, '');
  if (ACTION_WORDS.has(verb) || RESULT_WORDS.has(verb)) return true;
  return /^[a-z]{2,}ed$/.test(verb) && !NOT_VERBS.has(verb);
}

function stripLeadIn(text: string): string {
  return text.replace(/^[\s•*·–—-]+/, '').trim();
}

/** Grade one line. Blanks ([__]) are not numbers yet; they are counted apart. */
export function readLine(raw: string): LineSignals {
  const text = stripLeadIn(raw);
  const withoutBlanks = text.split(EDIT_PLACEHOLDER).join(' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  const opener = firstWord(text);
  const weakOpener = findWeakOpener(text);
  const tokens = text.toLowerCase().match(/[a-z]+/g) ?? [];

  const hasNumber = /\d/.test(withoutBlanks) || NUMBER_WORDS.test(withoutBlanks);
  const leadsWithResult = !weakOpener && RESULT_WORDS.has(opener);
  const showsResult =
    leadsWithResult ||
    tokens.some((token) => RESULT_WORDS.has(token)) ||
    RESULT_PHRASES.test(text) ||
    PERCENT.test(text) ||
    MONEY.test(text) ||
    MULTIPLIER.test(text) ||
    FROM_TO.test(text);

  const filler: string[] = [];
  for (const pattern of FILLER_PATTERNS) {
    const match = text.match(pattern);
    if (match && !filler.some((found) => found.toLowerCase() === match[0].toLowerCase())) {
      filler.push(match[0]);
    }
  }

  return {
    words,
    opener,
    weakOpener,
    actionOpener: words > 0 && !weakOpener && isActionVerb(opener),
    hasNumber,
    hasBlank: text.includes(EDIT_PLACEHOLDER),
    showsResult,
    leadsWithResult,
    filler,
    tooLong: words > LONG_LINE_WORDS,
  };
}

/** The numbers a line states, normalised so "$2,000" and "$2000" compare equal. */
export function numbersIn(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((value) => value.replace(/,/g, ''));
}
