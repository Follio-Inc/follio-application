'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * TemplatePreviewFrame
 *
 * Renders a miniature, non-interactive preview of a portfolio template by
 * embedding the `/preview/[templateId]` route (sample data) inside a
 * scaled-down iframe. Used by the template gallery and onboarding picker so
 * users see the actual design before choosing.
 */

/** Natural desktop width the preview is rendered at, then scaled down. */
const CONTENT_WIDTH = 1280;

interface TemplatePreviewFrameProps {
  templateId: string;
  /** Aspect ratio of the visible window into the template (width / height). */
  aspectRatio?: number;
  className?: string;
}

export function TemplatePreviewFrame({
  templateId,
  aspectRatio = 16 / 10,
  className,
}: TemplatePreviewFrameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(w / CONTENT_WIDTH);
    };
    update();

    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleLoad = useCallback(() => setLoaded(true), []);
  const handleError = useCallback(() => setErrored(true), []);

  const resolvedScale = scale ?? 0;

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden bg-muted/30 ${className ?? ''}`}
      style={{ aspectRatio: `${aspectRatio}` }}
    >
      {!loaded && !errored && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-muted/40 via-muted/60 to-muted/40" />
      )}

      {!errored && resolvedScale > 0 && (
        <iframe
          src={`/preview/${templateId}?embed=1`}
          title={`${templateId} preview`}
          loading="lazy"
          tabIndex={-1}
          scrolling="no"
          aria-hidden="true"
          onLoad={handleLoad}
          onError={handleError}
          className="pointer-events-none select-none border-0 transition-opacity duration-500"
          style={{
            width: `${CONTENT_WIDTH}px`,
            height: `${CONTENT_WIDTH / aspectRatio}px`,
            transform: `scale(${resolvedScale})`,
            transformOrigin: 'top left',
            position: 'absolute',
            top: 0,
            left: 0,
            opacity: loaded ? 1 : 0,
          }}
        />
      )}

      {errored && (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          Preview unavailable
        </div>
      )}
    </div>
  );
}
