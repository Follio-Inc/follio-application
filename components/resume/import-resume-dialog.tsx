'use client';

import { Upload } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { ResumeParsingOverlay } from '@/components/resume/resume-parsing-overlay';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ONBOARDING_DROPZONE, ONBOARDING_DROPZONE_ACTIVE } from '@/lib/onboarding-ui';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────

export interface ImportSummary {
  experiences: number;
  educations: number;
  skills: number;
  projects: number;
  certifications: number;
  links: number;
}

export interface ImportResumeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Re-import into an existing profile (builder). Ignored when `onImportFile` is provided.
   */
  profileId?: string;
  /** When true, show the “replace existing data” warning. */
  hasExistingData?: boolean;
  /**
   * Custom import (e.g. create profile + parse). When provided, takes precedence over `profileId`.
   */
  onImportFile?: (file: File) => Promise<ImportSummary>;
  onImportComplete: () => void;
  /**
   * Skip the success summary and call `onImportComplete` after a successful import
   * (used when another overlay, e.g. template picker, should open next).
   */
  proceedOnSuccess?: boolean;
  title?: string;
  description?: string;
}

type ImportState = 'idle' | 'uploading' | 'success' | 'error';

// ─── Constants ────────────────────────────────────────────────────

const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ACCEPTED_TYPE = 'application/pdf';
const HANDOFF_DELAY_MS = 180;

// ─── Component ────────────────────────────────────────────────────

/**
 * Builder re-import dialog. File select/drop starts parsing immediately
 * (same as onboarding — no separate Continue step), using ResumeParsingOverlay.
 */
export function ImportResumeDialog({
  open,
  onOpenChange,
  profileId,
  hasExistingData = false,
  onImportFile,
  onImportComplete,
  proceedOnSuccess = false,
  title = 'Import resume',
  description = 'Upload a PDF and we’ll fill in experience, education, skills, and more.',
}: ImportResumeDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<ImportState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const allowCloseWhileUploadingRef = useRef(false);
  const parsingFileNameRef = useRef<string | null>(null);
  const importInFlightRef = useRef(false);

  const resetLocalState = useCallback(() => {
    setFile(null);
    setState('idle');
    setError(null);
    setSummary(null);
    setIsDragOver(false);
    allowCloseWhileUploadingRef.current = false;
    parsingFileNameRef.current = null;
    importInFlightRef.current = false;
  }, []);

  useEffect(() => {
    return () => {
      if (handoffTimerRef.current) clearTimeout(handoffTimerRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (open) {
      resetLocalState();
    }
  }, [open, resetLocalState]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      if (state === 'uploading' && !allowCloseWhileUploadingRef.current) {
        return;
      }
    }
    onOpenChange(next);
  };

  const validateFile = (f: File): string | null => {
    if (f.type !== ACCEPTED_TYPE) {
      return 'Only PDF files are supported. Please upload a .pdf resume.';
    }
    if (f.size > MAX_FILE_SIZE_BYTES) {
      return `File is too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.`;
    }
    return null;
  };

  const importViaProfileId = async (selected: File): Promise<ImportSummary> => {
    if (!profileId) {
      throw new Error('Missing profile for import');
    }

    const formData = new FormData();
    formData.append('file', selected);

    const response = await fetch(`/api/resumes/${profileId}/import-resume`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `Import failed (${response.status})`);
    }

    const data = (await response.json()) as {
      success: boolean;
      summary: ImportSummary;
    };

    return data.summary;
  };

  const startImport = async (selected: File) => {
    if (importInFlightRef.current) return;
    importInFlightRef.current = true;

    parsingFileNameRef.current = selected.name;
    setFile(selected);
    setState('uploading');
    setError(null);
    setSummary(null);

    try {
      const nextSummary = onImportFile
        ? await onImportFile(selected)
        : await importViaProfileId(selected);

      if (proceedOnSuccess) {
        allowCloseWhileUploadingRef.current = true;
        onOpenChange(false);
        if (handoffTimerRef.current) clearTimeout(handoffTimerRef.current);
        handoffTimerRef.current = setTimeout(() => {
          setState('idle');
          parsingFileNameRef.current = null;
          importInFlightRef.current = false;
          onImportComplete();
        }, HANDOFF_DELAY_MS);
        return;
      }

      setSummary(nextSummary);
      setState('success');
      importInFlightRef.current = false;

      setTimeout(() => {
        allowCloseWhileUploadingRef.current = true;
        handleOpenChange(false);
        onImportComplete();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import resume');
      setState('error');
      parsingFileNameRef.current = null;
      importInFlightRef.current = false;
    }
  };

  const handleFileSelect = (f: File) => {
    const validationError = validateFile(f);
    if (validationError) {
      setError(validationError);
      setFile(null);
      return;
    }
    void startImport(f);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const dropped = e.dataTransfer.files[0];
    if (dropped) {
      handleFileSelect(dropped);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      handleFileSelect(selected);
    }
    e.target.value = '';
  };

  const isUploading = state === 'uploading';

  return (
    <>
      <ResumeParsingOverlay
        active={isUploading}
        phase="parsing"
        fileName={parsingFileNameRef.current ?? file?.name}
      />

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {hasExistingData && state !== 'success' && (
              <p className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
                This replaces the current content of this resume with data from the uploaded file.
              </p>
            )}

            {state !== 'success' && (
              <div
                role="button"
                tabIndex={0}
                onClick={() => !isUploading && fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (!isUploading) fileInputRef.current?.click();
                  }
                }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  'relative cursor-pointer p-8 text-center',
                  ONBOARDING_DROPZONE,
                  isDragOver && ONBOARDING_DROPZONE_ACTIVE,
                  isUploading && 'pointer-events-none opacity-60'
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={handleInputChange}
                  disabled={isUploading}
                />

                <div className="flex flex-col items-center gap-3">
                  <Upload className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {isDragOver ? 'Drop your PDF here' : 'Drop a PDF here, or click to browse'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Up to {MAX_FILE_SIZE_MB} MB — parsing starts right away
                    </p>
                  </div>
                </div>
              </div>
            )}

            {state === 'success' && summary && (
              <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm">
                <p className="font-medium text-foreground">Resume imported</p>
                <ul className="mt-2 space-y-0.5 text-muted-foreground">
                  {summary.experiences > 0 && <li>{summary.experiences} work experience(s)</li>}
                  {summary.educations > 0 && <li>{summary.educations} education(s)</li>}
                  {summary.skills > 0 && <li>{summary.skills} skill(s)</li>}
                  {summary.projects > 0 && <li>{summary.projects} project(s)</li>}
                  {summary.certifications > 0 && <li>{summary.certifications} certification(s)</li>}
                  {summary.links > 0 && <li>{summary.links} link(s)</li>}
                </ul>
              </div>
            )}

            {error && (
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-destructive">{error}</p>
                <button
                  type="button"
                  className="shrink-0 text-xs text-muted-foreground underline hover:text-foreground"
                  onClick={() => {
                    setError(null);
                    setFile(null);
                    setState('idle');
                  }}
                >
                  Try again
                </button>
              </div>
            )}
          </div>

          {state !== 'success' && (
            <DialogFooter className="mt-2">
              <DialogClose asChild>
                <Button type="button" variant="ghost" disabled={isUploading}>
                  Cancel
                </Button>
              </DialogClose>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
