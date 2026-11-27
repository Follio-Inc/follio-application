'use client';

import { useLayoutEffect, useState, type RefObject } from 'react';

import { buildThreadPath } from './thread-path';

interface AlignThreadsProps {
  stageRef: RefObject<HTMLDivElement | null>;
  resumePaneRef: RefObject<HTMLDivElement | null>;
  jdPaneRef: RefObject<HTMLDivElement | null>;
  activeAspectId: string | null;
}

interface Thread {
  id: string;
  d: string;
  from: { x: number; y: number; clipped: boolean };
  to: { x: number; y: number; clipped: boolean };
}

interface Anchor {
  x: number;
  y: number;
  clipped: boolean;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function bestRect(element: Element, pane: DOMRect): DOMRect | null {
  const rects = [...element.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
  if (rects.length === 0) return null;

  let best = rects[0]!;
  let bestArea = -1;
  for (const rect of rects) {
    const height = Math.max(0, Math.min(rect.bottom, pane.bottom) - Math.max(rect.top, pane.top));
    const width = Math.max(0, Math.min(rect.right, pane.right) - Math.max(rect.left, pane.left));
    const area = height * width;
    if (area > bestArea) {
      best = rect;
      bestArea = area;
    }
  }
  return best;
}

function anchorOn(mark: DOMRect, pane: DOMRect, edge: 'left' | 'right' | 'top' | 'bottom'): Anchor {
  const visible =
    mark.bottom > pane.top + 4 &&
    mark.top < pane.bottom - 4 &&
    mark.right > pane.left + 4 &&
    mark.left < pane.right - 4;

  if (edge === 'left' || edge === 'right') {
    const y = visible
      ? (Math.max(mark.top, pane.top) + Math.min(mark.bottom, pane.bottom)) / 2
      : mark.bottom < pane.top
        ? pane.top + 12
        : pane.bottom - 12;
    const x = edge === 'right' ? Math.min(mark.right, pane.right) : Math.max(mark.left, pane.left);
    return {
      x,
      y: clamp(y, pane.top + 8, pane.bottom - 8),
      clipped: !visible,
    };
  }

  const x = clamp((mark.left + mark.right) / 2, pane.left + 12, pane.right - 12);
  const y =
    edge === 'bottom'
      ? visible
        ? Math.min(mark.bottom, pane.bottom)
        : pane.bottom
      : visible
        ? Math.max(mark.top, pane.top)
        : pane.top;
  return { x, y, clipped: !visible };
}

function measureThreads(
  stage: HTMLDivElement,
  resumePane: HTMLDivElement,
  jdPane: HTMLDivElement,
  aspectId: string
): Thread[] {
  const escaped = CSS.escape(aspectId);
  const jdMark = stage.querySelector(`[data-align-role="jd"][data-aspect-id="${escaped}"]`);
  const resumeMarks = [
    ...stage.querySelectorAll(`[data-align-role="resume"][data-aspect-id="${escaped}"]`),
  ];
  if (!jdMark || resumeMarks.length === 0) return [];

  const stageBox = stage.getBoundingClientRect();
  const resumeBox = resumePane.getBoundingClientRect();
  const jdBox = jdPane.getBoundingClientRect();
  const jdRect = bestRect(jdMark, jdBox);
  if (!jdRect) return [];

  const sideBySide = resumeBox.right <= jdBox.left + 8;
  const resumeAbove = resumeBox.bottom <= jdBox.top + 8;

  return resumeMarks.flatMap((mark, index) => {
    const resumeRect = bestRect(mark, resumeBox);
    if (!resumeRect) return [];

    const fromAbs = sideBySide
      ? anchorOn(resumeRect, resumeBox, 'right')
      : anchorOn(resumeRect, resumeBox, resumeAbove ? 'bottom' : 'top');
    const toAbs = sideBySide
      ? anchorOn(jdRect, jdBox, 'left')
      : anchorOn(jdRect, jdBox, resumeAbove ? 'top' : 'bottom');

    const from = {
      x: fromAbs.x - stageBox.left,
      y: fromAbs.y - stageBox.top,
      clipped: fromAbs.clipped,
    };
    const to = {
      x: toAbs.x - stageBox.left,
      y: toAbs.y - stageBox.top,
      clipped: toAbs.clipped,
    };

    return [
      {
        id: `${aspectId}-${index}`,
        d: buildThreadPath(from, to),
        from,
        to,
      },
    ];
  });
}

/**
 * Hover lines from the job requirement back to the resume phrases that support it.
 * The lines are redrawn as either sheet scrolls, so they stay attached to the words.
 */
export function AlignThreads({
  stageRef,
  resumePaneRef,
  jdPaneRef,
  activeAspectId,
}: AlignThreadsProps) {
  const [threads, setThreads] = useState<Thread[]>([]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const resumePane = resumePaneRef.current;
    const jdPane = jdPaneRef.current;
    if (!stage || !resumePane || !jdPane || !activeAspectId) {
      setThreads([]);
      return;
    }

    let frame = 0;
    const measure = () => {
      frame = 0;
      setThreads(measureThreads(stage, resumePane, jdPane, activeAspectId));
    };

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };

    measure();
    resumePane.addEventListener('scroll', schedule, { passive: true });
    jdPane.addEventListener('scroll', schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(stage);
    observer.observe(resumePane);
    observer.observe(jdPane);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      resumePane.removeEventListener('scroll', schedule);
      jdPane.removeEventListener('scroll', schedule);
      observer.disconnect();
    };
  }, [activeAspectId, jdPaneRef, resumePaneRef, stageRef]);

  if (threads.length === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible text-emerald-600 motion-safe:transition-opacity dark:text-emerald-400"
      aria-hidden
    >
      {threads.map((thread) => (
        <g key={thread.id}>
          <path
            d={thread.d}
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            opacity="0.14"
          />
          <path
            d={thread.d}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            opacity="0.9"
          />
          {thread.from.clipped ? null : (
            <circle cx={thread.from.x} cy={thread.from.y} r="2.4" fill="currentColor" />
          )}
          {thread.to.clipped ? null : (
            <circle cx={thread.to.x} cy={thread.to.y} r="2.4" fill="currentColor" />
          )}
        </g>
      ))}
    </svg>
  );
}
