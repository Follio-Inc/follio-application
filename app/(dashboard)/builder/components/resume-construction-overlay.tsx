'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { FileText, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  RESUME_CONSTRUCTION_REFRESH_HINT_MS,
  RESUME_CONSTRUCTION_REVEAL_MS,
  RESUME_CONSTRUCTION_SESSION_KEY,
  RESUME_CONSTRUCTION_SESSION_PLAYING,
  RESUME_CONSTRUCTION_STATUSES,
  RESUME_CONSTRUCTION_STATUS_TICK_MS,
  RESUME_CONSTRUCTION_HARD_DISMISS_MS,
} from '@/lib/onboarding/resume-construction';

/**
 * Plays once after onboarding upload: a brief status chip while the resume
 * preview is already fully visible. Must be Strict-Mode safe — clearing the
 * session flag before the animation finishes previously left the UI stuck.
 */
export function useResumeConstruction() {
  const [active, setActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusIndex, setStatusIndex] = useState(0);
  const [showRefreshHint, setShowRefreshHint] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const flag = sessionStorage.getItem(RESUME_CONSTRUCTION_SESSION_KEY);
    if (flag !== '1' && flag !== RESUME_CONSTRUCTION_SESSION_PLAYING) return;

    // Keep a "playing" marker so React Strict Mode remount restarts the RAF
    // instead of leaving active=true with a cancelled animation frame.
    sessionStorage.setItem(RESUME_CONSTRUCTION_SESSION_KEY, RESUME_CONSTRUCTION_SESSION_PLAYING);

    setActive(true);
    setProgress(0);
    setStatusIndex(0);
    setShowRefreshHint(false);

    const startedAt = performance.now();
    let frame = 0;

    const finish = () => {
      sessionStorage.removeItem(RESUME_CONSTRUCTION_SESSION_KEY);
      setProgress(1);
      setActive(false);
      setShowRefreshHint(false);
    };

    const tick = (now: number) => {
      const elapsed = now - startedAt;
      const next = Math.min(elapsed / RESUME_CONSTRUCTION_REVEAL_MS, 1);
      setProgress(next);
      setStatusIndex(
        Math.min(
          RESUME_CONSTRUCTION_STATUSES.length - 1,
          Math.floor(elapsed / RESUME_CONSTRUCTION_STATUS_TICK_MS)
        )
      );
      if (next < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        finish();
      }
    };
    frame = requestAnimationFrame(tick);

    const hintTimer = window.setTimeout(() => {
      setShowRefreshHint(true);
    }, RESUME_CONSTRUCTION_REFRESH_HINT_MS);

    const hardStop = window.setTimeout(finish, RESUME_CONSTRUCTION_HARD_DISMISS_MS);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(hintTimer);
      window.clearTimeout(hardStop);
      // Leave SESSION_PLAYING so a Strict Mode remount continues; finish() clears it.
    };
  }, []);

  return {
    active,
    progress,
    status: RESUME_CONSTRUCTION_STATUSES[statusIndex],
    showRefreshHint,
  };
}

interface ResumeConstructionOverlayProps {
  active: boolean;
  progress: number;
  status: string;
  showRefreshHint?: boolean;
}

export function ResumeConstructionOverlay({
  active,
  progress,
  status,
  showRefreshHint = false,
}: ResumeConstructionOverlayProps) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="pointer-events-none absolute inset-x-0 bottom-0 top-12 z-40 flex flex-col items-center justify-start px-6 pt-6"
          aria-live="polite"
          aria-busy="true"
        >
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative z-10 mt-4 flex max-w-sm flex-col items-center gap-2"
          >
            <div className="flex items-center gap-2.5 rounded-full border border-border/60 bg-background/90 px-3.5 py-2 shadow-sm backdrop-blur-md">
              <span className="relative flex h-7 w-7 items-center justify-center">
                <span className="absolute inset-0 rounded-full border border-border" />
                <motion.span
                  className="absolute inset-0 rounded-full border border-primary border-t-transparent"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
                />
                <FileText className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">{status}</p>
                <div className="mt-1 h-0.5 w-36 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(progress * 100, 8)}%` }}
                  />
                </div>
              </div>
            </div>

            {showRefreshHint && (
              <div className="pointer-events-auto rounded-lg border border-border/60 bg-background/95 px-3 py-2 text-center shadow-sm backdrop-blur-md">
                <p className="text-[11px] text-muted-foreground">
                  Taking longer than expected? Refresh to see your resume.
                </p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-foreground underline-offset-2 hover:underline"
                >
                  <RefreshCw className="h-3 w-3" aria-hidden />
                  Refresh page
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
