'use client';

import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { CleanResumeView } from '@/app/u/[handle]/views/clean-resume-view';
import { FollioPage } from '@/components/follio/follio-page';
import { ViewHighlightsButton } from '@/components/resume-presentation/view-highlights-button';
import { isPortfolioEnabled } from '@/lib/features';
import { buildFollioIdentity } from '@/lib/follio-identity';
import { getResumeSheetWidthPx, resolveResumePageLayout } from '@/lib/resume/page-layout';
import type { ResumePresentation } from '@/lib/resume/presentation';
import { cn } from '@/lib/utils';

import type { PublicProfile } from '@/types';

interface ResumeZoomModalProps {
  open: boolean;
  onClose: () => void;
  profile: PublicProfile;
  /** Close this preview and show highlights in the builder preview. */
  onViewHighlights: () => void;
  presentation?: ResumePresentation;
}

const FOLLIO_PREVIEW_WIDTH_PX = 672;

/** Horizontal inset reserved so the sheet doesn't hug the viewport edge. */
const HORIZONTAL_PADDING_PX = 64;

/**
 * Uniform fit-zoom for the full preview sheet.
 * Caps at 1× so the resume stays at native fidelity; never height-crunches.
 */
export function getResumeZoomFitScale(availableWidthPx: number, nativeWidthPx: number): number {
  if (availableWidthPx <= 0 || nativeWidthPx <= 0) return 1;
  return Math.min(availableWidthPx / nativeWidthPx, 1);
}

/**
 * ResumeZoomModal
 *
 * Full-screen, in-page zoomed preview of the resume. Renders via a portal to
 * `document.body` so it escapes any transformed ancestors (the builder layout
 * uses a sliding transform that would otherwise trap `position: fixed`).
 *
 * - Backdrop is blurred; clicking it (or Escape / close button) dismisses.
 * - Sheet keeps the selected page layout (Continuous / A4 / Letter) and the
 *   same aspect ratio as the builder preview: uniform CSS zoom to fit available
 *   width (capped at 1×), with vertical scrolling for the full document —
 *   never squeezed or height-crunched to the viewport.
 */
export function ResumeZoomModal({
  open,
  onClose,
  profile,
  onViewHighlights,
  presentation = 'resume',
}: ResumeZoomModalProps) {
  const [mounted, setMounted] = useState(false);
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const isFollio = presentation === 'follio';
  const pageLayout = resolveResumePageLayout(profile.resumeDesign);
  const nativeWidthPx = isFollio ? FOLLIO_PREVIEW_WIDTH_PX : getResumeSheetWidthPx(pageLayout);
  const follioIdentity = isFollio
    ? buildFollioIdentity(profile, {
        showResume: true,
        showWork: isPortfolioEnabled(),
      })
    : null;

  useEffect(() => {
    setMounted(true);
  }, []);

  // ── Lock body scroll & handle Escape ────────────────────────────────
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose]);

  // ── Fit-zoom to available width (same idea as ResumePreviewPanel) ───
  useEffect(() => {
    if (!open || !mounted) return;

    const updateScale = () => {
      if (!containerRef.current) return;
      const available = containerRef.current.clientWidth - HORIZONTAL_PADDING_PX;
      setScale(getResumeZoomFitScale(available, nativeWidthPx));
    };

    updateScale();

    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(updateScale);
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, mounted, nativeWidthPx]);

  if (!open || !mounted) return null;

  // Visible width of the uniformly scaled sheet (px)
  const sheetWidth = nativeWidthPx * scale;

  const overlay = (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={isFollio ? 'Follio view' : 'Resume preview'}
      data-page-layout={pageLayout}
      className={cn(
        'fixed inset-0 z-[100] overflow-auto',
        'bg-background/70 backdrop-blur-md',
        'duration-200 animate-in fade-in'
      )}
      onClick={onClose}
    >
      {/* ── Close button (fixed to viewport top-right) ───────────────── */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close preview"
        className={cn(
          'fixed right-5 top-5 z-40',
          'rounded-full border border-border/60 bg-background/95 p-2',
          'text-muted-foreground shadow-md backdrop-blur-sm',
          'transition-colors hover:bg-background hover:text-foreground'
        )}
      >
        <X className="h-5 w-5" />
      </button>

      {/* Stays on the sheet's top-right while the preview scrolls. */}
      {isFollio ? null : (
        <div
          className="pointer-events-none fixed top-16 z-30"
          style={{
            right: `calc(1rem + (100vw - 2rem - ${sheetWidth}px) / 2 + 1.5rem)`,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <ViewHighlightsButton onClick={onViewHighlights} />
        </div>
      )}

      {/* ── Centered sheet — scrolls vertically; aspect matches preview ─ */}
      <div className="flex min-h-full w-full justify-center px-4 py-10">
        <div
          className="relative h-fit shadow-2xl"
          style={{ width: sheetWidth }}
          onClick={(event) => event.stopPropagation()}
        >
          {/* Lock layout to native page width, then zoom uniformly so
              A4/Letter page frames keep their paper aspect ratio. */}
          <div
            className="overflow-hidden [&>.resume-actions]:hidden"
            style={{ width: nativeWidthPx, zoom: scale }}
          >
            {follioIdentity ? (
              <FollioPage identity={follioIdentity} interactive={false} />
            ) : (
              <CleanResumeView profile={profile} />
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
