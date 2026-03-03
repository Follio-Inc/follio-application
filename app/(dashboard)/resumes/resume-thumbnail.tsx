'use client';

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

/**
 * ResumeThumbnail
 *
 * Renders a miniature, non-interactive preview of a resume by embedding the
 * owner-only `/resume-preview/[id]` route inside a scaled-down iframe.
 *
 * - Uses a fixed aspect-ratio container so the card never changes size.
 * - The iframe is invisible (`opacity: 0`) until loaded, then fades in.
 * - No loading skeleton or icons — just a clean white card that reveals content.
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

  const handleLoad = useCallback(() => setLoaded(true), []);
  const handleError = useCallback(() => setErrored(true), []);

  const resolvedScale = scale ?? 0;

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden bg-white ${className ?? ''}`}
      style={{
        aspectRatio: `${ASPECT_RATIO}`,
        maxHeight: `${MAX_HEIGHT}px`,
      }}
    >
      {/* Iframe — invisible until fully loaded, then fades in */}
      {!errored && resolvedScale > 0 && (
        <iframe
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
