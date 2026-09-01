/**
 * Pick a sparse set of highlight phrases from a JD match.
 * Skills first, then one matching role title, then a few technical keywords.
 * Generic job words ("engineer", "senior") never become highlights.
 */

import { inferJobTitleHint } from '@/lib/jd-match/score';
import { extractKeywordCandidates, normalizeToken } from '@/lib/jd-match/tokenize';
import type { JdMatchResult, ResumeCorpus } from '@/lib/jd-match/types';

import { buildPhraseRegex, phraseAppearsIn } from './highlight';
import { MAX_LENS_PHRASES, type LensPhraseKind } from './types';

const GENERIC_JOB_WORDS = new Set(
  [
    'engineer',
    'engineering',
    'developer',
    'development',
    'manager',
    'management',
    'senior',
    'junior',
    'staff',
    'principal',
    'lead',
    'software',
    'product',
    'business',
    'technical',
    'technology',
    'professional',
    'specialist',
    'analyst',
    'consultant',
    'coordinator',
    'associate',
    'intern',
    'internship',
    'director',
    'systems',
    'system',
    'platform',
    'platforms',
    'application',
    'applications',
    'service',
    'services',
    'solution',
    'solutions',
    'support',
    'process',
    'processes',
    'project',
    'projects',
    'people',
    'person',
    'communication',
    'collaborative',
    'collaboration',
    'agile',
    'scrum',
    'remote',
    'hybrid',
    'onsite',
    'fulltime',
    'full',
    'time',
    'part',
  ].map((w) => w.toLowerCase())
);

export interface SelectedPhrase {
  id: string;
  phrase: string;
  kind: LensPhraseKind;
}

function isGenericPhrase(phrase: string): boolean {
  const tokens = normalizeToken(phrase).split(' ').filter(Boolean);
  if (tokens.length === 0) return true;
  if (tokens.length === 1 && GENERIC_JOB_WORDS.has(tokens[0]!)) return true;
  if (tokens.length === 1 && tokens[0]!.length < 2) return true;
  return tokens.every((t) => GENERIC_JOB_WORDS.has(t));
}

function resumeCasing(phrase: string, skills: string[], bodyText: string): string {
  const norm = normalizeToken(phrase);
  const skillHit = skills.find((s) => normalizeToken(s) === norm);
  if (skillHit) return skillHit.trim();

  const re = buildPhraseRegex(phrase);
  const match = re ? bodyText.match(re) : null;
  return match?.[0]?.trim() || phrase.trim();
}

function pushUnique(
  out: SelectedPhrase[],
  seen: Set<string>,
  phrase: string,
  kind: LensPhraseKind,
  skills: string[],
  bodyText: string
): void {
  const trimmed = phrase.trim();
  if (!trimmed || isGenericPhrase(trimmed)) return;
  if (!phraseAppearsIn(bodyText, trimmed)) {
    const inSkills = skills.some((s) => normalizeToken(s) === normalizeToken(trimmed));
    if (!inSkills) return;
  }
  const key = normalizeToken(trimmed);
  if (!key || seen.has(key)) return;
  // Drop if this phrase is a shorter substring of an already selected phrase
  for (const existing of seen) {
    if (existing.includes(key) && existing !== key && key.length <= 4) return;
  }
  seen.add(key);
  out.push({
    id: `lens-${out.length}`,
    phrase: resumeCasing(trimmed, skills, bodyText),
    kind,
  });
}

function bestMatchingRole(roles: string[], jdText: string): string | null {
  const jdNorm = normalizeToken(jdText);
  let best: { role: string; score: number } | null = null;

  for (const role of roles) {
    const roleNorm = normalizeToken(role);
    if (!roleNorm || roleNorm.length < 4) continue;
    if (jdNorm.includes(roleNorm)) {
      const score = roleNorm.length;
      if (!best || score > best.score) best = { role, score };
      continue;
    }
  }

  return best?.role ?? null;
}

/**
 * Choose up to MAX_LENS_PHRASES highlights. Order is the visual priority.
 */
export function selectLensPhrases(
  corpus: ResumeCorpus,
  match: JdMatchResult,
  jdText: string
): SelectedPhrase[] {
  const bodyText = [corpus.headline, corpus.summary, corpus.bodyText].filter(Boolean).join('\n');
  const out: SelectedPhrase[] = [];
  const seen = new Set<string>();

  for (const skill of match.matchedSkills) {
    if (out.length >= MAX_LENS_PHRASES) break;
    pushUnique(out, seen, skill, 'skill', corpus.skills, bodyText);
  }

  const role = bestMatchingRole(corpus.roles, jdText);
  if (role && out.length < MAX_LENS_PHRASES) {
    pushUnique(out, seen, role, 'role', corpus.skills, bodyText);
  }

  const titleHint = inferJobTitleHint(jdText);
  if (titleHint && out.length < MAX_LENS_PHRASES && phraseAppearsIn(bodyText, titleHint)) {
    pushUnique(out, seen, titleHint, 'role', corpus.skills, bodyText);
  }

  const extras = extractKeywordCandidates(jdText, corpus.skills);
  for (const extra of extras) {
    if (out.length >= MAX_LENS_PHRASES) break;
    pushUnique(out, seen, extra, 'keyword', corpus.skills, bodyText);
  }

  return out.slice(0, MAX_LENS_PHRASES);
}
