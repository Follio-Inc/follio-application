/**
 * Score a resume against the four writing playbooks, and against a job's
 * keywords when there is one.
 *
 * Each writing score is "X of Y bullets pass", scaled to the share a strong
 * resume reaches, so 100 means "nothing left to fix here", not "every line
 * has a number". The same line grades feed the writing prompt, so what the
 * scores flag is what the model is asked to fix.
 */

import { plural } from '@/lib/resume-edit/review';
import { EDIT_PRESETS, RESUME_EDIT_LIMITS, type EditPresetId } from '@/lib/resume-edit/types';
import type { JobRequirement } from '@/services/ai/job-requirements/types';
import type { EditFacts } from '@/services/ai/resume-edit/facts';
import { matchRequirements } from '@/services/ai/skills/match';
import { readResumeSkills } from '@/services/ai/skills/profile';
import type { StoredSkillProfile } from '@/services/ai/skills/types';

import { matchKeywords } from './keywords';
import { LONG_LINE_WORDS, readLine } from './lines';
import type {
  JobKeywordCheck,
  LineIssue,
  LineSignals,
  ResumeEvaluation,
  WritingCheck,
} from './types';

const MAX_ISSUES = 3;

interface CheckSpec {
  label: string;
  /** Share of bullets that should pass for a full score. */
  share: number;
  target: string;
}

const CHECKS: Record<EditPresetId, CheckSpec> = {
  quantify: {
    label: 'Numbers',
    share: 0.6,
    target: 'Aim for a number in at least 6 of every 10 bullets.',
  },
  concise: {
    label: 'Concise',
    share: 1,
    target: `Keep every bullet under ${LONG_LINE_WORDS} words, with no filler.`,
  },
  verbs: {
    label: 'Action verbs',
    share: 1,
    target: 'Open every bullet with an action verb, and vary them within a role.',
  },
  outcomes: {
    label: 'Outcomes',
    share: 0.5,
    target: 'Aim for a result in at least half of your bullets.',
  },
};

/** One bullet with its grades. `repeatsOpener` is true when an earlier bullet in the role opens the same way. */
export interface GradedLine {
  text: string;
  signals: LineSignals;
  repeatsOpener: boolean;
}

/** Grade the bullets of one role, in order. */
export function gradeRole(lines: readonly string[]): GradedLine[] {
  const openers = new Set<string>();
  return lines.map((text) => {
    const signals = readLine(text);
    const repeatsOpener = signals.actionOpener && openers.has(signals.opener);
    if (signals.actionOpener) openers.add(signals.opener);
    return { text, signals, repeatsOpener };
  });
}

/** Why a line fails one check, in a few lower-case words, or null when it passes. */
export function lineIssue(check: EditPresetId, line: GradedLine): string | null {
  const { signals } = line;
  switch (check) {
    case 'quantify':
      return signals.hasNumber ? null : 'no number';
    case 'concise':
      if (signals.tooLong) return `${signals.words} words`;
      return signals.filler.length > 0 ? `filler “${signals.filler[0]}”` : null;
    case 'verbs':
      if (signals.weakOpener) return `opens with “${signals.weakOpener}”`;
      if (!signals.actionOpener) return 'no action verb first';
      return line.repeatsOpener ? `repeats “${signals.opener}” in this role` : null;
    case 'outcomes':
      return signals.showsResult ? null : 'no result stated';
  }
}

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function summaryFor(check: EditPresetId, passed: number, total: number): string {
  const failing = total - passed;
  switch (check) {
    case 'quantify':
      return `${passed} of ${plural(total, 'bullet')} ${passed === 1 ? 'has' : 'have'} a number.`;
    case 'outcomes':
      return `${passed} of ${plural(total, 'bullet')} ${passed === 1 ? 'says' : 'say'} what changed.`;
    case 'concise':
      if (failing === 0) return 'Every bullet is one tight line.';
      return `${plural(failing, 'bullet')} could be tighter.`;
    case 'verbs':
      if (failing === 0) return 'Every bullet opens with its own action verb.';
      return failing === 1
        ? '1 bullet opens weakly or repeats a verb.'
        : `${failing} bullets open weakly or repeat a verb.`;
  }
}

function scoreFor(passed: number, total: number, share: number): number | null {
  if (total === 0) return null;
  return Math.min(100, Math.round((100 * passed) / (total * share)));
}

/** Writing checks for every bullet on the resume. */
export function evaluateWriting(
  facts: EditFacts
): Pick<ResumeEvaluation, 'writing' | 'checks' | 'bulletCount'> {
  const lines = facts.experiences.flatMap((experience) =>
    gradeRole(experience.bullets.map((bullet) => bullet.text)).map((line, index) => ({
      line,
      ref: experience.bullets[index]?.ref ?? experience.ref,
      where: experience.label,
    }))
  );

  const checks: WritingCheck[] = EDIT_PRESETS.map(({ id }) => {
    const spec = CHECKS[id];
    const issues: LineIssue[] = [];
    let passed = 0;
    for (const { line, ref, where } of lines) {
      const issue = lineIssue(id, line);
      if (!issue) {
        passed += 1;
        continue;
      }
      if (issues.length < MAX_ISSUES) {
        issues.push({ ref, where, text: line.text, issue: sentenceCase(issue) });
      }
    }
    return {
      id,
      label: spec.label,
      score: scoreFor(passed, lines.length, spec.share),
      passed,
      total: lines.length,
      summary: summaryFor(id, passed, lines.length),
      target: spec.target,
      issues,
    };
  });

  const scored = checks.flatMap((check) => (check.score === null ? [] : [check.score]));
  const writing =
    scored.length === 0
      ? null
      : Math.round(scored.reduce((sum, score) => sum + score, 0) / scored.length);
  return { writing, checks, bulletCount: lines.length };
}

/** The resume as plain text, in reading order. Keyword counts and the recruiter read both use it. */
export function resumeText(facts: EditFacts): string {
  const blocks: string[] = [];
  const top = [facts.headline, facts.summary].filter(Boolean).join('\n');
  if (top) blocks.push(top);
  for (const experience of facts.experiences) {
    blocks.push(
      [
        [experience.label, experience.dates].filter(Boolean).join(' · '),
        ...experience.bullets.map((bullet) => `- ${bullet.text}`),
      ].join('\n')
    );
  }
  if (facts.skills.length > 0) blocks.push(`Skills: ${facts.skills.join(', ')}`);
  if (facts.education.length > 0) blocks.push(`Education: ${facts.education.join('; ')}`);
  if (facts.other.length > 0) blocks.push(facts.other.join('\n'));
  return blocks.join('\n\n');
}

/** Whether a posting is long enough to score against. Matches the edit request's own minimum. */
export function isScorableJob(jobDescription: string | null | undefined): boolean {
  return (jobDescription?.trim().length ?? 0) >= RESUME_EDIT_LIMITS.jobMinChars;
}

/** How much of the posting's vocabulary the resume uses. Null without a usable posting. */
export function evaluateJobKeywords(
  facts: EditFacts,
  jobDescription: string | null | undefined
): JobKeywordCheck | null {
  if (!isScorableJob(jobDescription)) return null;
  const match = matchKeywords(resumeText(facts), jobDescription ?? '');
  const total = match.presentOnResume.length + match.missingFromResume.length;
  return {
    coverage: match.jobCoverage,
    onResume: match.presentOnResume,
    missing: match.missingFromResume,
    summary:
      total === 0
        ? 'No distinct keywords in this posting.'
        : `${match.presentOnResume.length} of ${plural(total, 'job keyword')} are on your resume.`,
  };
}

/**
 * Every code-computed score. `requirements` is the posting read by the
 * requirements step; until it arrives, only the raw keyword match is known.
 * `storedSkills` is the saved model read of the resume's skills, if any.
 */
export function evaluateResume(
  facts: EditFacts,
  jobDescription: string | null = null,
  requirements: readonly JobRequirement[] | null = null,
  storedSkills: StoredSkillProfile | null = null
): ResumeEvaluation {
  const resumeSkills = readResumeSkills(facts, storedSkills);
  return {
    ...evaluateWriting(facts),
    job: evaluateJobKeywords(facts, jobDescription),
    skills:
      requirements && isScorableJob(jobDescription)
        ? matchRequirements(facts, resumeSkills, requirements)
        : null,
    resumeSkills,
  };
}
