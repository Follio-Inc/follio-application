/**
 * What one suggestion does to its line, in the terms of the writing checks:
 * "Adds a number", "Stronger verb", "8 fewer words", or "Drops a number".
 * Runs on the text as the user edits it, so the labels stay true.
 */

import type { EditOp } from '@/lib/resume-edit/types';

import { keywordsIn } from './keywords';
import { numbersIn, readLine } from './lines';
import type { ChangeEffect, JobKeyword } from './types';

const MAX_KEYWORDS_SHOWN = 2;
const FEWER_WORDS_SHOWN = 3;

export interface ChangeEffectInput {
  op: EditOp;
  /** Bullets are graded on how they open; a headline or summary is not. */
  isBullet: boolean;
  before: string;
  after: string;
  jobKeywords?: readonly JobKeyword[];
}

function newKeywords(before: string, after: string, keywords: readonly JobKeyword[]): string[] {
  const had = new Set(keywordsIn(before, keywords).map((label) => label.toLowerCase()));
  return keywordsIn(after, keywords).filter((label) => !had.has(label.toLowerCase()));
}

export function changeEffects({
  op,
  isBullet,
  before,
  after,
  jobKeywords = [],
}: ChangeEffectInput): ChangeEffect[] {
  if (op === 'delete' || !after.trim()) return [];
  const gains: string[] = [];
  const losses: string[] = [];
  const next = readLine(after);

  if (op === 'insert') {
    if (next.hasNumber) gains.push('Has a number');
    if (next.showsResult) gains.push('Says what changed');
    if (next.tooLong) losses.push('Runs long');
  } else {
    const prev = readLine(before);
    const kept = new Set(numbersIn(after));
    if (numbersIn(before).some((value) => !kept.has(value))) losses.push('Drops a number');
    else if (!prev.hasNumber && next.hasNumber) gains.push('Adds a number');

    if (isBullet) {
      const openedWeakly = prev.weakOpener !== null || !prev.actionOpener;
      if (openedWeakly && next.actionOpener) gains.push('Stronger verb');
      else if (prev.actionOpener && !next.actionOpener) losses.push('Weaker opening');

      if (!prev.leadsWithResult && next.leadsWithResult) gains.push('Leads with the result');
      else if (!prev.showsResult && next.showsResult) gains.push('Says what changed');

      if (next.tooLong && !prev.tooLong) losses.push('Runs long');
    }

    const fewer = prev.words - next.words;
    if (fewer >= FEWER_WORDS_SHOWN) gains.push(`${fewer} fewer words`);
    else if (prev.filler.length > next.filler.length) gains.push('Less filler');
  }

  for (const keyword of newKeywords(op === 'insert' ? '' : before, after, jobKeywords).slice(
    0,
    MAX_KEYWORDS_SHOWN
  )) {
    gains.push(`Uses “${keyword}”`);
  }

  return [
    ...gains.map((label) => ({ tone: 'gain' as const, label })),
    ...losses.map((label) => ({ tone: 'loss' as const, label })),
  ];
}
