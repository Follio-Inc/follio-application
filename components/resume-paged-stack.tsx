'use client';

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from 'react';

import {
  getPagedContentOffset,
  getPagedPageCount,
  getResumePageSize,
  RESUME_PAGE_MARGIN_Y_PX,
} from '@/lib/resume/page-layout';
import { cn } from '@/lib/utils';
import type { ResumePageLayout } from '@/types';

/** Visual gap between stacked pages in paged preview mode. */
export const RESUME_PAGE_GAP_PX = 24;

interface ResumePagedStackProps {
  /** When false, children render as a single continuous sheet. */
  enabled: boolean;
  /** A4 or Letter — drives page frame height/width. Ignored when disabled. */
  pageLayout?: Extract<ResumePageLayout, 'a4' | 'letter'>;
  children: ReactNode;
  className?: string;
  /**
   * Attached to the full continuous source used for copy-text and height
   * measurement (not to the visible page slices).
   */
  contentRef?: Ref<HTMLDivElement | null>;
}

function assignRef<T>(ref: Ref<T> | undefined, value: T) {
  if (!ref) return;
  if (typeof ref === 'function') {
    ref(value);
    return;
  }
  (ref as React.MutableRefObject<T>).current = value;
}

/**
 * Renders resume paper as either one continuous sheet or a stack of
 * A4/Letter page windows with gaps — matching the paged PDF download look.
 *
 * Paper padding (including first-page top) is left unchanged. Page frames only
 * add a bottom inset on every page and a top inset on page 2+.
 */
export function ResumePagedStack({
  enabled,
  pageLayout = 'letter',
  children,
  className,
  contentRef,
}: ResumePagedStackProps) {
  const measureRef = useRef<HTMLDivElement | null>(null);
  const [pageCount, setPageCount] = useState(1);
  const pageSize = getResumePageSize(pageLayout);

  useLayoutEffect(() => {
    if (!enabled) {
      setPageCount(1);
      return;
    }

    const el = measureRef.current;
    if (!el) return;

    const update = () => {
      setPageCount(getPagedPageCount(el.scrollHeight, pageSize.heightPx));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, children, pageSize.heightPx]);

  if (!enabled) {
    return (
      <div
        ref={(node) => {
          measureRef.current = node;
          assignRef(contentRef, node);
        }}
        className={className}
      >
        {children}
      </div>
    );
  }

  const stackStyle = {
    '--resume-page-width': `${pageSize.widthPx}px`,
    '--resume-page-height': `${pageSize.heightPx}px`,
    '--resume-page-margin-y': `${RESUME_PAGE_MARGIN_Y_PX}px`,
    maxWidth: pageSize.widthPx,
  } as CSSProperties;

  return (
    <div className={cn('resume-paged-stack', className)} style={stackStyle}>
      {/* Full continuous source — measurement + copy-text only */}
      <div
        ref={(node) => {
          measureRef.current = node;
          assignRef(contentRef, node);
        }}
        className="resume-paged-measure"
        aria-hidden="true"
      >
        {children}
      </div>

      {Array.from({ length: pageCount }, (_, pageIndex) => {
        const isFirst = pageIndex === 0;
        return (
          <div
            key={pageIndex}
            className={cn('resume-paged-page', isFirst ? 'resume-paged-page--first' : null)}
            style={{
              marginBottom: pageIndex < pageCount - 1 ? RESUME_PAGE_GAP_PX : 0,
            }}
          >
            <div className="resume-paged-page-clip">
              <div
                className="resume-paged-page-inner"
                style={{
                  transform: `translateY(-${getPagedContentOffset(pageIndex, pageSize.heightPx)}px)`,
                }}
              >
                {children}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
