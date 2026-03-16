'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Constants ────────────────────────────────────────────────────

/**
 * The "natural" viewport width of the portfolio page when rendered
 * at full desktop resolution. The iframe is rendered at this width
 * and then scaled down with CSS transform.
 */
const PORTFOLIO_CONTENT_WIDTH = 1280;

/**
 * The fixed aspect ratio for the thumbnail container.
 * 21:9 ultrawide gives a cinematic preview of just the hero section.
 */
const ASPECT_RATIO = 21 / 9;

/** Maximum visible height (px) for the thumbnail container. */
const MAX_HEIGHT = 320;

/**
 * PortfolioThumbnail
 *
 * Renders a miniature, non-interactive preview of the user's portfolio page
 * by embedding `/u/[handle]` inside a scaled-down iframe.
 *
 * - Wide aspect ratio (16:7) to show the hero/header area of the portfolio.
 * - The iframe is invisible until loaded, then fades in smoothly.
 * - `pointer-events: none` prevents accidental interaction.
 * - CSS `transform: scale()` keeps the preview crisp (all text is real DOM).
 * - Bottom gradient overlay is applied by the parent to fade out content.
 */
interface PortfolioThumbnailProps {
  /** User handle used to construct the preview URL. */
  handle: string;
  /** CSS class applied to the outer container. */
  className?: string;
}

export function PortfolioThumbnail({ handle, className }: PortfolioThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [scale, setScale] = useState<number | null>(null);

  // Compute scale factor based on container width vs natural content width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateScale = () => {
      const containerWidth = el.clientWidth;
      if (containerWidth > 0) {
        setScale(containerWidth / PORTFOLIO_CONTENT_WIDTH);
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
      className={`relative w-full overflow-hidden rounded-xl bg-muted/30 ${className ?? ''}`}
      style={{
        aspectRatio: `${ASPECT_RATIO}`,
        maxHeight: `${MAX_HEIGHT}px`,
      }}
    >
      {/* Shimmer placeholder while loading */}
      {!loaded && !errored && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-muted/40 via-muted/60 to-muted/40" />
      )}

      {/* Iframe — invisible until fully loaded, then fades in */}
      {!errored && resolvedScale > 0 && (
        <iframe
          src={`/u/${handle}?view=portfolio&preview=true`}
          title="Portfolio preview"
          loading="eager"
          tabIndex={-1}
          scrolling="no"
          onLoad={handleLoad}
          onError={handleError}
          className="pointer-events-none select-none border-0 transition-opacity duration-500"
          style={{
            width: `${PORTFOLIO_CONTENT_WIDTH}px`,
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

      {/* Error fallback */}
      {errored && (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Portfolio preview unavailable
        </div>
      )}
    </div>
  );
}
