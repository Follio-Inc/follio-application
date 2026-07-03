'use client';

import { FileText, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { PortfolioResumeBadge } from './portfolio-resume-badge';

// ─── Constants ────────────────────────────────────────────────────

/** The "natural" width of the resume content inside the iframe (in px). */
const RESUME_CONTENT_WIDTH = 816;

/** The assumed "natural" height of the first page (US Letter at 96 dpi). */
const RESUME_CONTENT_HEIGHT = 1056;

/** Fixed aspect ratio matching US Letter paper. */
const ASPECT_RATIO = RESUME_CONTENT_WIDTH / RESUME_CONTENT_HEIGHT;

/** Maximum visible height (px) for the thumbnail container. */
const MAX_HEIGHT = 260;

/** Time (ms) before the iframe is considered timed out. */
const LOAD_TIMEOUT_MS = 10_000;

/**
 * ResumeThumbnail
 *
 * Renders a miniature, non-interactive preview of a resume by embedding the
 * owner-only `/resume-preview/[id]` route inside a scaled-down iframe.
 *
 * - Uses a fixed aspect-ratio container so the card never changes size.
 * - Shows a shimmer skeleton while the iframe is loading.
 * - The iframe is invisible (`opacity: 0`) until loaded, then fades in.
 * - Falls back to an icon placeholder on error or timeout, with a retry button.
 * - `pointer-events: none` prevents accidental interaction.
 * - CSS `transform: scale()` keeps the preview crisp (all text is real DOM).
 */
interface ResumeThumbnailProps {
  /** Profile ID used to construct the preview URL. */
  profileId: string;
  /** When true, shows a parsing overlay instead of the iframe preview. */
  isImporting?: boolean;
  /** CSS class applied to the outer container. */
  className?: string;
  /** Override the maximum visible height (px). Defaults to 260. */
  maxHeight?: number;
  /** Show the portfolio badge overlay (primary resume only). */
  showPortfolioBadge?: boolean;
}

export function ResumeThumbnail({
  profileId,
  isImporting = false,
  className,
  maxHeight,
  showPortfolioBadge = false,
}: ResumeThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [scale, setScale] = useState<number | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // Compute scale on first layout + track resizes
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateScale = () => {
      const containerWidth = el.clientWidth;
      if (containerWidth > 0) {
        setScale(containerWidth / RESUME_CONTENT_WIDTH);
      }
    };

    updateScale();

    const observer = new ResizeObserver(updateScale);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Timeout: if the iframe hasn't loaded after LOAD_TIMEOUT_MS, show fallback
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
  const showSkeleton = !isImporting && !loaded && !errored;

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden bg-white shadow-[inset_0_0_0_1px_hsl(var(--border)/0.5)] ${className ?? ''}`}
      style={{
        aspectRatio: `${ASPECT_RATIO}`,
        maxHeight: `${maxHeight ?? MAX_HEIGHT}px`,
      }}
    >
      {showPortfolioBadge && <PortfolioResumeBadge />}

      {/* Import-in-progress overlay */}
      {isImporting && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2.5 bg-muted/30">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
          <p className="text-xs font-medium text-muted-foreground">Parsing resume…</p>
        </div>
      )}

      {/* Loading skeleton — visible until iframe loads or errors */}
      {showSkeleton && (
        <div className="absolute inset-0 animate-pulse bg-muted/40">
          {/* Faux document lines for a calmer, paper-like skeleton */}
          <div className="flex h-full flex-col gap-2.5 p-6">
            <div className="h-2.5 w-1/2 rounded-full bg-muted-foreground/15" />
            <div className="h-2 w-1/3 rounded-full bg-muted-foreground/10" />
            <div className="mt-3 h-2 w-full rounded-full bg-muted-foreground/10" />
            <div className="h-2 w-11/12 rounded-full bg-muted-foreground/10" />
            <div className="h-2 w-4/5 rounded-full bg-muted-foreground/10" />
          </div>
        </div>
      )}

      {/* Error fallback with retry */}
      {errored && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/20">
          <FileText className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
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

      {/* Iframe — invisible until fully loaded, then fades in */}
      {!errored && !isImporting && resolvedScale > 0 && (
        <iframe
          key={retryKey}
          src={`/resume-preview/${profileId}`}
          title="Resume preview"
          loading="eager"
          tabIndex={-1}
          scrolling="no"
          onLoad={handleLoad}
          onError={handleError}
          className="pointer-events-none select-none border-0 transition-opacity duration-300 [transform:translateZ(0)]"
          style={{
            width: `${RESUME_CONTENT_WIDTH}px`,
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
