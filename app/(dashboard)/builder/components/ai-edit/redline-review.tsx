'use client';

import { Check, CircleAlert, CircleCheck, Loader2, PenLine, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type RefObject } from 'react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { REDLINE_ID_ATTR, type RedlineKind, type ResumeRedline } from '@/lib/resume-edit/redline';
import {
  changeTitle,
  isOpenChange,
  keepAllLabel,
  keepLabel,
  plural,
  textFor,
} from '@/lib/resume-edit/review';
import {
  changeOp,
  explainProposal,
  type EditOp,
  type ResumeEditChange,
} from '@/lib/resume-edit/types';
import { cn } from '@/lib/utils';

import { useAiEditFocus, useAiEditReview } from './ai-edit-review';
import { useRevealChange } from './use-reveal-change';

/** Room beside the resume for the per-suggestion controls. */
export const REDLINE_GUTTER_PX = 124;

const CONTROL_HEIGHT_PX = 28;
const CONTROL_GAP_PX = 4;
const ACTIVE_ATTR = 'data-redline-active';

const LEGEND: Array<{ kind: RedlineKind; label: string; swatch: string }> = [
  { kind: 'modified', label: 'Changed', swatch: 'bg-stone-400/50' },
  { kind: 'added', label: 'New', swatch: 'bg-emerald-400/60' },
  { kind: 'removed', label: 'Removed', swatch: 'bg-rose-400/40' },
];

/** Counts, legend, and Keep all, above the resume while suggestions are shown in it. */
export function RedlineReviewBar() {
  const { review, redline, locked, unsaved, pending, error, notice, keep } = useAiEditReview();
  if (!review || !redline) return null;

  const ready = review.readyIds.length;
  const panelOnly = redline.unplaced.length;
  const message = error ?? notice;

  return (
    <div className="builder-panel shrink-0 space-y-2 border-b border-border/30 px-6 py-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-sm font-medium">
          {plural(review.open, 'suggestion')} to review
          {review.needsInput > 0 && (
            <span className="font-normal text-muted-foreground">
              {' '}
              · {review.needsInput} need{review.needsInput === 1 ? 's' : ''} a number
            </span>
          )}
        </p>
        <ul className="flex items-center gap-3 text-xs text-muted-foreground" aria-label="Legend">
          {LEGEND.map((item) => (
            <li key={item.kind} className="flex items-center gap-1.5">
              <span className={cn('h-2.5 w-4 rounded-sm', item.swatch)} aria-hidden />
              {item.label}
            </li>
          ))}
        </ul>
        {ready > 0 && (
          <Button
            type="button"
            size="sm"
            onClick={() => keep(review.readyIds)}
            disabled={locked}
            title={unsaved ? 'Save your editor edits first' : undefined}
            className="ml-auto h-8"
          >
            {pending?.kind === 'keep' && pending.id === null ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <CircleCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            )}
            {keepAllLabel(review)}
          </Button>
        )}
      </div>
      {(message || unsaved || panelOnly > 0) && (
        <p
          role={error ? 'alert' : 'status'}
          className={cn(
            'flex items-start gap-1.5 text-xs',
            error ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          {message ??
            (unsaved
              ? 'Save your editor edits to keep suggestions.'
              : `${plural(panelOnly, 'suggestion')} could not be shown here because ${panelOnly === 1 ? 'its line has' : 'their lines have'} changed. Review ${panelOnly === 1 ? 'it' : 'them'} in the panel.`)}
        </p>
      )}
    </div>
  );
}

type Placed = { id: string; top: number };

/**
 * The resume is scaled with CSS zoom. Chromium before standardized zoom
 * reports boxes inside it in unzoomed pixels; newer engines report what is
 * on screen. The paper fills `root`, so comparing widths tells which applies.
 */
function zoomCorrection(root: HTMLElement, rootWidth: number): number {
  const paperWidth = root.querySelector('.resume-paper-wrapper')?.getBoundingClientRect().width;
  return paperWidth ? rootWidth / paperWidth : 1;
}

/**
 * Where each suggestion's mark shows in the preview, top to bottom. The paged
 * layout renders the resume more than once (a hidden copy to measure, and a
 * clipped copy per page), so only the first visible piece of a mark counts.
 */
function measureMarks(root: HTMLElement): Placed[] {
  const origin = root.getBoundingClientRect();
  const scale = zoomCorrection(root, origin.width);
  const seen = new Set<string>();
  const placed: Placed[] = [];
  root.querySelectorAll<HTMLElement>(`[${REDLINE_ID_ATTR}]`).forEach((element) => {
    const id = element.getAttribute(REDLINE_ID_ATTR);
    if (!id || seen.has(id) || element.closest('.resume-paged-measure')) return;
    const rect = element.getBoundingClientRect();
    let top = rect.top;
    let bottom = rect.bottom;
    const clip = element.closest('.resume-paged-page-clip')?.getBoundingClientRect();
    if (clip) {
      top = Math.max(top, clip.top);
      bottom = Math.min(bottom, clip.bottom);
    }
    const height = (bottom - top) * scale;
    if (height < 2) return;
    seen.add(id);
    const firstLine = Math.min(height, CONTROL_HEIGHT_PX);
    placed.push({ id, top: top * scale - origin.top + (firstLine - CONTROL_HEIGHT_PX) / 2 });
  });
  placed.sort((a, b) => a.top - b.top);
  let floor = -Infinity;
  return placed.map((item) => {
    const top = Math.max(item.top, floor);
    floor = top + CONTROL_HEIGHT_PX + CONTROL_GAP_PX;
    return { id: item.id, top };
  });
}

function markElements(root: HTMLElement, id: string): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(`[${REDLINE_ID_ATTR}]`)].filter(
    (element) => element.getAttribute(REDLINE_ID_ATTR) === id
  );
}

interface RedlineControlsProps {
  /** Positioned box around the scaled resume; controls sit just right of it. */
  rootRef: RefObject<HTMLElement | null>;
  /**
   * The redline the resume under `rootRef` was rendered from. It can lag the
   * review state (it is deferred), and controls must match the marks on screen.
   */
  redline: ResumeRedline;
}

/**
 * Keep and Skip beside each marked line. Hovering a mark or its controls
 * lights up both, and the card in the panel; clicking a mark opens its card.
 */
export function RedlineControls({ rootRef, redline }: RedlineControlsProps) {
  const { session, texts, skipped, pending, locked, keep, setSkip } = useAiEditReview();
  const { focusedId, setFocusedId } = useAiEditFocus();
  const reveal = useRevealChange();
  const [placed, setPlaced] = useState<Placed[]>([]);

  const remeasure = useCallback(() => {
    const root = rootRef.current;
    setPlaced(root ? measureMarks(root) : []);
  }, [rootRef]);

  useLayoutEffect(() => {
    remeasure();
  }, [redline, remeasure]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(remeasure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(root);
    root.querySelectorAll('.resume-paper-wrapper').forEach((element) => observer.observe(element));
    void document.fonts?.ready.then(schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [redline, remeasure, rootRef]);

  // Marks are re-rendered as the resume changes, so the highlight is reapplied.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll(`[${ACTIVE_ATTR}]`).forEach((element) => {
      element.removeAttribute(ACTIVE_ATTR);
    });
    if (focusedId) {
      markElements(root, focusedId).forEach((element) => element.setAttribute(ACTIVE_ATTR, ''));
    }
  }, [focusedId, placed, rootRef]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const idAt = (target: EventTarget | null) =>
      target instanceof Element
        ? (target.closest(`[${REDLINE_ID_ATTR}]`)?.getAttribute(REDLINE_ID_ATTR) ?? null)
        : null;
    const onOver = (event: MouseEvent) => {
      const id = idAt(event.target);
      if (id) setFocusedId(id);
    };
    const onOut = (event: MouseEvent) => {
      const id = idAt(event.target);
      if (id && id !== idAt(event.relatedTarget)) setFocusedId(null);
    };
    const onClick = (event: MouseEvent) => {
      const id = idAt(event.target);
      if (id) reveal(id);
    };
    root.addEventListener('mouseover', onOver);
    root.addEventListener('mouseout', onOut);
    root.addEventListener('click', onClick);
    return () => {
      root.removeEventListener('mouseover', onOver);
      root.removeEventListener('mouseout', onOut);
      root.removeEventListener('click', onClick);
    };
  }, [reveal, rootRef, setFocusedId]);

  const openById = useMemo(() => {
    const shown = new Set(redline.placed);
    return new Map(
      (session?.changes ?? [])
        .filter((change) => shown.has(change.id) && isOpenChange(change, skipped))
        .map((change) => [change.id, change])
    );
  }, [redline, session, skipped]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="pointer-events-none absolute inset-y-0 left-full ml-2">
        {placed.map(({ id, top }) => {
          const change = openById.get(id);
          if (!change) return null;
          return (
            <MarkControls
              key={id}
              change={change}
              top={top}
              focused={focusedId === id}
              pending={pending?.id === id}
              locked={locked}
              ready={explainProposal(change, textFor(change, texts)) === null}
              onKeep={() => keep([id])}
              onSkip={() => setSkip(id, true)}
              onReveal={() => reveal(id)}
              onFocusChange={(on) => setFocusedId(on ? id : null)}
            />
          );
        })}
      </div>
    </TooltipProvider>
  );
}

const KIND_ACCENT: Record<EditOp, string> = {
  rewrite: 'border-l-stone-400',
  insert: 'border-l-emerald-500',
  delete: 'border-l-rose-400',
};

function MarkControls({
  change,
  top,
  focused,
  pending,
  locked,
  ready,
  onKeep,
  onSkip,
  onReveal,
  onFocusChange,
}: {
  change: ResumeEditChange;
  top: number;
  focused: boolean;
  pending: boolean;
  locked: boolean;
  /** Can be kept as it stands; otherwise it needs a number in the panel first. */
  ready: boolean;
  onKeep: () => void;
  onSkip: () => void;
  onReveal: () => void;
  onFocusChange: (focused: boolean) => void;
}) {
  const removal = changeOp(change) === 'delete';
  const title = changeTitle(change);
  return (
    <div
      role="group"
      aria-label={`${title}: ${change.label}`}
      style={{ top }}
      onMouseEnter={() => onFocusChange(true)}
      onMouseLeave={() => onFocusChange(false)}
      onFocus={() => onFocusChange(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onFocusChange(false);
      }}
      className={cn(
        'pointer-events-auto absolute left-0 flex h-7 items-center gap-0.5 whitespace-nowrap rounded-lg border border-l-[3px] bg-background/95 px-px shadow-sm backdrop-blur transition-[top,box-shadow] duration-200',
        KIND_ACCENT[changeOp(change)],
        focused && 'shadow-md ring-2 ring-primary/25'
      )}
    >
      {ready ? (
        <button
          type="button"
          onClick={onKeep}
          disabled={locked}
          className={cn(
            'flex h-6 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50',
            removal
              ? 'text-rose-700 hover:bg-rose-500/10 dark:text-rose-300'
              : 'text-primary hover:bg-primary/10'
          )}
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : removal ? (
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Check className="h-3.5 w-3.5" aria-hidden />
          )}
          {keepLabel(change)}
        </button>
      ) : (
        <button
          type="button"
          onClick={onReveal}
          className="flex h-6 items-center gap-1 rounded-md px-2 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:text-amber-300"
        >
          <PenLine className="h-3.5 w-3.5" aria-hidden />
          Fill in
        </button>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onSkip}
            disabled={pending}
            aria-label={`Skip ${title.toLowerCase()}`}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          Skip
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
