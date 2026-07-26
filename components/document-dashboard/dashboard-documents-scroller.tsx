'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

interface DashboardDocumentsScrollerProps {
  children: ReactNode;
  /** Recompute arrow visibility when the item count changes. */
  itemCount: number;
}

/**
 * Horizontal card scroller with left/right arrows — shared by resume and cover letter dashboards.
 */
export function DashboardDocumentsScroller({
  children,
  itemCount,
}: DashboardDocumentsScrollerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollArrows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    updateScrollArrows();

    el.addEventListener('scroll', updateScrollArrows, { passive: true });
    const observer = new ResizeObserver(updateScrollArrows);
    observer.observe(el);

    return () => {
      el.removeEventListener('scroll', updateScrollArrows);
      observer.disconnect();
    };
  }, [updateScrollArrows, itemCount]);

  const scrollBy = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.75;
    el.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  return (
    <div className="group/scroll relative">
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollBy('left')}
          className="absolute -left-3 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border bg-background shadow-md transition-opacity hover:bg-muted"
          aria-label="Scroll left"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}

      {canScrollRight && (
        <button
          type="button"
          onClick={() => scrollBy('right')}
          className="absolute -right-3 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border bg-background shadow-md transition-opacity hover:bg-muted"
          aria-label="Scroll right"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      <div ref={scrollRef} className="scrollbar-none flex gap-5 overflow-x-auto pb-2">
        {children}
      </div>
    </div>
  );
}
