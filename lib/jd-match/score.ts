/**
 * Score a Follio resume corpus against a job description.
 *
 * Deterministic, explainable matching for the extension MVP:
 * - skill / keyword coverage
 * - role title overlap
 * - overall lexical overlap
 */

import { buildResumeCorpus, type ProfileForMatch } from './build-resume-corpus';
import {
  bandFromScore,
  extractKeywordCandidates,
  labelForBand,
  normalizeToken,
  tokenize,
  uniqueTokens,
} from './tokenize';
import type { JdMatchResult, ResumeCorpus } from './types';

const MAX_MISSING = 8;
const MAX_MATCHED = 12;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) {
    if (b.has(t)) inter += 1;
  }
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function roleOverlapScore(roles: string[], jdText: string): number {
  if (roles.length === 0) return 0;
  const jd = normalizeToken(jdText);
  const jdTokens = uniqueTokens(jdText);
  let best = 0;

  for (const role of roles) {
    const roleNorm = normalizeToken(role);
    if (!roleNorm) continue;
    if (jd.includes(roleNorm)) {
      best = Math.max(best, 1);
      continue;
    }
    const roleTokens = tokenize(role);
    if (roleTokens.length === 0) continue;
    const hits = roleTokens.filter((t) => jdTokens.has(t)).length;
    best = Math.max(best, hits / roleTokens.length);
  }

  return best;
}

/**
 * Infer a short job title hint from the first lines of a JD / page text.
 */
export function inferJobTitleHint(jdText: string): string | null {
  const lines = jdText
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 12);

  for (const line of lines) {
    if (line.length < 4 || line.length > 90) continue;
    if (/^(about|job description|responsibilities|requirements|qualifications)\b/i.test(line)) {
      continue;
    }
    // Prefer lines that look like titles
    if (
      /\b(engineer|developer|designer|manager|analyst|scientist|specialist|lead|director|intern|coordinator|consultant|architect)\b/i.test(
        line
      )
    ) {
      return line.replace(/\s+/g, ' ').slice(0, 90);
    }
  }

  return lines[0]?.slice(0, 90) ?? null;
}

export function scoreResumeAgainstJd(resume: ResumeCorpus, jdText: string): JdMatchResult {
  const jd = jdText.trim();
  if (!jd) {
    return {
      resumeId: resume.id,
      handle: resume.handle,
      resumeTitle: resume.resumeTitle,
      score: 0,
      band: 'weak',
      label: labelForBand('weak'),
      matchedSkills: [],
      missingKeywords: [],
      summary: 'No job description text was provided.',
    };
  }

  const resumeTokens = uniqueTokens(
    [resume.headline, resume.summary, resume.skills.join(' '), resume.bodyText]
      .filter(Boolean)
      .join('\n')
  );
  const jdTokens = uniqueTokens(jd);

  const skillCandidates = extractKeywordCandidates(jd, resume.skills);
  const resumeSkillSet = new Set(resume.skills.map((s) => normalizeToken(s)).filter(Boolean));
  const resumeTextNorm = normalizeToken(resume.bodyText);

  const matchedSkills: string[] = [];
  const missingFromJdSkills: string[] = [];

  for (const skill of resume.skills) {
    const norm = normalizeToken(skill);
    if (!norm) continue;
    if (normalizeToken(jd).includes(norm) || jdTokens.has(norm.split(' ')[0] ?? '')) {
      // Confirm phrase or majority of tokens present in JD
      const parts = tokenize(skill);
      const hit =
        normalizeToken(jd).includes(norm) ||
        (parts.length > 0 &&
          parts.filter((p) => jdTokens.has(p)).length >= Math.ceil(parts.length * 0.6));
      if (hit) matchedSkills.push(skill);
    }
  }

  // Keywords emphasized in JD but absent from resume
  for (const kw of skillCandidates) {
    const inResume =
      resumeSkillSet.has(kw) ||
      resumeTextNorm.includes(kw) ||
      [...resumeTokens].some((t) => t === kw || kw.includes(t));
    if (!inResume) {
      missingFromJdSkills.push(kw);
    }
  }

  // Dedupe matched (case-insensitive)
  const matchedUnique = [
    ...new Map(matchedSkills.map((s) => [normalizeToken(s), s])).values(),
  ].slice(0, MAX_MATCHED);
  const missingUnique = [
    ...new Map(missingFromJdSkills.map((s) => [normalizeToken(s), s])).values(),
  ].slice(0, MAX_MISSING);

  const skillCoverage =
    resume.skills.length === 0
      ? 0
      : matchedUnique.length / Math.min(resume.skills.length, Math.max(matchedUnique.length, 1));

  // Better skill coverage: of JD skill candidates that map to resume skills
  const jdSkillHits = resume.skills.filter((s) => {
    const norm = normalizeToken(s);
    return norm && normalizeToken(jd).includes(norm);
  }).length;
  const skillScore =
    resume.skills.length === 0
      ? jaccard(resumeTokens, jdTokens)
      : clamp(jdSkillHits / Math.max(Math.min(resume.skills.length, 12), 1), 0, 1);

  const lexical = jaccard(resumeTokens, jdTokens);
  const roleScore = roleOverlapScore(resume.roles, jd);

  // Weighted blend
  const raw =
    skillScore * 0.45 + lexical * 0.3 + roleScore * 0.2 + Math.min(skillCoverage, 1) * 0.05;
  const score = Math.round(clamp(raw, 0, 1) * 100);
  const band = bandFromScore(score);

  let summary: string;
  if (band === 'strong') {
    summary = `Strong overlap with this role${matchedUnique.length ? ` (${matchedUnique.slice(0, 4).join(', ')})` : ''}.`;
  } else if (band === 'good') {
    summary = `Solid overlap; a few gaps remain${missingUnique.length ? ` (e.g. ${missingUnique.slice(0, 3).join(', ')})` : ''}.`;
  } else if (band === 'fair') {
    summary = `Partial overlap — consider tailoring this resume before applying.`;
  } else {
    summary = `Weak overlap with this posting — another resume may fit better.`;
  }

  return {
    resumeId: resume.id,
    handle: resume.handle,
    resumeTitle: resume.resumeTitle,
    score,
    band,
    label: labelForBand(band),
    matchedSkills: matchedUnique,
    missingKeywords: missingUnique,
    summary,
  };
}

export function scoreProfilesAgainstJd(
  profiles: ProfileForMatch[],
  jdText: string
): JdMatchResult[] {
  const results = profiles.map((p) => scoreResumeAgainstJd(buildResumeCorpus(p), jdText));
  return results.sort((a, b) => b.score - a.score);
}
