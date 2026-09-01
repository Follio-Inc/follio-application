'use client';

import { useLayoutEffect, useState } from 'react';

/** How far the C sits in from the card edge, in the left gutter. */
const ELBOW_INSET_PX = 16;
const DOT_PX = 3.5;

type Rail = {
  y1: number;
  height: number;
};

/**
 * Thin digital C in the left gutter: from the Follio snap’s left midpoint
 * down to the attached resume’s left midpoint, with small blue dots at both ends.
 *
 * Lives in its own column so it cannot be clipped by an SVG viewport or
 * by overflow on the document cards.
 */
export function FollioAttachRail({
  from,
  to,
}: {
  from: HTMLElement | null;
  to: HTMLElement | null;
}) {
  const [column, setColumn] = useState<HTMLDivElement | null>(null);
  const [rail, setRail] = useState<Rail | null>(null);

  useLayoutEffect(() => {
    if (!column || !from || !to) {
      setRail(null);
      return undefined;
    }

    const update = () => {
      const origin = column.getBoundingClientRect();
      const snap = from.getBoundingClientRect();
      const resume = to.getBoundingClientRect();

      const y1 = snap.top - origin.top + snap.height / 2;
      const y2 = resume.top - origin.top + resume.height / 2;
      const height = y2 - y1;

      if (height < 16) {
        setRail(null);
        return;
      }

      setRail({ y1, height });
    };

    update();
    const retry = window.setTimeout(update, 400);
    const later = window.setTimeout(update, 1200);

    const observer = new ResizeObserver(update);
    observer.observe(column);
    observer.observe(from);
    observer.observe(to);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);

    return () => {
      window.clearTimeout(retry);
      window.clearTimeout(later);
      observer.disconnect();
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [column, from, to]);

  return (
    <div ref={setColumn} className="relative w-6 shrink-0 self-stretch" aria-hidden>
      {rail ? (
        <div
          className="pointer-events-none absolute"
          style={{
            top: rail.y1,
            height: rail.height,
            left: 4,
            width: ELBOW_INSET_PX,
          }}
        >
          <div
            className="h-full rounded-l-[8px] border-primary/25"
            style={{ borderStyle: 'solid', borderWidth: '0.5px 0 0.5px 0.5px' }}
          />
          <span
            className="absolute right-0 top-0 rounded-full bg-primary/50"
            style={{
              width: DOT_PX,
              height: DOT_PX,
              transform: 'translate(50%, -50%)',
            }}
          />
          <span
            className="absolute bottom-0 right-0 rounded-full bg-primary/50"
            style={{
              width: DOT_PX,
              height: DOT_PX,
              transform: 'translate(50%, 50%)',
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
