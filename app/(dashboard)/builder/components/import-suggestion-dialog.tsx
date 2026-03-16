'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, CheckCircle2, Clock, Copy, FileText, Loader2, Upload } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { useBuilderStore } from './builder-store-provider';

// ─── Constants ────────────────────────────────────────────────────

/** URL search-param flag set by the resumes page to trigger this dialog. */
const NEW_RESUME_PARAM = 'new';

/** Delay (ms) before the dialog appears after builder mounts. */
const SHOW_DELAY_MS = 1200;

// ─── Types ────────────────────────────────────────────────────────

interface ResumeListItem {
  id: string;
  handle: string;
  resumeTitle: string;
  firstName: string | null;
  lastName: string | null;
  headline: string | null;
  updatedAt: string;
}

type DialogView = 'options' | 'pick-resume';

// ─── Helpers ──────────────────────────────────────────────────────

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 1) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function getDisplayName(resume: ResumeListItem): string | null {
  const parts = [resume.firstName, resume.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : null;
}

// ─── Component ────────────────────────────────────────────────────

/**
 * Shown in the builder after creating a new blank resume.
 * Offers the user a quick way to populate it from an existing
 * Follio resume or by uploading a file.
 */
export function ImportSuggestionDialog() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const profileId = useBuilderStore((s) => s.draftProfile.id);

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<DialogView>('options');

  // Resume list for "Import from Follio"
  const [resumes, setResumes] = useState<ResumeListItem[]>([]);
  const [loadingResumes, setLoadingResumes] = useState(false);

  // Clone operation state
  const [cloning, setCloning] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);

  // Guard so we only trigger once even if strict mode double-fires
  const consumedRef = useRef(false);

  // ─── Mount: check URL param and schedule popup ────────────────

  const isNewResume = searchParams.get(NEW_RESUME_PARAM) === '1';

  useEffect(() => {
    if (!isNewResume || consumedRef.current) return;
    consumedRef.current = true;

    // Clean the URL param without a full navigation
    const url = new URL(window.location.href);
    url.searchParams.delete(NEW_RESUME_PARAM);
    window.history.replaceState({}, '', url.pathname + url.search);

    const timer = setTimeout(() => {
      setOpen(true);
    }, SHOW_DELAY_MS);

    return () => clearTimeout(timer);
  }, [isNewResume]);

  // ─── Fetch other resumes when dialog opens ────────────────────

  const fetchResumes = useCallback(async (currentId: string) => {
    setLoadingResumes(true);
    try {
      const response = await fetch('/api/resumes', { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to load resumes');

      const data = (await response.json()) as {
        resumes: ResumeListItem[];
      };

      // Exclude the newly-created blank resume
      setResumes(data.resumes.filter((r) => r.id !== currentId));
    } catch {
      setResumes([]);
    } finally {
      setLoadingResumes(false);
    }
  }, []);

  useEffect(() => {
    if (open && profileId) {
      void fetchResumes(profileId);
    }
  }, [open, profileId, fetchResumes]);

  // ─── Handlers ─────────────────────────────────────────────────

  const handleDismiss = () => {
    setOpen(false);
    setView('options');
    setCloneError(null);
  };

  const handleUpload = () => {
    if (!profileId) return;

    sessionStorage.setItem('importTargetProfileId', profileId);
    setOpen(false);
    router.push('/onboarding/import?from=builder&resume=new');
  };

  const handlePickResume = () => {
    setView('pick-resume');
    setCloneError(null);
  };

  const handleCloneFrom = async (sourceId: string) => {
    if (!profileId) return;

    setCloning(true);
    setCloneError(null);

    try {
      // 1. Clone the source resume (creates a new profile, sets it as active)
      const cloneResponse = await fetch('/api/resumes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy: 'CLONE', sourceProfileId: sourceId }),
      });

      if (!cloneResponse.ok) throw new Error('Failed to import resume data');

      // 2. Delete the blank resume we no longer need
      await fetch(`/api/resumes/${profileId}`, { method: 'DELETE' });

      // 3. Hard reload so the builder picks up the newly-cloned profile
      setOpen(false);
      window.location.reload();
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : 'Failed to import resume');
      setCloning(false);
    }
  };

  const handleBack = () => {
    setView('options');
    setCloneError(null);
  };

  // ─── Render ───────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(value) => !value && handleDismiss()}>
      <DialogContent className="sm:max-w-md">
        <AnimatePresence mode="wait" initial={false}>
          {view === 'options' ? (
            <motion.div
              key="options"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.15 }}
            >
              <DialogHeader>
                <DialogTitle>Get a head start?</DialogTitle>
                <DialogDescription>
                  You can quickly populate this resume from an existing source.
                </DialogDescription>
              </DialogHeader>

              <div className="mt-4 space-y-3">
                {/* Import from Follio */}
                {resumes.length > 0 && (
                  <button
                    type="button"
                    onClick={handlePickResume}
                    className="flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted/60"
                  >
                    <Copy className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div>
                      <p className="text-sm font-medium">Import from a Follio resume</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Copy all data from one of your existing resumes.
                      </p>
                    </div>
                  </button>
                )}

                {/* Upload file */}
                <button
                  type="button"
                  onClick={handleUpload}
                  className="flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted/60"
                >
                  <Upload className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Upload a resume file</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Import from a PDF or text file to populate your resume.
                    </p>
                  </div>
                </button>
              </div>

              {/* Dismiss link */}
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                >
                  No thanks, start from scratch
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="pick-resume"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.15 }}
            >
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={handleBack}
                    disabled={cloning}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span className="sr-only">Back</span>
                  </Button>
                  <DialogTitle className="text-base">Choose a resume to import from</DialogTitle>
                </div>
                <DialogDescription>
                  All data from the selected resume will be copied into this one.
                </DialogDescription>
              </DialogHeader>

              {cloneError && (
                <div className="mt-3 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {cloneError}
                </div>
              )}

              <div className="mt-4 max-h-[300px] space-y-2 overflow-y-auto pr-1">
                {loadingResumes ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : resumes.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    <FileText className="mx-auto h-8 w-8 text-muted-foreground/40" />
                    <p className="mt-2">No other resumes found.</p>
                  </div>
                ) : (
                  resumes.map((resume) => {
                    const displayName = getDisplayName(resume);

                    return (
                      <button
                        key={resume.id}
                        type="button"
                        onClick={() => void handleCloneFrom(resume.id)}
                        disabled={cloning}
                        className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/60 disabled:opacity-50"
                      >
                        <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{resume.resumeTitle}</p>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                            {displayName && (
                              <>
                                <span className="truncate">{displayName}</span>
                                <span>&middot;</span>
                              </>
                            )}
                            <span className="flex shrink-0 items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatRelativeDate(resume.updatedAt)}
                            </span>
                          </div>
                        </div>
                        {cloning ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-transparent transition-colors group-hover:text-primary" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
