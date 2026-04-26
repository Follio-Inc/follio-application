'use client';

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { CleanResumeView } from '@/app/u/[handle]/views/clean-resume-view';
import { cn } from '@/lib/utils';

import type { PublicProfile } from '@/types';

interface ResumeZoomModalProps {
  open: boolean;
  onClose: () => void;
  profile: PublicProfile;
  allContentJustified: boolean;
  onJustifyAll: () => void;
}

/**
 * ResumeZoomModal
 *
 * Full-screen, in-page zoomed preview of the resume. Renders via a portal to
 * `document.body` so it escapes any transformed ancestors (the builder layout
 * uses a sliding transform that would otherwise trap `position: fixed`).
 *
 * - Backdrop is blurred; clicking it (or Escape / close button) dismisses.
 * - Resume renders at native (1×) size — viewport scrolls vertically and
 *   horizontally if the sheet exceeds the viewport. This is intentional so
 *   users see the resume at full fidelity rather than scaled-to-fit.
 */
export function ResumeZoomModal({
  open,
  onClose,
  profile,
  allContentJustified,
  onJustifyAll,
}: ResumeZoomModalProps) {
  const [mounted, setMounted] = useState(false);

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

  if (!open || !mounted) return null;

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Resume preview"
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
          'fixed right-5 top-5 z-10',
          'rounded-full border border-border/60 bg-background/95 p-2',
          'text-muted-foreground shadow-md backdrop-blur-sm',
          'transition-colors hover:bg-background hover:text-foreground'
        )}
      >
        <X className="h-5 w-5" />
      </button>

      {/* ── Centered sheet container ─────────────────────────────────── */}
      <div className="flex min-h-full w-full justify-center px-4 py-10">
        <div className="h-fit shadow-2xl" onClick={(event) => event.stopPropagation()}>
          <div className="[&>.resume-actions]:hidden">
            <CleanResumeView
              profile={profile}
              allContentJustified={allContentJustified}
              onJustifyAll={onJustifyAll}
            />
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
