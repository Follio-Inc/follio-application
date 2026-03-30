'use client';

import { FileText, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

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
  /** CSS class applied to the outer container. */
  className?: string;
}

export function ResumeThumbnail({ profileId, className }: ResumeThumbnailProps) {
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
  const showSkeleton = !loaded && !errored;

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden bg-white ${className ?? ''}`}
      style={{
        aspectRatio: `${ASPECT_RATIO}`,
        maxHeight: `${MAX_HEIGHT}px`,
      }}
    >
      {/* Loading skeleton — visible until iframe loads or errors */}
      {showSkeleton && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-gray-50 to-gray-100" />
          <div className="relative flex flex-col items-center gap-2">
            <FileText className="h-8 w-8 text-gray-300" />
            <div className="flex flex-col items-center gap-1.5">
              <div className="h-2 w-24 rounded-full bg-gray-200" />
              <div className="h-2 w-16 rounded-full bg-gray-200" />
            </div>
          </div>
        </div>
      )}

      {/* Error fallback with retry */}
      {errored && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gray-50/80">
          <FileText className="h-8 w-8 text-gray-300" />
          <p className="text-xs text-gray-400">Preview unavailable</p>
          <button
            type="button"
            onClick={handleRetry}
            className="pointer-events-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}

      {/* Iframe — invisible until fully loaded, then fades in */}
      {!errored && resolvedScale > 0 && (
        <iframe
          key={retryKey}
          src={`/resume-preview/${profileId}`}
          title="Resume preview"
          loading="eager"
          tabIndex={-1}
          scrolling="no"
          onLoad={handleLoad}
          onError={handleError}
          className="pointer-events-none select-none border-0 transition-opacity duration-300"
          style={{
            width: `${RESUME_CONTENT_WIDTH}px`,
            height: '5000px',
            transform: `scale(${resolvedScale})`,
            transformOrigin: 'top left',
            position: 'absolute',
            top: 0,
            left: 0,
            overflow: 'hidden',
            opacity: loaded ? 1 : 0,
          }}
        />
      )}
    </div>
  );
}
