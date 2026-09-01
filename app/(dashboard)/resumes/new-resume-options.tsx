'use client';

import { ArrowLeft, ChevronDown, Clock, Copy, FileText, Loader2, Plus, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';

import { NewResumeTemplatePicker } from '@/components/resume/new-resume-template-picker';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { applyCreationResumeDesign } from '@/lib/resume/apply-creation-design';
import { RESUME_CONSTRUCTION_SESSION_KEY } from '@/lib/onboarding/resume-construction';
import { suggestCloneResumeTitle } from '@/lib/resume-title';
import { cn } from '@/lib/utils';
import type { PublicProfile, ResumeDesign } from '@/types';

import { ResumeThumbnail } from './resume-thumbnail';

// ─── Types ────────────────────────────────────────────────────────

export type NewResumeListItem = {
  id: string;
  resumeTitle: string;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  updatedAt: string;
};

type CloneDialogView = 'pick' | 'title';

export type UploadCreatedResume = {
  id: string;
  handle: string;
  resumeTitle: string;
};

type TemplatePickerMode = 'blank' | 'upload' | null;

const MAX_UPLOAD_FILE_SIZE_MB = 5;
const MAX_UPLOAD_FILE_SIZE_BYTES = MAX_UPLOAD_FILE_SIZE_MB * 1024 * 1024;
const UPLOAD_ACCEPTED_TYPE = 'application/pdf';

function validateUploadFile(file: File): string | null {
  if (file.type !== UPLOAD_ACCEPTED_TYPE) {
    return 'Only PDF files are supported. Please upload a .pdf resume.';
  }
  if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
    return `File is too large. Maximum size is ${MAX_UPLOAD_FILE_SIZE_MB} MB.`;
  }
  return null;
}

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

function getDisplayName(resume: NewResumeListItem): string | null {
  const parts = [resume.firstName, resume.middleName, resume.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : null;
}

export function sortByUpdatedAtDesc<T extends { updatedAt: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/** Attached (primary) resume always first / leftmost; remaining by most recently edited. */
export function sortResumesWithPortfolioFirst<T extends { id: string; updatedAt: string }>(
  items: T[],
  primaryProfileId: string | null
): T[] {
  if (!primaryProfileId || items.length <= 1) {
    return sortByUpdatedAtDesc(items);
  }

  const portfolio = items.find((item) => item.id === primaryProfileId);
  if (!portfolio) {
    return sortByUpdatedAtDesc(items);
  }

  const rest = items.filter((item) => item.id !== primaryProfileId);
  return [portfolio, ...sortByUpdatedAtDesc(rest)];
}

/**
 * Public resume first (at most one); remaining resumes by most recently edited.
 * This is the default list order while portfolio is suppressed.
 */
export function sortResumesWithPublicFirst<
  T extends { id: string; updatedAt: string; resumeVisibility: string },
>(items: T[]): T[] {
  if (items.length <= 1) return [...items];

  const publicResume = items.find((item) => item.resumeVisibility === 'PUBLIC');
  if (!publicResume) {
    return sortByUpdatedAtDesc(items);
  }

  const rest = items.filter((item) => item.id !== publicResume.id);
  return [publicResume, ...sortByUpdatedAtDesc(rest)];
}

/** Small vertical separator between portfolio and other resumes. */
export function ResumeListDivider({ className }: { className?: string }) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      className={cn('h-24 w-px shrink-0 self-center bg-border/70', className)}
    />
  );
}

// ─── Hook ─────────────────────────────────────────────────────────

export function useNewResumeActions({
  onRefresh,
  onError,
}: {
  onRefresh: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [isUploadParsing, setIsUploadParsing] = useState(false);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);

  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [cloneView, setCloneView] = useState<CloneDialogView>('pick');
  const [cloneSourceId, setCloneSourceId] = useState<string | null>(null);
  const [cloneTitle, setCloneTitle] = useState('');

  const [templatePickerMode, setTemplatePickerMode] = useState<TemplatePickerMode>(null);
  const [uploadPreviewProfile, setUploadPreviewProfile] = useState<PublicProfile | null>(null);

  const closeTemplatePicker = useCallback(() => {
    setTemplatePickerMode(null);
    setUploadPreviewProfile(null);
  }, []);

  /** Open creation gallery before creating a blank resume. */
  const createBlank = useCallback(() => {
    if (isMutating || isUploadParsing) return;
    onError(null);
    setUploadPreviewProfile(null);
    setTemplatePickerMode('blank');
  }, [isMutating, isUploadParsing, onError]);

  const confirmBlankWithDesign = useCallback(
    async (design: ResumeDesign) => {
      setTemplatePickerMode(null);
      setIsMutating(true);
      onError(null);

      try {
        const response = await fetch('/api/resumes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ strategy: 'BLANK', resumeDesign: design }),
        });

        if (!response.ok) throw new Error('Failed to create resume');

        router.push('/builder?new=1');
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Failed to create resume');
        setIsMutating(false);
      }
    },
    [onError, router]
  );

  /**
   * Same entry as onboarding “Upload Resume”: open the native file picker.
   * Selecting a PDF starts parse immediately (no Continue step).
   */
  const startUpload = useCallback(() => {
    if (isMutating || isUploadParsing) return;
    onError(null);
    uploadInputRef.current?.click();
  }, [isMutating, isUploadParsing, onError]);

  /**
   * Create a shell resume, parse the PDF, stage profile for template picker.
   * Uses the shared ResumeParsingOverlay while waiting — same as onboarding.
   */
  const handleUploadFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;

      const validationError = validateUploadFile(file);
      if (validationError) {
        onError(validationError);
        return;
      }

      setUploadFileName(file.name);
      setIsUploadParsing(true);
      setIsMutating(true);
      onError(null);

      let profileId: string | null = null;

      try {
        const response = await fetch('/api/resumes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ strategy: 'UPLOAD' }),
        });

        if (!response.ok) throw new Error('Failed to create resume');

        const data = (await response.json()) as {
          resume: UploadCreatedResume;
        };

        profileId = data.resume.id;

        const formData = new FormData();
        formData.append('file', file);

        const importResponse = await fetch(`/api/resumes/${profileId}/import-resume`, {
          method: 'POST',
          body: formData,
        });

        if (!importResponse.ok) {
          const errData = (await importResponse.json().catch(() => ({}))) as { error?: string };
          throw new Error(errData.error ?? 'Failed to import resume');
        }

        const profileResponse = await fetch('/api/profile', { cache: 'no-store' });
        if (!profileResponse.ok) {
          throw new Error('Failed to load imported resume for template preview');
        }
        const profileData = (await profileResponse.json()) as { profile: PublicProfile };

        setUploadPreviewProfile(profileData.profile);
        setIsUploadParsing(false);
        setUploadFileName(null);
        setTemplatePickerMode('upload');
        await onRefresh();
      } catch (err) {
        if (profileId) {
          await fetch(`/api/resumes/${profileId}`, { method: 'DELETE' }).catch(() => undefined);
        }
        onError(err instanceof Error ? err.message : 'Failed to import resume');
        setIsUploadParsing(false);
        setUploadFileName(null);
      } finally {
        setIsMutating(false);
      }
    },
    [onError, onRefresh]
  );

  const confirmUploadWithDesign = useCallback(
    async (design: ResumeDesign) => {
      setTemplatePickerMode(null);
      setIsMutating(true);
      onError(null);

      try {
        await applyCreationResumeDesign(design);
        setUploadPreviewProfile(null);
        // Same end state as blank/clone: open the new resume in the editor.
        // Do not use ?new=1 — that triggers the blank-resume import suggestion.
        sessionStorage.setItem(RESUME_CONSTRUCTION_SESSION_KEY, '1');
        router.push('/builder');
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Failed to save resume template');
        setIsMutating(false);
      }
    },
    [onError, router]
  );

  const handleTemplateSelect = useCallback(
    (design: ResumeDesign) => {
      if (templatePickerMode === 'blank') {
        void confirmBlankWithDesign(design);
        return;
      }
      if (templatePickerMode === 'upload') {
        void confirmUploadWithDesign(design);
      }
    },
    [confirmBlankWithDesign, confirmUploadWithDesign, templatePickerMode]
  );

  const openCloneDialog = useCallback(() => {
    onError(null);
    setCloneTitle('');
    setCloneSourceId(null);
    setCloneView('pick');
    setShowCloneDialog(true);
  }, [onError]);

  const closeCloneDialog = useCallback(() => {
    setShowCloneDialog(false);
    setCloneView('pick');
    setCloneSourceId(null);
    setCloneTitle('');
  }, []);

  const confirmClone = useCallback(async () => {
    if (!cloneSourceId) return;

    setShowCloneDialog(false);
    setIsMutating(true);
    onError(null);

    try {
      const response = await fetch('/api/resumes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy: 'CLONE',
          sourceProfileId: cloneSourceId,
          title: cloneTitle.trim() || undefined,
        }),
      });

      if (!response.ok) throw new Error('Failed to clone resume');

      // Active profile is set server-side; open it in the editor with content pane.
      router.push('/builder');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to clone resume');
      setIsMutating(false);
      setCloneSourceId(null);
      setCloneTitle('');
      setCloneView('pick');
    }
  }, [cloneSourceId, cloneTitle, onError, router]);

  const selectCloneSource = useCallback(
    (sourceId: string, sourceTitle: string, existingTitles: readonly string[]) => {
      setCloneSourceId(sourceId);
      setCloneTitle(suggestCloneResumeTitle(sourceTitle, new Date(), existingTitles));
      setCloneView('title');
    },
    []
  );

  const backToClonePick = useCallback(() => {
    setCloneSourceId(null);
    setCloneView('pick');
    setCloneTitle('');
  }, []);

  return {
    isMutating: isMutating || isUploadParsing,
    createBlank,
    startUpload,
    uploadInputRef,
    handleUploadFileChange,
    isUploadParsing,
    uploadFileName,
    openCloneDialog,
    showCloneDialog,
    setShowCloneDialog: (open: boolean) => {
      if (!open) closeCloneDialog();
      else setShowCloneDialog(true);
    },
    cloneView,
    cloneSourceId,
    cloneTitle,
    setCloneTitle,
    selectCloneSource,
    backToClonePick,
    confirmClone,
    closeCloneDialog,
    templatePickerOpen: templatePickerMode !== null,
    templatePickerProfile: uploadPreviewProfile ?? undefined,
    templatePickerApplyLabel: templatePickerMode === 'upload' ? 'Apply template' : 'Create resume',
    onTemplatePickerOpenChange: (open: boolean) => {
      if (!open) closeTemplatePicker();
    },
    handleTemplateSelect,
  };
}

/** Mount next to NewResumeMenuButton consumers so blank/upload share one gallery. */
export function NewResumeTemplatePickerHost({
  open,
  onOpenChange,
  onSelect,
  profile,
  applyLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (design: ResumeDesign) => void;
  profile?: PublicProfile;
  applyLabel?: string;
}) {
  return (
    <NewResumeTemplatePicker
      open={open}
      onOpenChange={onOpenChange}
      onSelect={onSelect}
      profile={profile}
      applyLabel={applyLabel}
    />
  );
}

/**
 * Same upload path as onboarding: hidden file input + shared ResumeParsingOverlay.
 * No intermediate dialog / Continue button — select a PDF and parsing starts.
 */
export function NewResumeUploadHost({
  inputRef,
  onFileChange,
  isParsing,
  fileName,
  disabled,
}: {
  inputRef: React.Ref<HTMLInputElement>;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isParsing: boolean;
  fileName: string | null;
  disabled?: boolean;
}) {
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="sr-only"
        onChange={onFileChange}
        disabled={disabled}
        aria-hidden
        tabIndex={-1}
      />
      <ResumeParsingOverlay active={isParsing} phase="parsing" fileName={fileName} />
    </>
  );
}

// ─── Header dropdown button ───────────────────────────────────────

export function NewResumeMenuButton({
  disabled,
  isMutating,
  onBlank,
  onUpload,
  onClone,
}: {
  disabled?: boolean;
  isMutating?: boolean;
  onBlank: () => void;
  onUpload: () => void;
  onClone: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="gap-1.5" disabled={disabled || isMutating}>
          <Plus className="h-4 w-4" />
          New resume
          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={onUpload} disabled={isMutating}>
          <Upload className="mr-2 h-4 w-4" />
          Upload resume
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onClone} disabled={isMutating}>
          <Copy className="mr-2 h-4 w-4" />
          Clone existing
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onBlank} disabled={isMutating}>
          <FileText className="mr-2 h-4 w-4" />
          Start blank
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Clone dialog ─────────────────────────────────────────────────

function CloneResumePickerCard({
  resume,
  onSelect,
}: {
  resume: NewResumeListItem;
  onSelect: (sourceId: string, sourceTitle: string) => void;
}) {
  const displayName = getDisplayName(resume);

  return (
    <button
      type="button"
      onClick={() => onSelect(resume.id, resume.resumeTitle)}
      className="group flex flex-col overflow-hidden rounded-lg border border-border/60 bg-card text-left transition-all duration-200 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="border-b border-border/60">
        <ResumeThumbnail profileId={resume.id} maxHeight={150} />
      </div>
      <div className="space-y-1 p-3">
        <p className="truncate text-sm font-semibold leading-tight text-foreground">
          {resume.resumeTitle}
        </p>
        {displayName && <p className="truncate text-xs text-muted-foreground">{displayName}</p>}
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3 shrink-0" />
          {formatRelativeDate(resume.updatedAt)}
        </p>
      </div>
    </button>
  );
}

export function NewResumeCloneDialog({
  open,
  onOpenChange,
  view,
  resumes,
  cloneSourceId,
  cloneTitle,
  onCloneTitleChange,
  onSelectSource,
  onBack,
  onConfirm,
  isMutating,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  view: CloneDialogView;
  resumes: NewResumeListItem[];
  cloneSourceId: string | null;
  cloneTitle: string;
  onCloneTitleChange: (value: string) => void;
  onSelectSource: (
    sourceId: string,
    sourceTitle: string,
    existingTitles: readonly string[]
  ) => void;
  onBack: () => void;
  onConfirm: () => void;
  isMutating?: boolean;
}) {
  const selectedResume = resumes.find((resume) => resume.id === cloneSourceId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(view === 'pick' ? 'sm:max-w-4xl' : 'sm:max-w-md')}>
        {view === 'pick' ? (
          <>
            <DialogHeader>
              <DialogTitle>Clone a resume</DialogTitle>
              <DialogDescription>
                Choose which resume to copy. All sections and data will be duplicated.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-2 max-h-[min(70vh,520px)] overflow-y-auto pr-1">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {resumes.map((resume) => (
                  <CloneResumePickerCard
                    key={resume.id}
                    resume={resume}
                    onSelect={(sourceId, sourceTitle) =>
                      onSelectSource(
                        sourceId,
                        sourceTitle,
                        resumes.map((item) => item.resumeTitle)
                      )
                    }
                  />
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={onBack}
                  disabled={isMutating}
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span className="sr-only">Back</span>
                </Button>
                <DialogTitle className="text-base">Name your clone</DialogTitle>
              </div>
              <DialogDescription>
                {selectedResume
                  ? `Creating a copy of "${selectedResume.resumeTitle}".`
                  : 'Create a copy of an existing resume with all its data.'}
              </DialogDescription>
            </DialogHeader>

            {selectedResume && (
              <div className="overflow-hidden rounded-lg border border-border/60">
                <ResumeThumbnail profileId={selectedResume.id} maxHeight={180} />
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                onConfirm();
              }}
            >
              <Input
                autoFocus
                value={cloneTitle}
                onChange={(e) => onCloneTitleChange(e.target.value)}
                placeholder="Resume name"
                maxLength={120}
              />

              <DialogFooter className="mt-4">
                <DialogClose asChild>
                  <Button type="button" variant="ghost">
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={isMutating || !cloneSourceId}>
                  {isMutating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Create
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
