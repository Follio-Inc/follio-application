'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { PORTFOLIO_THUMBNAIL_FOCUS_ATTR } from '@/lib/portfolio/templates/types';

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
 * Delay (ms) after iframe `load` event before measuring the focus element.
 * Gives fonts, images, and CSS a chance to settle so layout measurements
 * are accurate.
 */
const FOCUS_MEASURE_DELAY_MS = 200;

/**
 * PortfolioThumbnail
 *
 * Renders a miniature, non-interactive preview of the user's portfolio page
 * by embedding `/u/[handle]` inside a scaled-down iframe.
 *
 * - Wide aspect ratio (21:9) to show the most prominent section.
 * - Templates mark their focal element with `data-portfolio-thumbnail-focus`.
 *   After the iframe loads, the component measures that element and offsets
 *   the iframe so the focal content is vertically centred in the preview.
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
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [scale, setScale] = useState<number | null>(null);

  /**
   * Vertical offset (in iframe-coordinate pixels) to shift the content so
   * the focus element is centred in the thumbnail. Zero means "show from top".
   */
  const [focusOffset, setFocusOffset] = useState(0);

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

  /**
   * After the iframe loads, look for the `[data-portfolio-thumbnail-focus]`
   * marker inside the iframe document. If found, compute the vertical offset
   * needed to centre that element within the visible thumbnail area.
   */
  const handleLoad = useCallback(() => {
    setLoaded(true);

    // Allow a short delay for fonts/CSS to settle before measuring
    setTimeout(() => {
      try {
        const iframe = iframeRef.current;
        const container = containerRef.current;
        if (!iframe?.contentDocument || !container) return;

        const focusEl = iframe.contentDocument.querySelector(
          `[${PORTFOLIO_THUMBNAIL_FOCUS_ATTR}]`
        ) as HTMLElement | null;

        if (!focusEl) return;

        // Absolute top of the focus element within the iframe document
        const focusTop = getDocumentOffsetTop(focusEl);
        const focusHeight = focusEl.offsetHeight;
        const focusCenter = focusTop + focusHeight / 2;

        // Visible area of the iframe in its own coordinate system
        const currentScale = container.clientWidth / PORTFOLIO_CONTENT_WIDTH;
        const visibleIframeHeight = container.clientHeight / currentScale;

        // Centre the focus element; clamp so we never scroll above the top
        const offset = Math.max(0, focusCenter - visibleIframeHeight / 2);
        setFocusOffset(offset);
      } catch {
        // Cross-origin or DOM access error — keep default (top)
      }
    }, FOCUS_MEASURE_DELAY_MS);
  }, []);

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
          ref={iframeRef}
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
            top: -(focusOffset * resolvedScale),
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

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * Walk the `offsetParent` chain to compute the element's absolute
 * top position relative to the document root. This is more reliable
 * than `getBoundingClientRect()` for non-scrolling iframe documents.
 */
function getDocumentOffsetTop(el: HTMLElement): number {
  let top = 0;
  let current: HTMLElement | null = el;
  while (current) {
    top += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }
  return top;
}
