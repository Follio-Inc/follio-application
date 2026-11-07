'use client';

import {
  Check,
  CircleAlert,
  CircleCheck,
  CircleMinus,
  Lightbulb,
  Loader2,
  PenLine,
  RotateCcw,
  Trash2,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { Fragment, useId, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  changeTitle,
  fillBlanks,
  keepLabel,
  keptLabel,
  splitBlanks,
} from '@/lib/resume-edit/review';
import {
  changeOp,
  EDIT_PLACEHOLDER,
  explainProposal,
  hasPlaceholder,
  maxCharsFor,
  type ResumeEditChange,
} from '@/lib/resume-edit/types';
import { diffSide, diffWords, isRewrite } from '@/lib/resume-edit/word-diff';
import { cn } from '@/lib/utils';
import { changeEffects } from '@/services/ai/evaluate/change';
import type { JobKeyword } from '@/services/ai/evaluate/types';

import { useAiEditFocus } from './ai-edit-review';
import { EffectList } from './ai-edit-scores';
import { changeCardDomId } from './use-reveal-change';

interface AiEditChangeCardProps {
  change: ResumeEditChange;
  text: string;
  /** Hidden by the user for now; it can be restored. */
  skipped: boolean;
  /** Keywords of the request's job posting, to name the ones a suggestion brings in. */
  jobKeywords: readonly JobKeyword[];
  /** A request for this card is in flight. */
  pending: boolean;
  /** Another request is in flight, or keeping is blocked for the whole panel. */
  locked: boolean;
  onTextChange: (text: string) => void;
  onKeep: () => void;
  onSkip: () => void;
  onRestore: () => void;
  onUndo: () => void;
}

/** `fill` types numbers into the blanks in place; `edit` rewrites the whole line. */
type Mode = 'view' | 'fill' | 'edit';

function initialMode(change: ResumeEditChange, text: string): Mode {
  if (!hasPlaceholder(text)) return 'view';
  return text === change.after ? 'fill' : 'edit';
}

/** Hover and focus on a card mark the same suggestion in the resume, and the reverse. */
function useLinkedFocus(changeId: string) {
  const { focusedId, setFocusedId } = useAiEditFocus();
  const enter = () => setFocusedId(changeId);
  const leave = () => {
    if (focusedId === changeId) setFocusedId(null);
  };
  return {
    focused: focusedId === changeId,
    handlers: {
      onMouseEnter: enter,
      onMouseLeave: leave,
      onFocus: enter,
      onBlur: (event: React.FocusEvent) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) leave();
      },
    },
  };
}

function WithBlanks({ text }: { text: string }) {
  const pieces = splitBlanks(text);
  return (
    <>
      {pieces.map((piece, index) => (
        <Fragment key={index}>
          {piece}
          {index < pieces.length - 1 && (
            <mark className="rounded bg-amber-400/30 px-1 font-medium text-amber-900 dark:text-amber-100">
              {EDIT_PLACEHOLDER}
            </mark>
          )}
        </Fragment>
      ))}
    </>
  );
}

const LABEL_TONE = {
  current: 'border-border',
  suggested: 'border-primary/60',
  added: 'border-emerald-500/70',
  removed: 'border-rose-400/70',
} as const;

function Labeled({
  label,
  tone,
  children,
}: {
  label: string;
  tone: keyof typeof LABEL_TONE;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('border-l-2 pl-3', LABEL_TONE[tone])}>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
        {label}
      </p>
      {children}
    </div>
  );
}

/** The line as it reads today, with words the suggestion drops struck through. */
function CurrentText({ before, after }: { before: string; after: string }) {
  const parts = useMemo(() => {
    const all = diffWords(before, after);
    return isRewrite(all) ? null : diffSide(all, 'before');
  }, [before, after]);
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
      {parts
        ? parts.map((part, index) =>
            part.kind === 'removed' ? (
              <del
                key={index}
                className="rounded-sm bg-rose-500/10 text-rose-800/80 line-through decoration-rose-500/50 [box-decoration-break:clone] dark:text-rose-200/80"
              >
                {part.text}
              </del>
            ) : (
              <span key={index}>{part.text}</span>
            )
          )
        : before}
    </p>
  );
}

/** The suggested line, with new words highlighted unless the whole line was rewritten. */
function SuggestedText({ before, after }: { before: string; after: string }) {
  const parts = useMemo(() => {
    const all = diffWords(before, after);
    return isRewrite(all) ? null : diffSide(all, 'after');
  }, [before, after]);
  return (
    <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
      {parts ? (
        parts.map((part, index) =>
          part.kind === 'added' ? (
            <ins
              key={index}
              className="rounded-sm bg-emerald-500/15 text-emerald-950 no-underline [box-decoration-break:clone] dark:text-emerald-50"
            >
              <WithBlanks text={part.text} />
            </ins>
          ) : (
            <WithBlanks key={index} text={part.text} />
          )
        )
      ) : (
        <WithBlanks text={after} />
      )}
    </p>
  );
}

/** A whole new line: all of it is added. */
function AddedText({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
      <ins className="rounded-sm bg-emerald-500/15 text-emerald-950 no-underline [box-decoration-break:clone] dark:text-emerald-50">
        <WithBlanks text={text} />
      </ins>
    </p>
  );
}

/** A line that would go away. */
function RemovedText({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
      <del className="rounded-sm bg-rose-500/10 text-rose-900/80 line-through decoration-rose-500/60 [box-decoration-break:clone] dark:text-rose-100/80">
        {text}
      </del>
    </p>
  );
}

/** The suggested line with an input in place of each blank. */
function FillInText({
  template,
  answers,
  disabled,
  describedBy,
  onAnswer,
}: {
  template: string;
  answers: string[];
  disabled: boolean;
  describedBy?: string;
  onAnswer: (index: number, value: string) => void;
}) {
  const pieces = splitBlanks(template);
  const blanks = pieces.length - 1;
  return (
    <p className="whitespace-pre-wrap text-[15px] leading-loose text-foreground">
      {pieces.map((piece, index) => (
        <Fragment key={index}>
          {piece}
          {index < blanks && (
            <input
              type="text"
              value={answers[index] ?? ''}
              onChange={(event) => onAnswer(index, event.target.value)}
              disabled={disabled}
              aria-describedby={describedBy}
              placeholder="#"
              aria-label={
                blanks === 1 ? 'Your number' : `Your number, blank ${index + 1} of ${blanks}`
              }
              style={{ width: `${Math.max(3, (answers[index]?.length ?? 0) + 2)}ch` }}
              className={cn(
                'mx-0.5 inline-block h-7 rounded-md border px-1.5 text-center align-baseline text-sm font-medium transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-amber-500/40',
                answers[index]?.trim()
                  ? 'border-emerald-600/40 bg-emerald-500/10'
                  : 'border-amber-500/60 bg-amber-400/15 placeholder:text-amber-700/60'
              )}
            />
          )}
        </Fragment>
      ))}
    </p>
  );
}

type SettledState = { label: string; tone: string; icon: LucideIcon };

function settledState(change: ResumeEditChange, skipped: boolean): SettledState {
  if (skipped || change.status === 'rejected') {
    return { label: 'Skipped', tone: 'text-muted-foreground', icon: CircleMinus };
  }
  if (change.status === 'applied') {
    return {
      label: keptLabel(change),
      tone: 'text-emerald-700 dark:text-emerald-400',
      icon: CircleCheck,
    };
  }
  if (change.status === 'reverted') {
    return { label: 'Undone', tone: 'text-muted-foreground', icon: Undo2 };
  }
  return {
    label: 'Not kept: this line changed after the suggestion',
    tone: 'text-amber-700 dark:text-amber-400',
    icon: CircleAlert,
  };
}

/** One line for a suggestion that is no longer waiting on the user. */
function SettledRow({
  change,
  skipped,
  locked,
  pending,
  onRestore,
  onUndo,
}: Pick<
  AiEditChangeCardProps,
  'change' | 'skipped' | 'locked' | 'pending' | 'onRestore' | 'onUndo'
>) {
  const state = settledState(change, skipped);
  const Icon = state.icon;
  const removal = changeOp(change) === 'delete';
  const shown = removal ? change.before : (change.applied?.text ?? change.after);
  return (
    <li
      id={changeCardDomId(change.id)}
      tabIndex={-1}
      className={cn(
        'flex items-start gap-3 rounded-xl border px-3.5 py-2.5 transition-colors focus:outline-none',
        change.status === 'applied'
          ? 'border-emerald-600/20 bg-emerald-500/[0.04]'
          : 'border-dashed bg-transparent'
      )}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', state.tone)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs">
          <span className="font-medium text-foreground">{changeTitle(change)}</span>
          <span className="text-muted-foreground/60" aria-hidden>
            ·
          </span>
          <span className={cn('font-medium', state.tone)}>{state.label}</span>
        </p>
        <p
          className={cn(
            'mt-0.5 line-clamp-2 text-xs',
            change.status === 'applied' ? 'text-foreground/80' : 'text-muted-foreground',
            removal && change.status === 'applied' && 'line-through decoration-rose-500/50'
          )}
        >
          {shown}
        </p>
      </div>
      {skipped && (
        <Button type="button" size="sm" variant="ghost" onClick={onRestore} className="h-7 px-2">
          <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden />
          Restore
        </Button>
      )}
      {change.status === 'applied' && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onUndo}
          disabled={locked}
          className="h-7 px-2"
        >
          {pending ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Undo2 className="mr-1 h-3.5 w-3.5" aria-hidden />
          )}
          Undo
        </Button>
      )}
    </li>
  );
}

/** Where a new bullet goes, in words: after which line, or first. */
function Placement({ change }: { change: ResumeEditChange }) {
  return (
    <p className="truncate text-xs text-muted-foreground">
      {change.anchor ? (
        <>
          Goes after <span className="text-foreground/80">“{change.anchor}”</span>
        </>
      ) : (
        'Goes first in this role'
      )}
    </p>
  );
}

export function AiEditChangeCard(props: AiEditChangeCardProps) {
  const { change, skipped } = props;
  if (change.status !== 'proposed' || skipped) return <SettledRow {...props} />;
  return <OpenCard {...props} />;
}

function OpenCard({
  change,
  text,
  jobKeywords,
  pending,
  locked,
  onTextChange,
  onKeep,
  onSkip,
}: AiEditChangeCardProps) {
  const fieldId = useId();
  const [mode, setMode] = useState<Mode>(() => initialMode(change, text));
  const [answers, setAnswers] = useState<string[]>([]);
  const { focused, handlers } = useLinkedFocus(change.id);

  const op = changeOp(change);
  const removal = op === 'delete';
  const problem = explainProposal(change, text);
  const needsInput = !removal && hasPlaceholder(text);
  const edited = !removal && text !== change.after;
  const max = maxCharsFor(change.target);
  const effects = useMemo(
    () =>
      changeEffects({
        op,
        isBullet: change.target.kind === 'bullet',
        before: change.before,
        after: text,
        jobKeywords,
      }),
    [change.before, change.target.kind, jobKeywords, op, text]
  );

  const answer = (index: number, value: string) => {
    const next = [...answers];
    next[index] = value;
    setAnswers(next);
    onTextChange(fillBlanks(change.after, next));
  };

  const reset = () => {
    setAnswers([]);
    setMode(initialMode(change, change.after));
    onTextChange(change.after);
  };

  const help =
    mode === 'fill' && needsInput
      ? 'Type your real number in the highlighted blank, or edit the line to leave it out.'
      : problem;
  const describedBy = help ? `${fieldId}-help` : undefined;

  const suggestion =
    mode === 'edit' ? (
      <div className="space-y-1.5">
        <label htmlFor={fieldId} className="sr-only">
          Suggested text
        </label>
        <Textarea
          id={fieldId}
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          autoResize
          autoFocus
          disabled={pending}
          aria-invalid={Boolean(problem)}
          aria-describedby={describedBy}
          className="rounded-lg bg-background text-[15px] leading-relaxed"
        />
        {text.length > max * 0.8 && (
          <p className="text-right text-[11px] tabular-nums text-muted-foreground">
            {text.length}/{max}
          </p>
        )}
      </div>
    ) : mode === 'fill' ? (
      <FillInText
        template={change.after}
        answers={answers}
        disabled={pending}
        describedBy={describedBy}
        onAnswer={answer}
      />
    ) : op === 'insert' ? (
      <AddedText text={text} />
    ) : (
      <SuggestedText before={change.before} after={text} />
    );

  return (
    <li
      id={changeCardDomId(change.id)}
      tabIndex={-1}
      {...handlers}
      className={cn(
        'overflow-hidden rounded-xl border bg-background shadow-sm transition-[border-color,box-shadow] focus:outline-none',
        needsInput ? 'border-amber-500/40' : 'border-border/80',
        focused && 'border-primary/50 ring-2 ring-primary/15'
      )}
    >
      <div className="space-y-3 px-4 pb-3 pt-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{changeTitle(change)}</span>
          {needsInput && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">
              Needs your number
            </span>
          )}
          {edited && !needsInput && mode !== 'fill' && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              Edited by you
            </span>
          )}
        </div>

        {removal ? (
          <Labeled label="Remove" tone="removed">
            <RemovedText text={change.before} />
          </Labeled>
        ) : op === 'insert' ? (
          <>
            <Placement change={change} />
            <Labeled label="New" tone="added">
              {suggestion}
            </Labeled>
          </>
        ) : (
          <>
            {change.before && (
              <Labeled label="Current" tone="current">
                <CurrentText before={change.before} after={mode === 'fill' ? change.after : text} />
              </Labeled>
            )}
            <Labeled label={change.before ? 'Suggested' : 'New'} tone="suggested">
              {suggestion}
            </Labeled>
          </>
        )}

        <EffectList effects={effects} />

        {help && (
          <p
            id={`${fieldId}-help`}
            className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300"
          >
            <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            {help}
          </p>
        )}

        {change.reason && (
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
            <Lightbulb className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            {change.reason}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 bg-muted/30 px-3 py-2">
        <Button
          type="button"
          size="sm"
          variant={removal ? 'outline' : 'default'}
          onClick={onKeep}
          disabled={locked || problem !== null}
          title={problem ?? undefined}
          className={cn(
            removal &&
              'border-rose-500/40 text-rose-700 hover:bg-rose-500/10 hover:text-rose-800 dark:text-rose-300'
          )}
        >
          {pending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : removal ? (
            <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          ) : (
            <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          )}
          {keepLabel(change)}
        </Button>
        {!removal && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setMode(mode === 'edit' ? 'view' : 'edit')}
            disabled={pending}
          >
            <PenLine className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {mode === 'edit' ? 'Done editing' : mode === 'fill' ? 'Edit line' : 'Edit'}
          </Button>
        )}
        {edited && (
          <Button type="button" size="sm" variant="ghost" onClick={reset} disabled={pending}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Reset
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onSkip}
          disabled={pending}
          className="ml-auto text-muted-foreground"
        >
          Skip
        </Button>
      </div>
    </li>
  );
}
