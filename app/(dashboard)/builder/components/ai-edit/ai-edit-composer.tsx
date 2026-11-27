'use client';

import {
  Briefcase,
  Check,
  Hash,
  Scissors,
  Sparkles,
  Target,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { plural } from '@/lib/resume-edit/review';
import {
  EDIT_PRESETS,
  explainBrief,
  RESUME_EDIT_LIMITS,
  type EditPresetId,
  type EditScope,
  type ResumeEditBrief,
} from '@/lib/resume-edit/types';
import { cn } from '@/lib/utils';

import { JobMatch, ScorePill, WritingScoreHeading } from './ai-edit-scores';
import { useCurrentScores } from './use-edit-scores';
import { readyRequirements, useJobRequirements } from './use-job-requirements';

export interface ComposerExperience {
  id: string;
  label: string;
}

interface AiEditComposerProps {
  experiences: ComposerExperience[];
  /** Prefills the form, e.g. when the user goes back to change their last request. */
  initialBrief?: ResumeEditBrief | null;
  onSubmit: (brief: ResumeEditBrief) => void;
}

const EXPERIENCE_PREFIX = 'role:';
/** Waits for typing to pause, so a posting typed by hand is read once, not on every key. */
const REQUIREMENTS_DEBOUNCE_MS = 900;

const PRESET_ICONS: Record<EditPresetId, LucideIcon> = {
  quantify: Hash,
  concise: Scissors,
  verbs: Zap,
  outcomes: Target,
};

function scopeToValue(scope: EditScope | undefined, experiences: ComposerExperience[]): string {
  if (scope?.kind === 'summary') return 'summary';
  if (scope?.kind === 'experience' && experiences.some((item) => item.id === scope.experienceId)) {
    return `${EXPERIENCE_PREFIX}${scope.experienceId}`;
  }
  return 'all';
}

function valueToScope(value: string): EditScope {
  if (value === 'summary') return { kind: 'summary' };
  if (value.startsWith(EXPERIENCE_PREFIX)) {
    return { kind: 'experience', experienceId: value.slice(EXPERIENCE_PREFIX.length) };
  }
  return { kind: 'all' };
}

function scopeLabel(value: string, experiences: ComposerExperience[]): string {
  if (value === 'summary') return 'Headline and summary';
  if (value.startsWith(EXPERIENCE_PREFIX)) {
    const id = value.slice(EXPERIENCE_PREFIX.length);
    return experiences.find((item) => item.id === id)?.label ?? 'One role';
  }
  return 'Whole resume';
}

function StepLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-section-title block">
      {children}
    </label>
  );
}

function GoalCard({
  icon: Icon,
  label,
  hint,
  score = null,
  scoreSuffix,
  status,
  on,
  onToggle,
  className,
}: {
  icon: LucideIcon;
  label: string;
  hint: string;
  /** How the resume scores on this today, so the weakest areas stand out. */
  score?: number | null;
  scoreSuffix?: string;
  /** One line on where the resume stands, e.g. "6 of 14 bullets have a number." */
  status?: string;
  on: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={cn(
        'group relative flex items-start gap-3 rounded-xl border p-3 text-left transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        on
          ? 'border-primary/60 bg-primary/[0.06] shadow-sm'
          : 'border-border/80 bg-background hover:border-border hover:bg-muted/40',
        className
      )}
    >
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
          on ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
        )}
        aria-hidden
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 pr-5">
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          {label}
          <ScorePill score={score} suffix={scoreSuffix} label="Score now" />
        </span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
        {status && <span className="mt-1 block text-[11px] text-foreground/70">{status}</span>}
      </span>
      <span
        className={cn(
          'absolute right-3 top-3 flex h-4 w-4 items-center justify-center rounded-full border transition-colors',
          on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'
        )}
        aria-hidden
      >
        {on && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
    </button>
  );
}

export function AiEditComposer({ experiences, initialBrief, onSubmit }: AiEditComposerProps) {
  const ids = useId();
  const jobRef = useRef<HTMLTextAreaElement>(null);
  const [instructions, setInstructions] = useState(initialBrief?.instructions ?? '');
  const [presets, setPresets] = useState<EditPresetId[]>(initialBrief?.presets ?? []);
  const [scopeValue, setScopeValue] = useState(() =>
    scopeToValue(initialBrief?.scope, experiences)
  );
  const [jobDescription, setJobDescription] = useState(initialBrief?.jobDescription ?? '');
  const [jobOpen, setJobOpen] = useState(Boolean(initialBrief?.jobDescription));
  const [attempted, setAttempted] = useState(false);

  const brief: ResumeEditBrief = {
    jobDescription: jobOpen ? jobDescription.trim() || null : null,
    instructions: instructions.trim() || null,
    presets,
    scope: valueToScope(scopeValue),
  };
  const problem = explainBrief(brief);
  const requirements = useJobRequirements(brief.jobDescription, {
    debounceMs: REQUIREMENTS_DEBOUNCE_MS,
  });
  const { evaluation, skillRead } = useCurrentScores(
    brief.jobDescription,
    readyRequirements(requirements)
  );
  const jobStatus = evaluation.skills
    ? evaluation.skills.required.total > 0
      ? `Required skills: ${evaluation.skills.required.met} of ${evaluation.skills.required.total} on your resume.`
      : evaluation.skills.summary
    : evaluation.job?.summary;
  const checks = new Map(evaluation.checks.map((check) => [check.id, check]));
  const nearLimit = instructions.length > RESUME_EDIT_LIMITS.instructionsMaxChars * 0.8;
  const goalCount = presets.length + (brief.jobDescription ? 1 : 0);

  const togglePreset = (id: EditPresetId) =>
    setPresets((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );

  const toggleJob = () => {
    if (jobOpen) {
      setJobOpen(false);
      return;
    }
    setJobOpen(true);
    requestAnimationFrame(() => jobRef.current?.focus());
  };

  const submit = (event?: React.FormEvent) => {
    event?.preventDefault();
    setAttempted(true);
    if (!problem) onSubmit(brief);
  };

  const submitOnShortcut = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    }
  };

  const summary = [
    goalCount > 0 ? plural(goalCount, 'goal') : null,
    brief.instructions ? 'your notes' : null,
    scopeLabel(scopeValue, experiences),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <form onSubmit={submit} onKeyDown={submitOnShortcut} className="space-y-7">
      <section className="space-y-3" aria-labelledby={`${ids}-goals`}>
        <div className="flex items-end justify-between gap-3">
          <div className="space-y-0.5">
            <h3 id={`${ids}-goals`} className="text-section-title">
              What should we improve?
            </h3>
            <p className="text-xs text-muted-foreground">
              Pick one or more. Scores update as your resume changes.
            </p>
          </div>
          <WritingScoreHeading score={evaluation.writing} />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {EDIT_PRESETS.map((preset) => {
            const check = checks.get(preset.id);
            return (
              <GoalCard
                key={preset.id}
                icon={PRESET_ICONS[preset.id]}
                label={preset.label}
                hint={preset.hint}
                score={check?.score ?? null}
                status={check && check.total > 0 ? check.summary : undefined}
                on={presets.includes(preset.id)}
                onToggle={() => togglePreset(preset.id)}
              />
            );
          })}
          <GoalCard
            icon={Briefcase}
            label="Tailor to a job"
            hint="Paste a posting to emphasize what it asks for"
            score={evaluation.skills?.score ?? evaluation.job?.coverage ?? null}
            scoreSuffix="%"
            status={jobStatus}
            on={jobOpen}
            onToggle={toggleJob}
            className="sm:col-span-2"
          />
        </div>

        {jobOpen && (
          <div className="animate-fade-up space-y-1.5">
            <label htmlFor={`${ids}-job`} className="sr-only">
              Job posting
            </label>
            <Textarea
              ref={jobRef}
              id={`${ids}-job`}
              value={jobDescription}
              onChange={(event) => setJobDescription(event.target.value)}
              placeholder="Paste the job description here"
              maxLength={RESUME_EDIT_LIMITS.jobMaxChars}
              className="max-h-[280px] min-h-[132px] rounded-xl bg-background px-3.5 py-3"
              aria-describedby={`${ids}-job-help`}
            />
            <p id={`${ids}-job-help`} className="text-xs text-muted-foreground">
              Paste the whole page if that is easier: company, benefits, and legal text are left out
              of the skills match. It never adds skills your resume does not show.
            </p>
            <JobMatch evaluation={evaluation} requirements={requirements} skillRead={skillRead} />
          </div>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <StepLabel htmlFor={`${ids}-ask`}>
            Anything specific? <span className="font-normal text-muted-foreground">Optional</span>
          </StepLabel>
          {nearLimit && (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {instructions.length}/{RESUME_EDIT_LIMITS.instructionsMaxChars}
            </span>
          )}
        </div>
        <Textarea
          id={`${ids}-ask`}
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          placeholder="e.g. “Sound more senior” or “Mention I cut cloud costs by 30% at Acme”"
          maxLength={RESUME_EDIT_LIMITS.instructionsMaxChars}
          autoResize
          className="min-h-[76px] rounded-xl bg-background px-3.5 py-3"
        />
      </section>

      <section className="space-y-2">
        <StepLabel htmlFor={`${ids}-scope`}>Where</StepLabel>
        <Select value={scopeValue} onValueChange={setScopeValue}>
          <SelectTrigger id={`${ids}-scope`} className="h-10 w-full rounded-xl bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Whole resume</SelectItem>
            <SelectItem value="summary">Headline and summary</SelectItem>
            {experiences.map((item) => (
              <SelectItem key={item.id} value={`${EXPERIENCE_PREFIX}${item.id}`}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <div className="space-y-3 border-t border-border/60 pt-5">
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {goalCount > 0 || brief.instructions ? summary : 'Pick a goal or describe a change.'}
          </p>
          <Button type="submit" className="w-full sm:w-auto">
            <Sparkles className="mr-2 h-4 w-4" aria-hidden />
            Suggest edits
          </Button>
        </div>
        {attempted && problem ? (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Nothing changes until you apply a suggestion, and every change can be undone.{' '}
            <span className="hidden sm:inline">
              Press <kbd className="font-sans">⌘/Ctrl + Enter</kbd> to send.
            </span>
          </p>
        )}
      </div>
    </form>
  );
}
