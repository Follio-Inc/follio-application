'use client';

import { ArrowLeft, ChevronDown, Clock, Copy, FileText, Loader2, Plus, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

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
import { cn } from '@/lib/utils';

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

// ─── Hook ─────────────────────────────────────────────────────────

export function useNewResumeActions({
  onRefresh,
  onError,
}: {
  onRefresh: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const [isMutating, setIsMutating] = useState(false);

  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [cloneView, setCloneView] = useState<CloneDialogView>('pick');
  const [cloneSourceId, setCloneSourceId] = useState<string | null>(null);
  const [cloneTitle, setCloneTitle] = useState('');

  const createBlank = useCallback(async () => {
    setIsMutating(true);
    onError(null);

    try {
      const response = await fetch('/api/resumes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy: 'BLANK' }),
      });

      if (!response.ok) throw new Error('Failed to create resume');

      router.push('/builder?new=1');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to create resume');
      setIsMutating(false);
    }
  }, [onError, router]);

  const startUpload = useCallback(async () => {
    setIsMutating(true);
    onError(null);

    try {
      const response = await fetch('/api/resumes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy: 'UPLOAD' }),
      });

      if (!response.ok) throw new Error('Failed to create resume');

      const data = (await response.json()) as {
        resume: { id: string };
        nextAction: 'UPLOAD_RESUME' | 'OPEN_BUILDER';
      };

      if (data.nextAction === 'UPLOAD_RESUME') {
        sessionStorage.setItem('importTargetProfileId', data.resume.id);
        router.push('/onboarding/import?from=builder&resume=new');
        return;
      }

      await onRefresh();
      router.refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to create resume');
    } finally {
      setIsMutating(false);
    }
  }, [onError, onRefresh, router]);

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

      await onRefresh();
      router.refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to clone resume');
    } finally {
      setIsMutating(false);
      setCloneSourceId(null);
      setCloneTitle('');
      setCloneView('pick');
    }
  }, [cloneSourceId, cloneTitle, onError, onRefresh, router]);

  const selectCloneSource = useCallback((sourceId: string) => {
    setCloneSourceId(sourceId);
    setCloneView('title');
  }, []);

  const backToClonePick = useCallback(() => {
    setCloneSourceId(null);
    setCloneView('pick');
    setCloneTitle('');
  }, []);

  return {
    isMutating,
    createBlank,
    startUpload,
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
  };
}

// ─── Option buttons (shared styling) ──────────────────────────────

function NewResumeOptionButton({
  icon: Icon,
  label,
  description,
  onClick,
  disabled,
}: {
  icon: typeof Upload;
  label: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-start gap-2.5 rounded-md border border-border/60 bg-card p-2.5 text-left transition-colors hover:border-primary/30 hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}

// ─── Ghost card ───────────────────────────────────────────────────

export function NewResumeGhostCard({
  disabled,
  isMutating,
  className,
  onBlank,
  onUpload,
  onClone,
}: {
  disabled?: boolean;
  isMutating?: boolean;
  className?: string;
  onBlank: () => void;
  onUpload: () => void;
  onClone: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isDisabled = disabled || isMutating;

  const showOptions = isExpanded;

  return (
    <div
      className={cn(
        'group/new-resume relative overflow-hidden rounded-lg border border-dashed border-border/60 bg-muted/10 text-muted-foreground transition-colors duration-200',
        !isDisabled && 'hover:border-primary/40 hover:bg-card',
        showOptions && !isDisabled && 'border-primary/40 bg-card',
        className
      )}
    >
      <button
        type="button"
        disabled={isDisabled}
        onClick={() => setIsExpanded((current) => !current)}
        className={cn(
          'flex h-full w-full flex-col items-center justify-center gap-2.5 p-4 transition-opacity duration-200',
          showOptions
            ? 'pointer-events-none opacity-0'
            : 'opacity-100 group-hover/new-resume:pointer-events-none group-hover/new-resume:opacity-0',
          isDisabled && 'cursor-not-allowed opacity-50'
        )}
        aria-label="Create new resume"
        aria-expanded={showOptions}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-card">
          <Plus className="h-4 w-4" />
        </span>
        <span className="text-sm font-medium">New resume</span>
      </button>

      <div
        className={cn(
          'absolute inset-0 z-10 flex flex-col justify-center gap-2 bg-card p-3 transition-opacity duration-200',
          showOptions
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0 group-hover/new-resume:pointer-events-auto group-hover/new-resume:opacity-100',
          isDisabled && 'hidden'
        )}
      >
        <NewResumeOptionButton
          icon={Upload}
          label="Upload resume"
          description="Import from a PDF via onboarding"
          onClick={onUpload}
          disabled={isMutating}
        />
        <NewResumeOptionButton
          icon={Copy}
          label="Clone existing"
          description="Copy data from another resume"
          onClick={onClone}
          disabled={isMutating}
        />
        <NewResumeOptionButton
          icon={FileText}
          label="Start blank"
          description="Open an empty resume in the builder"
          onClick={onBlank}
          disabled={isMutating}
        />
      </div>
    </div>
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
  onSelect: (sourceId: string) => void;
}) {
  const displayName = getDisplayName(resume);

  return (
    <button
      type="button"
      onClick={() => onSelect(resume.id)}
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
  onSelectSource: (sourceId: string) => void;
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
                    onSelect={onSelectSource}
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
                placeholder="e.g., Software Engineer Resume"
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
