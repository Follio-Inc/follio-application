'use client';

import { FileText, Loader2, RefreshCw, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { LETTER_PAGE_HEIGHT_PX, LETTER_PAGE_WIDTH_PX } from '@/lib/document-design';
import { cn } from '@/lib/utils';

/** Maximum visible height (px) for the thumbnail container. */
const DEFAULT_MAX_HEIGHT = 260;

/** Time (ms) before the iframe is considered timed out. */
const LOAD_TIMEOUT_MS = 10_000;

export interface DocumentThumbnailProps {
  /** Owner-only preview route rendered inside the iframe. */
  previewSrc: string;
  /** Accessible iframe title. */
  title: string;
  /** Natural content width inside the iframe (px). Defaults to US Letter. */
  contentWidth?: number;
  /** Natural first-page height inside the iframe (px). Defaults to US Letter. */
  contentHeight?: number;
  /** Override the maximum visible height (px). */
  maxHeight?: number;
  className?: string;
  /** When true, shows a parsing overlay instead of the iframe preview. */
  isLoadingOverlay?: boolean;
  loadingLabel?: string;
  /** Optional badge overlay (Public / Portfolio / Unlisted). */
  badge?: ReactNode;
  /** Icon used in the error fallback. */
  fallbackIcon?: LucideIcon;
}

/**
 * Shared paper-document thumbnail — scaled iframe of an owner-only preview route.
 *
 * Resume and cover letter cards compose this; document-specific badges and
 * preview URLs stay in thin wrappers so layout/loading behavior stays DRY.
 */
export function DocumentThumbnail({
  previewSrc,
  title,
  contentWidth = LETTER_PAGE_WIDTH_PX,
  contentHeight = LETTER_PAGE_HEIGHT_PX,
  maxHeight,
  className,
  isLoadingOverlay = false,
  loadingLabel = 'Loading…',
  badge,
  fallbackIcon: FallbackIcon = FileText,
}: DocumentThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [scale, setScale] = useState<number | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const aspectRatio = contentWidth / contentHeight;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateScale = () => {
      const containerWidth = el.clientWidth;
      if (containerWidth > 0) {
        setScale(containerWidth / contentWidth);
      }
    };

    updateScale();

    const observer = new ResizeObserver(updateScale);
    observer.observe(el);
    return () => observer.disconnect();
  }, [contentWidth]);

  useEffect(() => {
    if (loaded || errored) return;

    const timer = setTimeout(() => {
      setErrored(true);
    }, LOAD_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [loaded, errored, retryKey]);

  const handleLoad = useCallback(() => setLoaded(true), []);
  const handleError = useCallback(() => setErrored(true), []);

  const handleRetry = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setLoaded(false);
    setErrored(false);
    setRetryKey((k) => k + 1);
  }, []);

  const resolvedScale = scale ?? 0;
  const showSkeleton = !isLoadingOverlay && !loaded && !errored;

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full overflow-hidden bg-white shadow-[inset_0_0_0_1px_hsl(var(--border)/0.5)]',
        className
      )}
      style={{
        aspectRatio: `${aspectRatio}`,
        maxHeight: `${maxHeight ?? DEFAULT_MAX_HEIGHT}px`,
      }}
    >
      {badge}

      {isLoadingOverlay && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2.5 bg-muted/30">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
          <p className="text-xs font-medium text-muted-foreground">{loadingLabel}</p>
        </div>
      )}

      {showSkeleton && (
        <div className="absolute inset-0 animate-pulse bg-muted/40">
          <div className="flex h-full flex-col gap-2.5 p-6">
            <div className="h-2.5 w-1/2 rounded-full bg-muted-foreground/15" />
            <div className="h-2 w-1/3 rounded-full bg-muted-foreground/10" />
            <div className="mt-3 h-2 w-full rounded-full bg-muted-foreground/10" />
            <div className="h-2 w-11/12 rounded-full bg-muted-foreground/10" />
            <div className="h-2 w-4/5 rounded-full bg-muted-foreground/10" />
          </div>
        </div>
      )}

      {errored && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/20">
          <FallbackIcon className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-xs text-muted-foreground">Preview unavailable</p>
          <button
            type="button"
            onClick={handleRetry}
            className="pointer-events-auto flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}

      {!errored && !isLoadingOverlay && resolvedScale > 0 && (
        <iframe
          key={retryKey}
          src={previewSrc}
          title={title}
          loading="eager"
          tabIndex={-1}
          scrolling="no"
          onLoad={handleLoad}
          onError={handleError}
          className="pointer-events-none select-none border-0 transition-opacity duration-300 [transform:translateZ(0)]"
          style={{
            width: `${contentWidth}px`,
            height: '5000px',
            transform: `scale(${resolvedScale}) translateZ(0)`,
            transformOrigin: 'top left',
            position: 'absolute',
            top: 0,
            left: 0,
            overflow: 'hidden',
            opacity: loaded ? 1 : 0,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
          }}
        />
      )}
    </div>
  );
}
