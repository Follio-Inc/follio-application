'use client';

import {
  Check,
  ChevronDown,
  Link2,
  List,
  Loader2,
  RefreshCw,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useId, useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { plural } from '@/lib/resume-edit/review';
import { scoreDelta } from '@/lib/resume-edit/scores';
import { cn } from '@/lib/utils';
import type {
  ChangeEffect,
  JobKeywordCheck,
  LineIssue,
  RequirementMatch,
  ResumeEvaluation,
  ResumeSkill,
  SkillMatchCheck,
  SkillSource,
  WritingCheck,
} from '@/services/ai/evaluate/types';
import type { RequirementImportance } from '@/services/ai/job-requirements/types';
import { expertBand, type ExpertRead } from '@/services/ai/judge/types';
import { SKILL_SOURCE_LABELS } from '@/services/ai/skills/match';

import type { SessionScores } from './use-edit-scores';
import type { JobFit } from './use-job-fit';
import type { JobRequirementsRead } from './use-job-requirements';
import type { SkillReadStatus } from './use-skill-profile';

const MAX_GAPS_SHOWN = 8;
const SKILLS_CAPTION = 'Required skills count double';
const KEYWORDS_CAPTION = 'Every term in the pasted text';

/** Green when it is in good shape, amber when there is work left, red when it needs attention. */
function scoreTone(score: number | null): { text: string; bar: string } {
  if (score === null) return { text: 'text-muted-foreground', bar: 'bg-muted-foreground/30' };
  if (score >= 80) return { text: 'text-emerald-700 dark:text-emerald-400', bar: 'bg-emerald-500' };
  if (score >= 50) return { text: 'text-amber-700 dark:text-amber-400', bar: 'bg-amber-500' };
  return { text: 'text-rose-700 dark:text-rose-400', bar: 'bg-rose-500' };
}

function formatScore(score: number | null, suffix = ''): string {
  return score === null ? '—' : `${score}${suffix}`;
}

/** "+8" in green or "−3" in red. Nothing when the score did not move. */
function Delta({ value, suffix = '' }: { value: number | null; suffix?: string }) {
  if (value === null || value === 0) return null;
  const up = value > 0;
  return (
    <span
      className={cn(
        'rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums',
        up
          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          : 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
      )}
    >
      <span aria-hidden>
        {up ? '+' : '−'}
        {Math.abs(value)}
        {suffix}
      </span>
      <span className="sr-only">
        {up ? 'up' : 'down'} {Math.abs(value)}
        {suffix}
      </span>
    </span>
  );
}

/** A small score next to a quick fix, so the weakest areas stand out before choosing. */
export function ScorePill({
  score,
  suffix = '',
  label,
}: {
  score: number | null;
  suffix?: string;
  label: string;
}) {
  if (score === null) return null;
  const tone = scoreTone(score);
  return (
    <span
      className={cn(
        'rounded-full border border-border bg-background px-1.5 py-px text-[11px] font-semibold tabular-nums',
        tone.text
      )}
      title={`${label}: ${score}${suffix}`}
    >
      <span className="sr-only">{label}: </span>
      {score}
      {suffix}
    </span>
  );
}

/** Job keywords the resume does not show. Suggestions never add them; the user can, if true. */
export function JobGaps({ job }: { job: JobKeywordCheck }) {
  if (job.missing.length === 0) {
    return (
      <p className="text-xs text-emerald-700 dark:text-emerald-400">
        Every keyword in this posting is already on your resume.
      </p>
    );
  }
  const shown = job.missing.slice(0, MAX_GAPS_SHOWN);
  const more = job.missing.length - shown.length;
  return (
    <div className="space-y-1.5 rounded-lg border border-dashed border-border/80 px-3 py-2.5">
      <p className="text-xs font-medium text-foreground">
        Not on your resume <span className="font-normal text-muted-foreground">{job.summary}</span>
      </p>
      <ul className="flex flex-wrap gap-1.5" aria-label="Job keywords missing from your resume">
        {shown.map((term) => (
          <li
            key={term}
            className="rounded-full border border-rose-700/15 bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-900 dark:text-rose-100"
          >
            {term}
          </li>
        ))}
        {more > 0 && (
          <li className="px-1 py-0.5 text-[11px] text-muted-foreground">+{more} more</li>
        )}
      </ul>
      <p className="text-xs text-muted-foreground">
        Suggestions never add these. If you have this experience, say so under “Anything specific?”
        and it can be used.
      </p>
    </div>
  );
}

/** What one suggestion does to its line, as small labels. */
export function EffectList({ effects }: { effects: ChangeEffect[] }) {
  if (effects.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="What this suggestion changes">
      {effects.map((effect) => (
        <li
          key={effect.label}
          className={cn(
            'rounded-full px-2 py-0.5 text-[11px] font-medium',
            effect.tone === 'gain'
              ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-500/10 text-rose-800 dark:text-rose-300'
          )}
        >
          {effect.tone === 'loss' && <span className="sr-only">Watch out: </span>}
          {effect.label}
        </li>
      ))}
    </ul>
  );
}

function Tile({
  label,
  before,
  after,
  suffix = '',
  children,
}: {
  label: string;
  before: number | null;
  after: number | null;
  suffix?: string;
  children?: React.ReactNode;
}) {
  const delta = scoreDelta(before, after);
  return (
    <div className="min-w-0 rounded-lg border border-border/60 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 flex items-baseline gap-1.5">
        <span className={cn('text-2xl font-semibold tabular-nums', scoreTone(after).text)}>
          {formatScore(after, suffix)}
        </span>
        <Delta value={delta} suffix={suffix} />
      </p>
      {delta !== null && delta !== 0 ? (
        <p className="text-[11px] text-muted-foreground">was {formatScore(before, suffix)}</p>
      ) : (
        children
      )}
    </div>
  );
}

function IssueList({ issues }: { issues: LineIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {issues.map((issue) => (
        <li key={`${issue.ref}-${issue.issue}`} className="min-w-0">
          <p className="truncate text-foreground/80">“{issue.text}”</p>
          <p className="text-muted-foreground">
            <span className="font-medium text-amber-800 dark:text-amber-300">{issue.issue}</span>
            {issue.where ? ` · ${issue.where}` : null}
          </p>
        </li>
      ))}
    </ul>
  );
}

function CheckRow({ before, after }: { before: WritingCheck; after: WritingCheck }) {
  const tone = scoreTone(after.score);
  const delta = scoreDelta(before.score, after.score);
  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
          <span className="w-24 shrink-0 text-sm text-foreground">{after.label}</span>
          <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span
              className={cn(
                'absolute inset-y-0 left-0 rounded-full transition-[width] duration-500',
                tone.bar
              )}
              style={{ width: `${after.score ?? 0}%` }}
            />
            {delta !== null && delta !== 0 && (
              <span
                className="absolute inset-y-0 w-0.5 bg-foreground/40"
                style={{ left: `calc(${before.score ?? 0}% - 1px)` }}
              />
            )}
          </span>
          <span className="flex w-16 shrink-0 items-center justify-end gap-1">
            <span className={cn('text-sm font-semibold tabular-nums', tone.text)}>
              {formatScore(after.score)}
            </span>
            <Delta value={delta} />
          </span>
          <ChevronDown
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <div className="space-y-2 px-2 pb-2 pt-1 text-xs">
          <p className="text-foreground">{after.summary}</p>
          <p className="text-muted-foreground">{after.target}</p>
          <IssueList issues={after.issues} />
        </div>
      </details>
    </li>
  );
}

/** A score that is not ready: on its way, failed, or waiting to be asked for. */
function PendingTile({
  label,
  loading,
  message,
  action,
  onAction,
}: {
  label: string;
  /** Shown with a spinner. Null when not loading. */
  loading: string | null;
  message?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border/60 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {loading ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          {loading}
        </p>
      ) : (
        <>
          {message && <p className="mt-1 text-xs text-muted-foreground">{message}</p>}
          {action && onAction && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-1.5 h-7"
              onClick={onAction}
            >
              {action}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function RecruiterTile({ jobFit }: { jobFit: JobFit }) {
  const { state, previous, check } = jobFit;
  const label = 'Recruiter read';
  if (state.status === 'ready') {
    const before = previous?.score ?? null;
    return (
      <Tile label={label} before={before} after={state.read.score}>
        <p className="text-[11px] text-muted-foreground">{expertBand(state.read.score)}</p>
      </Tile>
    );
  }
  return (
    <PendingTile
      label={label}
      loading={state.status === 'loading' ? 'Reading as a recruiter…' : null}
      message={state.status === 'error' ? state.message : 'A recruiter’s 0–100 read of the fit.'}
      action={state.status === 'error' ? 'Try again' : 'Get the read'}
      onAction={check}
    />
  );
}

/** The skills match once the posting's requirements are read, or where that read stands. */
function SkillsTile({
  before,
  after,
  read,
}: {
  before: number | null;
  after: SkillMatchCheck | null;
  read: JobRequirementsRead | null;
}) {
  const label = 'Skills match';
  if (after) {
    return (
      <Tile label={label} before={before} after={after.score} suffix="%">
        <p className="text-[11px] text-muted-foreground">{SKILLS_CAPTION}</p>
      </Tile>
    );
  }
  if (!read || read.state.status === 'idle' || read.state.status === 'ready') return null;
  return read.state.status === 'loading' ? (
    <PendingTile label={label} loading="Reading the requirements…" />
  ) : (
    <PendingTile
      label={label}
      loading={null}
      message={read.state.message}
      action="Try again"
      onAction={read.retry}
    />
  );
}

type ChipState = 'shown' | 'listed' | 'related' | 'missing';

const CHIP_STATES: Record<
  ChipState,
  { icon: LucideIcon; chip: string; spoken: string; legend: string }
> = {
  shown: {
    icon: Check,
    chip: 'border-emerald-700/15 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100',
    spoken: 'shown on your resume',
    legend: 'Shown in your experience',
  },
  listed: {
    icon: List,
    chip: 'border-amber-700/15 bg-amber-500/10 text-amber-900 dark:text-amber-100',
    spoken: 'only in your skills list',
    legend: 'Only listed',
  },
  related: {
    icon: Link2,
    chip: 'border-sky-700/15 bg-sky-500/10 text-sky-900 dark:text-sky-100',
    spoken: 'a close match on your resume',
    legend: 'Close match',
  },
  missing: {
    icon: X,
    chip: 'border-rose-700/15 bg-rose-500/10 text-rose-900 dark:text-rose-100',
    spoken: 'not on your resume',
    legend: 'Not on your resume',
  },
};

function chipState(match: RequirementMatch): ChipState {
  if (match.match === 'missing') return 'missing';
  if (match.match === 'related') return 'related';
  return match.evidence === 'listed' ? 'listed' : 'shown';
}

const IMPORTANCE_GROUPS: Array<[RequirementImportance, string]> = [
  ['required', 'Required'],
  ['preferred', 'Nice to have'],
];

function whereLabel(where: SkillSource[]): string {
  return where.map((source) => SKILL_SOURCE_LABELS[source]).join(', ');
}

function chipTitle(match: RequirementMatch, state: ChipState): string {
  const where = match.where.length > 0 ? `In your ${whereLabel(match.where)}` : null;
  if (match.via && state === 'related') return `Close match: your ${match.via}`;
  if (match.via) return `Your ${match.via}${where ? `. ${where}` : ''}`;
  return where ?? CHIP_STATES[state].legend;
}

function RequirementChip({ match }: { match: RequirementMatch }) {
  const state = chipState(match);
  const style = CHIP_STATES[state];
  const Icon = style.icon;
  const showVia = match.via !== null && match.match !== 'exact';
  return (
    <li
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        style.chip
      )}
      title={chipTitle(match, state)}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {match.term}
      {showVia && <span className="font-normal opacity-75">{`via ${match.via}`}</span>}
      <span className="sr-only">{`, ${style.spoken}`}</span>
    </li>
  );
}

/** The posting's requirements, grouped by importance, each marked by how the resume backs it. */
export function RequirementList({ check }: { check: SkillMatchCheck }) {
  if (check.matches.length === 0) {
    return <p className="text-xs text-muted-foreground">{check.summary}</p>;
  }
  const states = new Set(check.matches.map(chipState));
  const hasMissing = states.has('missing') || states.has('related');
  return (
    <div className="space-y-2.5">
      <p className="text-xs text-foreground">{check.summary}</p>
      {IMPORTANCE_GROUPS.map(([importance, title]) => {
        const matches = check.matches.filter((match) => match.importance === importance);
        if (matches.length === 0) return null;
        return (
          <div key={importance} className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {title}
            </p>
            <ul className="flex flex-wrap gap-1.5" aria-label={`${title} skills`}>
              {matches.map((match) => (
                <RequirementChip key={match.term} match={match} />
              ))}
            </ul>
          </div>
        );
      })}
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground" aria-hidden>
        {(Object.keys(CHIP_STATES) as ChipState[])
          .filter((state) => states.has(state))
          .map((state) => {
            const Icon = CHIP_STATES[state].icon;
            return (
              <li key={state} className="inline-flex items-center gap-1">
                <Icon className="h-3 w-3" />
                {CHIP_STATES[state].legend}
              </li>
            );
          })}
      </ul>
      {hasMissing && (
        <p className="text-xs text-muted-foreground">
          Suggestions never add missing skills, and a close match is not the same skill. If you have
          one, say so under “Anything specific?” and it can be used.
        </p>
      )}
    </div>
  );
}

const SKILL_READ_COPY: Partial<Record<SkillReadStatus, string>> = {
  loading: 'Loading skills your work shows…',
  reading: 'Reading skills your work shows…',
};

function skillTitle(skill: ResumeSkill): string {
  const where = `your ${whereLabel(skill.where)}`;
  return skill.inferred ? `Shown by the work in ${where}, not named` : `In ${where}`;
}

/** The resume's own skill list, rebuilt on every edit. Skills the posting asks for stand out. */
export function ResumeSkillList({
  skills,
  check,
  skillRead = 'ready',
}: {
  skills: ResumeSkill[];
  check: SkillMatchCheck | null;
  skillRead?: SkillReadStatus;
}) {
  const wanted = useMemo(
    () =>
      new Set(
        (check?.matches ?? [])
          .filter((match) => match.match !== 'missing')
          .flatMap((match) => match.skills)
      ),
    [check]
  );
  if (skills.length === 0) return null;
  const hasInferred = skills.some((skill) => skill.inferred);
  const status = SKILL_READ_COPY[skillRead];
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
        Your resume’s skills
        <span className="font-normal text-muted-foreground">({skills.length})</span>
        <ChevronDown
          className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="space-y-1.5 pt-2">
        <p className="text-[11px] text-muted-foreground">
          Read from your resume and updated as you edit.
          {hasInferred ? ' Dashed ones are shown by your work without being named.' : ''}
          {check ? ' Highlighted ones are in this posting.' : ''}
        </p>
        {status && (
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground" role="status">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            {status}
          </p>
        )}
        <ul
          className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto"
          aria-label="Skills on your resume"
        >
          {skills.map((skill) => {
            const asked = wanted.has(skill.id);
            return (
              <li
                key={skill.id}
                title={skillTitle(skill)}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[11px]',
                  skill.inferred && 'border-dashed',
                  asked
                    ? 'border-primary/30 bg-primary/10 font-medium text-foreground'
                    : 'border-border bg-background text-muted-foreground'
                )}
              >
                {skill.label}
                {skill.inferred && <span className="sr-only">, shown by your work</span>}
                {asked && <span className="sr-only">, in this posting</span>}
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}

/**
 * Both job scores under the posting box: the skills match from the
 * posting's real requirements, and the raw match over everything pasted.
 */
export function JobMatch({
  evaluation,
  requirements,
  skillRead = 'ready',
}: {
  evaluation: ResumeEvaluation;
  requirements: JobRequirementsRead;
  skillRead?: SkillReadStatus;
}) {
  const { job, skills, resumeSkills } = evaluation;
  if (!job) return null;
  return (
    <div className="space-y-3 rounded-xl border border-border/80 p-3">
      <div className="grid grid-cols-2 gap-2">
        <SkillsTile before={null} after={skills} read={requirements} />
        <Tile label="Keyword match" before={null} after={job.coverage} suffix="%">
          <p className="text-[11px] text-muted-foreground">{KEYWORDS_CAPTION}</p>
        </Tile>
      </div>
      {skills ? (
        <RequirementList check={skills} />
      ) : (
        requirements.state.status === 'error' && <JobGaps job={job} />
      )}
      <ResumeSkillList skills={resumeSkills} check={skills} skillRead={skillRead} />
    </div>
  );
}

function RecruiterNotes({ read, jobFit }: { read: ExpertRead; jobFit: JobFit }) {
  return (
    <div className="space-y-2 rounded-lg bg-muted/40 px-3 py-2.5 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm leading-snug text-foreground">{read.summary}</p>
        {jobFit.stale && (
          <Button type="button" size="sm" variant="outline" className="h-7" onClick={jobFit.check}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Re-check
          </Button>
        )}
      </div>
      {jobFit.stale && (
        <p className="text-muted-foreground">
          Your resume changed since this read. Re-check to see how a recruiter sees it now.
        </p>
      )}
      {read.notes.length > 0 && (
        <ul className="space-y-1.5">
          {read.notes.map((note) => (
            <li key={note.label}>
              <span className="font-medium text-foreground">{note.label}. </span>
              <span className="text-muted-foreground">{note.note}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Scores for an open request: the resume before it, against the resume with
 * every ready suggestion kept. Writing and keyword scores are computed by
 * code on every change; the recruiter read is a model's judgment on request.
 */
export function SessionScoreBoard({
  scores,
  jobFit,
  requirements = null,
}: {
  scores: SessionScores;
  jobFit: JobFit | null;
  requirements?: JobRequirementsRead | null;
}) {
  const headingId = useId();
  const { before, after, readyCount } = scores;
  const job = after.evaluation.job;
  const skills = after.evaluation.skills;
  const caption =
    readyCount > 0
      ? `Before this request, and with ${plural(readyCount, 'ready suggestion')} kept`
      : 'Before this request, and now';
  const read = jobFit?.state.status === 'ready' ? jobFit.state.read : null;

  if (after.evaluation.bulletCount === 0 && !job && !jobFit) return null;

  return (
    <section
      aria-labelledby={headingId}
      className="space-y-3 rounded-xl border border-border/80 bg-background p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h3 id={headingId} className="text-section-title">
          Scores
        </h3>
        <p className="text-xs text-muted-foreground">{caption}</p>
      </div>

      <div className={cn('grid grid-cols-2 gap-2', !job && 'sm:grid-cols-3')}>
        <Tile label="Writing" before={before.evaluation.writing} after={after.evaluation.writing}>
          <p className="text-[11px] text-muted-foreground">Four checks below</p>
        </Tile>
        {job && (
          <SkillsTile
            before={before.evaluation.skills?.score ?? null}
            after={skills}
            read={requirements}
          />
        )}
        {job && (
          <Tile
            label="Keyword match"
            before={before.evaluation.job?.coverage ?? null}
            after={job.coverage}
            suffix="%"
          >
            <p className="text-[11px] text-muted-foreground">{KEYWORDS_CAPTION}</p>
          </Tile>
        )}
        {jobFit && <RecruiterTile jobFit={jobFit} />}
      </div>

      {after.evaluation.bulletCount > 0 && (
        <ul className="-mx-2 space-y-0.5" aria-label="Writing checks">
          {after.evaluation.checks.map((check, index) => {
            const was = before.evaluation.checks[index] ?? check;
            return <CheckRow key={check.id} before={was} after={check} />;
          })}
        </ul>
      )}

      {read && jobFit && <RecruiterNotes read={read} jobFit={jobFit} />}
      {skills ? <RequirementList check={skills} /> : job && <JobGaps job={job} />}
      {job && (
        <ResumeSkillList
          skills={after.evaluation.resumeSkills}
          check={skills}
          skillRead={scores.skillRead}
        />
      )}
    </section>
  );
}

export function WritingScoreHeading({ score }: { score: number | null }) {
  if (score === null) return null;
  return (
    <p className="flex items-baseline gap-1.5 text-xs text-muted-foreground">
      Writing score
      <span className={cn('text-base font-semibold tabular-nums', scoreTone(score).text)}>
        {score}
      </span>
    </p>
  );
}
