'use client';

import { AlertTriangle, FileUp, Loader2, Sparkles, Upload, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

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

// ─── Types ────────────────────────────────────────────────────────

interface ImportResumeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId: string;
  hasExistingData: boolean;
  onImportComplete: () => void;
}

type ImportState = 'idle' | 'uploading' | 'success' | 'error';

interface ImportSummary {
  experiences: number;
  educations: number;
  skills: number;
  projects: number;
  certifications: number;
  links: number;
}

// ─── Constants ────────────────────────────────────────────────────

const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ACCEPTED_TYPE = 'application/pdf';

// ─── Component ────────────────────────────────────────────────────

export function ImportResumeDialog({
  open,
  onOpenChange,
  profileId,
  hasExistingData,
  onImportComplete,
}: ImportResumeDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<ImportState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Reset on close ─────────────────────────────────────────

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      // Reset state when closing, unless we're mid-upload
      if (state !== 'uploading') {
        setFile(null);
        setState('idle');
        setError(null);
        setSummary(null);
      }
    }
    onOpenChange(next);
  };

  // ─── File validation ────────────────────────────────────────

  const validateFile = (f: File): string | null => {
    if (f.type !== ACCEPTED_TYPE) {
      return 'Only PDF files are supported. Please upload a .pdf resume.';
    }
    if (f.size > MAX_FILE_SIZE_BYTES) {
      return `File is too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.`;
    }
    return null;
  };

  const handleFileSelect = (f: File) => {
    const validationError = validateFile(f);
    if (validationError) {
      setError(validationError);
      setFile(null);
      return;
    }
    setError(null);
    setFile(f);
    setState('idle');
    setSummary(null);
  };

  // ─── Drag & Drop ───────────────────────────────────────────

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

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const dropped = e.dataTransfer.files[0];
      if (dropped) {
        handleFileSelect(dropped);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // ─── File input change ─────────────────────────────────────

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      handleFileSelect(selected);
    }
    // Reset input so the same file can be re-selected
    e.target.value = '';
  };

  // ─── Import handler ────────────────────────────────────────

  const handleImport = async () => {
    if (!file) return;

    setState('uploading');
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

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

      setSummary(data.summary);
      setState('success');

      // Auto-close and refresh after a brief moment
      setTimeout(() => {
        handleOpenChange(false);
        onImportComplete();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import resume');
      setState('error');
    }
  };

  // ─── Render ─────────────────────────────────────────────────

  const isUploading = state === 'uploading';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Import Resume
          </DialogTitle>
          <DialogDescription>
            Upload a PDF resume and our AI will extract your work experience, education, skills,
            projects, and more.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Warning banner — shown only when there is existing data */}
          {hasExistingData && state !== 'success' && (
            <div className="flex gap-3 rounded-lg border border-amber-300/50 bg-amber-50 p-3 text-sm dark:border-amber-600/30 dark:bg-amber-950/30">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-300">
                  This will replace all existing data
                </p>
                <p className="mt-0.5 text-amber-700/80 dark:text-amber-400/70">
                  All current work experience, education, skills, projects, certifications, and
                  contact info in this resume will be deleted and replaced with data from the
                  uploaded file.
                </p>
              </div>
            </div>
          )}

          {/* Upload area */}
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
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
                isDragOver
                  ? 'border-primary bg-primary/5'
                  : file
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-muted-foreground/25 hover:border-primary/40 hover:bg-muted/50'
              } ${isUploading ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handleInputChange}
                disabled={isUploading}
              />

              {file ? (
                <div className="flex items-center gap-3">
                  <FileUp className="h-8 w-8 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(0)} KB — click to change
                    </p>
                  </div>
                  {!isUploading && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                        setError(null);
                      }}
                      className="ml-2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-3 text-sm font-medium">
                    Drop your resume here or click to browse
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">PDF only, up to 5 MB</p>
                </>
              )}
            </div>
          )}

          {/* Success message */}
          {state === 'success' && summary && (
            <div className="rounded-lg border border-green-300/50 bg-green-50 p-4 text-sm dark:border-green-700/30 dark:bg-green-950/30">
              <p className="font-medium text-green-800 dark:text-green-300">
                Resume imported successfully!
              </p>
              <ul className="mt-2 space-y-0.5 text-green-700 dark:text-green-400/80">
                {summary.experiences > 0 && <li>{summary.experiences} work experience(s)</li>}
                {summary.educations > 0 && <li>{summary.educations} education(s)</li>}
                {summary.skills > 0 && <li>{summary.skills} skill(s)</li>}
                {summary.projects > 0 && <li>{summary.projects} project(s)</li>}
                {summary.certifications > 0 && <li>{summary.certifications} certification(s)</li>}
                {summary.links > 0 && <li>{summary.links} link(s)</li>}
              </ul>
            </div>
          )}

          {/* Error message */}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        {state !== 'success' && (
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={isUploading}>
                Cancel
              </Button>
            </DialogClose>
            <Button onClick={() => void handleImport()} disabled={!file || isUploading}>
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Parsing resume…
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Import
                </>
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
