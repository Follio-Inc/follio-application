/**
 * Build a recruiter reading lens from a profile + job description.
 * Deterministic and client-safe — no network, no rewrite of resume text.
 */

import { buildResumeCorpus } from '@/lib/jd-match/build-resume-corpus';
import { inferJobTitleHint, scoreResumeAgainstJd } from '@/lib/jd-match/score';

import { indexPhraseOccurrences } from './occurrences';
import { selectLensPhrases } from './phrases';
import type { LensProfile, ResumeLensResult } from './types';

const STRIP_MATCHED = 3;
const STRIP_MISSING = 3;

function joinList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

export function buildRecruiterStrip(matched: string[], missing: string[]): string {
  const strong = matched.slice(0, STRIP_MATCHED);
  const light = missing.slice(0, STRIP_MISSING);

  if (strong.length > 0 && light.length > 0) {
    return `Strong on ${joinList(strong)}. Light on ${joinList(light)}.`;
  }
  if (strong.length > 0) {
    return `Strong on ${joinList(strong)}.`;
  }
  if (light.length > 0) {
    return `Light on ${joinList(light)}.`;
  }
  return 'No clear overlap with this role.';
}

export function buildResumeLens(profile: LensProfile, jdText: string): ResumeLensResult {
  const corpus = buildResumeCorpus(profile);
  const match = scoreResumeAgainstJd(corpus, jdText);
  const selected = selectLensPhrases(corpus, match, jdText);
  const phrases = indexPhraseOccurrences(profile, selected);

  return {
    jobTitleHint: inferJobTitleHint(jdText),
    band: match.band,
    strip: buildRecruiterStrip(match.matchedSkills, match.missingKeywords),
    matched: match.matchedSkills,
    missing: match.missingKeywords,
    phrases,
  };
}
