'use client';

import { useLayoutEffect, useRef } from 'react';

import { applyResumeLensMarks, clearResumeLensMarks } from '@/lib/resume-lens';
import type { ResumeLensResult } from '@/lib/resume-lens';

/**
 * Paint lens marks onto the live resume after React commit.
 * Re-applies when the paged stack clones pages (ResizeObserver).
 */
export function useResumeLensHighlights(
  host: HTMLElement | null,
  lens: ResumeLensResult | null
): void {
  const applyingRef = useRef(false);

  useLayoutEffect(() => {
    if (!host) return;

    const apply = () => {
      if (applyingRef.current) return;
      applyingRef.current = true;
      try {
        if (!lens) {
          clearResumeLensMarks(host);
        } else {
          applyResumeLensMarks(host, lens.phrases);
        }
      } finally {
        queueMicrotask(() => {
          applyingRef.current = false;
        });
      }
    };

    apply();

    const observer = new MutationObserver(() => {
      if (applyingRef.current) return;
      apply();
    });
    observer.observe(host, { childList: true, subtree: true });

    const resize = new ResizeObserver(() => {
      if (applyingRef.current) return;
      apply();
    });
    resize.observe(host);

    const t1 = window.setTimeout(apply, 120);
    const t2 = window.setTimeout(apply, 400);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      observer.disconnect();
      resize.disconnect();
      applyingRef.current = true;
      clearResumeLensMarks(host);
      applyingRef.current = false;
    };
  }, [host, lens]);
}
