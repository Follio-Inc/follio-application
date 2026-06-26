'use client';

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Globe,
  Link2,
  Loader2,
  Lock,
  MoreHorizontal,
  Pencil,
  Share2,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { DownloadDialog } from '@/app/(dashboard)/builder/components/download-dialog';
import { ShareDialog } from '@/components/share-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { MAX_RESUMES_PER_USER } from '@/lib/validations';

import {
  NewResumeCloneDialog,
  NewResumeGhostCard,
  NewResumeMenuButton,
  useNewResumeActions,
} from '../resumes/new-resume-options';
import { ResumeThumbnail } from '../resumes/resume-thumbnail';

// ─── Types ────────────────────────────────────────────────────────

export interface DashboardResumeItem {
  id: string;
  handle: string;
  resumeTitle: string;
  status: string;
  resumeVisibility: string;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  headline: string | null;
  updatedAt: string;
  createdAt: string;
}

interface DashboardResumesSectionProps {
  initialResumes: DashboardResumeItem[];
  initialActiveProfileId: string | null;
  initialPrimaryProfileId: string | null;
}

// ─── Constants ────────────────────────────────────────────────────

const VISIBILITY_CONFIG: Record<
  string,
  {
    label: string;
    description: string;
    variant: 'default' | 'secondary' | 'outline';
    icon: typeof Globe;
  }
> = {
  PUBLIC: {
    label: 'Public',
    description: 'Visible to everyone and listed on your profile',
    variant: 'default',
    icon: Globe,
  },
  UNLISTED: {
    label: 'Visible with Link',
    description: 'Only people with the direct link can view this resume',
    variant: 'secondary',
    icon: Link2,
  },
  PRIVATE: {
    label: 'Private',
    description: 'Only you can see this resume',
    variant: 'outline',
    icon: Lock,
  },
};

// ─── Helpers ──────────────────────────────────────────────────────

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function getDisplayName(resume: DashboardResumeItem): string | null {
  const parts = [resume.firstName, resume.middleName, resume.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : null;
}

// ─── Sub-components ───────────────────────────────────────────────

/** Inline input for renaming a resume directly on the card. */
function InlineRenameInput({
  value,
  error,
  isMutating,
  onChange,
  onConfirm,
  onCancel,
}: {
  value: string;
  error: string | null;
  isMutating: boolean;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  return (
    <div className="space-y-1">
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm();
        }}
      >
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancel();
          }}
          className="h-7 text-sm font-semibold"
          maxLength={120}
          aria-invalid={!!error}
          disabled={isMutating}
        />
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-primary hover:text-primary"
          disabled={isMutating || !value.trim()}
        >
          {isMutating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={onCancel}
          disabled={isMutating}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </form>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────

export function DashboardResumesSection({
  initialResumes,
  initialActiveProfileId,
  initialPrimaryProfileId,
}: DashboardResumesSectionProps) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [resumes, setResumes] = useState<DashboardResumeItem[]>(initialResumes);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(initialActiveProfileId);
  const [primaryProfileId, setPrimaryProfileId] = useState<string | null>(initialPrimaryProfileId);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline rename state
  const [renamingResumeId, setRenamingResumeId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);

  // Delete confirmation dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingResume, setDeletingResume] = useState<DashboardResumeItem | null>(null);

  // Download dialog state
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [downloadingResume, setDownloadingResume] = useState<DashboardResumeItem | null>(null);

  // Share dialog state
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [sharingResume, setSharingResume] = useState<DashboardResumeItem | null>(null);

  // Scroll arrow visibility
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // ─── Scroll management ─────────────────────────────────────────

  const updateScrollArrows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    updateScrollArrows();

    el.addEventListener('scroll', updateScrollArrows, { passive: true });
    const observer = new ResizeObserver(updateScrollArrows);
    observer.observe(el);

    return () => {
      el.removeEventListener('scroll', updateScrollArrows);
      observer.disconnect();
    };
  }, [updateScrollArrows, resumes.length]);

  const scrollBy = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.75;
    el.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  // ─── Data refresh ─────────────────────────────────────────────

  const refreshResumes = useCallback(async () => {
    try {
      const response = await fetch('/api/resumes', { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to load resumes');
      const data = (await response.json()) as {
        resumes: DashboardResumeItem[];
        activeProfileId: string | null;
        primaryProfileId: string | null;
      };
      setResumes(data.resumes);
      setActiveProfileId(data.activeProfileId);
      setPrimaryProfileId(data.primaryProfileId);
    } catch {
      // Silently fail — user sees stale data until next action
    }
  }, []);

  const newResume = useNewResumeActions({
    onRefresh: refreshResumes,
    onError: setError,
  });

  const isBusy = isMutating || newResume.isMutating;

  // ─── Handlers ─────────────────────────────────────────────────

  const activateForBuilder = async (resumeId: string) => {
    if (resumeId === activeProfileId) return;
    const response = await fetch(`/api/resumes/${resumeId}/activate`, { method: 'PATCH' });
    if (!response.ok) throw new Error('Failed to open resume in builder');
    setActiveProfileId(resumeId);
  };

  const handleSetAsPortfolio = async (resumeId: string) => {
    if (resumeId === primaryProfileId) return;
    setIsMutating(true);
    setError(null);

    try {
      const response = await fetch(`/api/resumes/${resumeId}/set-primary`, { method: 'PATCH' });
      if (!response.ok) throw new Error('Failed to set portfolio');
      setPrimaryProfileId(resumeId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set portfolio');
    } finally {
      setIsMutating(false);
    }
  };

  const handleOpenInBuilder = async (resumeId: string) => {
    setIsMutating(true);
    setError(null);

    try {
      await activateForBuilder(resumeId);
      router.push('/builder');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open resume');
    } finally {
      setIsMutating(false);
    }
  };

  const startInlineRename = (resume: DashboardResumeItem) => {
    setRenamingResumeId(resume.id);
    setRenameValue(resume.resumeTitle);
    setRenameError(null);
  };

  const cancelInlineRename = () => {
    setRenamingResumeId(null);
    setRenameValue('');
    setRenameError(null);
  };

  const handleInlineRename = async (resumeId: string) => {
    const trimmed = renameValue.trim();

    if (!trimmed || trimmed.length > 120) {
      setRenameError(trimmed ? 'Title must be 120 characters or fewer.' : 'Title is required.');
      return;
    }

    const isDuplicate = resumes.some(
      (r) => r.id !== resumeId && r.resumeTitle.toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) {
      setRenameError('A resume with this name already exists.');
      return;
    }

    setRenameError(null);
    setIsMutating(true);

    try {
      const response = await fetch(`/api/resumes/${resumeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeTitle: trimmed }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        if (response.status === 409) {
          setRenameError(data.error ?? 'A resume with this name already exists.');
          return;
        }
        throw new Error(data.error ?? 'Failed to rename resume');
      }

      setResumes((prev) =>
        prev.map((r) => (r.id === resumeId ? { ...r, resumeTitle: trimmed } : r))
      );
      cancelInlineRename();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename');
      cancelInlineRename();
    } finally {
      setIsMutating(false);
    }
  };

  const openDeleteDialog = (resume: DashboardResumeItem) => {
    setDeletingResume(resume);
    setShowDeleteDialog(true);
  };

  const handleDelete = async () => {
    if (!deletingResume) return;

    if (resumes.length <= 1) {
      setError('Cannot delete your only resume');
      setShowDeleteDialog(false);
      return;
    }

    setShowDeleteDialog(false);
    setIsMutating(true);
    setError(null);

    try {
      const response = await fetch(`/api/resumes/${deletingResume.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete resume');

      setResumes((prev) => prev.filter((r) => r.id !== deletingResume.id));
      await refreshResumes();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete resume');
    } finally {
      setIsMutating(false);
      setDeletingResume(null);
    }
  };

  const handleOpenDownloadDialog = (resume: DashboardResumeItem) => {
    setDownloadingResume(resume);
    setDownloadDialogOpen(true);
  };

  const handleOpenShareDialog = (resume: DashboardResumeItem) => {
    setSharingResume(resume);
    setShareDialogOpen(true);
  };

  const handleShareBeforeOpen = useCallback(async () => {
    if (sharingResume) {
      await activateForBuilder(sharingResume.id);
    }
  }, [sharingResume, activeProfileId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Render ───────────────────────────────────────────────────

  const canCreateNew = resumes.length < MAX_RESUMES_PER_USER;

  return (
    <>
      {/* Error banner */}
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
          <button
            type="button"
            className="ml-2 underline hover:no-underline"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {resumes.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/10 px-6 py-14 text-center">
          <FileText className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
          <p className="mt-4 text-sm font-medium text-foreground">No resumes yet</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Create your first resume and we&apos;ll open it in the builder.
          </p>
          <div className="mt-5">
            <NewResumeMenuButton
              isMutating={isBusy}
              onBlank={() => void newResume.createBlank()}
              onUpload={() => void newResume.startUpload()}
              onClone={() => newResume.openCloneDialog()}
            />
          </div>
        </div>
      ) : (
        /* Horizontal scroll container */
        <div className="group/scroll relative">
          {/* Left scroll arrow */}
          {canScrollLeft && (
            <button
              type="button"
              onClick={() => scrollBy('left')}
              className="absolute -left-3 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border bg-background shadow-md transition-opacity hover:bg-muted"
              aria-label="Scroll left"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}

          {/* Right scroll arrow */}
          {canScrollRight && (
            <button
              type="button"
              onClick={() => scrollBy('right')}
              className="absolute -right-3 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border bg-background shadow-md transition-opacity hover:bg-muted"
              aria-label="Scroll right"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          )}

          <div ref={scrollRef} className="scrollbar-none flex gap-5 overflow-x-auto pb-2">
            {resumes.map((resume) => {
              const displayName = getDisplayName(resume);

              return (
                <Card
                  key={resume.id}
                  className="group relative flex w-[260px] shrink-0 flex-col overflow-hidden transition-all duration-200 hover:border-border hover:shadow-md"
                >
                  {/*
                   * Resume thumbnail preview.
                   *
                   * Rendered as a div with role="button" rather than a real
                   * <button> because <ResumeThumbnail> contains its own
                   * "Retry" button in its error state, and a <button> cannot
                   * be a descendant of another <button> (HTML hydration
                   * error). The div + role/keydown pattern preserves
                   * keyboard activation and screen-reader semantics.
                   */}
                  <div
                    role="button"
                    tabIndex={isMutating ? -1 : 0}
                    aria-disabled={isMutating}
                    aria-label={`Open ${resume.resumeTitle} in builder`}
                    className="relative block w-full cursor-pointer border-b border-border/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-disabled:cursor-not-allowed"
                    onClick={() => {
                      if (isMutating) return;
                      void handleOpenInBuilder(resume.id);
                    }}
                    onKeyDown={(event) => {
                      if (isMutating) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        void handleOpenInBuilder(resume.id);
                      }
                    }}
                  >
                    <ResumeThumbnail profileId={resume.id} />
                    {resume.id === primaryProfileId && (
                      <Badge className="absolute left-2.5 top-2.5 z-10 gap-1 text-[10px] shadow-sm">
                        <Star className="h-2.5 w-2.5" />
                        Portfolio
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {renamingResumeId === resume.id ? (
                          <InlineRenameInput
                            value={renameValue}
                            error={renameError}
                            isMutating={isMutating}
                            onChange={(v) => {
                              setRenameValue(v);
                              if (renameError) setRenameError(null);
                            }}
                            onConfirm={() => void handleInlineRename(resume.id)}
                            onCancel={cancelInlineRename}
                          />
                        ) : (
                          <h3 className="truncate text-sm font-semibold leading-tight text-foreground">
                            {resume.resumeTitle}
                          </h3>
                        )}
                        {displayName && (
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {displayName}
                          </p>
                        )}
                      </div>

                      {/* Card actions menu */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="-mr-1.5 -mt-1.5 h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Resume actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => handleOpenInBuilder(resume.id)}>
                            <FileText className="mr-2 h-4 w-4" />
                            Open in Builder
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/u/${resume.handle}/resume`} target="_blank">
                              <ExternalLink className="mr-2 h-4 w-4" />
                              View Resume
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleOpenDownloadDialog(resume)}>
                            <Download className="mr-2 h-4 w-4" />
                            Download PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleOpenShareDialog(resume)}>
                            <Share2 className="mr-2 h-4 w-4" />
                            Share
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => startInlineRename(resume)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => newResume.openCloneDialog()}
                            disabled={!canCreateNew}
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            Clone
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => void handleSetAsPortfolio(resume.id)}
                            disabled={resume.id === primaryProfileId || isMutating}
                          >
                            <Star className="mr-2 h-4 w-4" />
                            {resume.id === primaryProfileId
                              ? 'Current Portfolio'
                              : 'Set as Portfolio'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => openDeleteDialog(resume)}
                            disabled={resumes.length <= 1}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Visibility & timestamp row */}
                    <div className="mt-auto flex items-center gap-2 text-xs text-muted-foreground">
                      {(() => {
                        const config =
                          VISIBILITY_CONFIG[resume.resumeVisibility] ?? VISIBILITY_CONFIG.PRIVATE;
                        const Icon = config.icon;
                        return (
                          <TooltipProvider delayDuration={0}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex cursor-default items-center gap-1">
                                  <Icon className="h-3 w-3" />
                                  {config.label}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom">
                                <p>{config.description}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        );
                      })()}
                      <span aria-hidden className="text-border">
                        •
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatRelativeDate(resume.updatedAt)}
                      </span>
                    </div>

                    {/* Primary actions */}
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="flex-1 gap-1.5"
                        onClick={() => handleOpenInBuilder(resume.id)}
                        disabled={isMutating}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1 gap-1.5" asChild>
                        <Link href={`/u/${resume.handle}/resume`} target="_blank">
                          <ExternalLink className="h-3.5 w-3.5" />
                          View
                        </Link>
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}

            {/* "New Resume" ghost card — directly opens builder */}
            {canCreateNew && (
              <NewResumeGhostCard
                className="min-h-[260px] w-[260px] shrink-0"
                isMutating={isBusy}
                onBlank={() => void newResume.createBlank()}
                onUpload={() => void newResume.startUpload()}
                onClone={() => newResume.openCloneDialog()}
              />
            )}
          </div>
        </div>
      )}

      <NewResumeCloneDialog
        open={newResume.showCloneDialog}
        onOpenChange={newResume.setShowCloneDialog}
        view={newResume.cloneView}
        resumes={resumes}
        cloneSourceId={newResume.cloneSourceId}
        cloneTitle={newResume.cloneTitle}
        onCloneTitleChange={newResume.setCloneTitle}
        onSelectSource={newResume.selectCloneSource}
        onBack={newResume.backToClonePick}
        onConfirm={() => void newResume.confirmClone()}
        isMutating={isBusy}
      />

      {/* ─── Delete Confirmation Dialog ─────────────────────────── */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Permanently Delete Resume</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3">
                <p>
                  You are about to permanently delete &ldquo;
                  <span className="font-semibold text-foreground">
                    {deletingResume?.resumeTitle}
                  </span>
                  &rdquo;.
                </p>
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  <p className="font-medium">This cannot be undone.</p>
                  <p className="mt-1 text-destructive/80">
                    All data in this resume will be permanently removed — including work experience,
                    education, skills, projects, and any custom sections. The shareable link{' '}
                    <span className="font-mono text-xs">/{deletingResume?.handle}</span> will stop
                    working.
                  </p>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={isMutating}>
              {isMutating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Yes, Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Download Dialog ──────────────────────────────────── */}
      {downloadingResume && (
        <DownloadDialog
          handle={downloadingResume.handle}
          resumeTitle={downloadingResume.resumeTitle}
          open={downloadDialogOpen}
          onOpenChange={(open) => {
            setDownloadDialogOpen(open);
            if (!open) setDownloadingResume(null);
          }}
          onShareClick={() => {
            setDownloadDialogOpen(false);
            handleOpenShareDialog(downloadingResume);
          }}
        />
      )}

      {/* ─── Share Dialog ─────────────────────────────────────── */}
      {sharingResume && (
        <ShareDialog
          profile={{
            handle: sharingResume.handle,
            firstName: sharingResume.firstName,
            resumeVisibility: sharingResume.resumeVisibility as 'PUBLIC' | 'UNLISTED' | 'PRIVATE',
          }}
          open={shareDialogOpen}
          onOpenChange={(open) => {
            setShareDialogOpen(open);
            if (!open) setSharingResume(null);
          }}
          onBeforeOpen={handleShareBeforeOpen}
          onVisibilityChange={(visibility) => {
            setResumes((prev) =>
              prev.map((r) =>
                r.id === sharingResume.id ? { ...r, resumeVisibility: visibility } : r
              )
            );
            setSharingResume((prev) => (prev ? { ...prev, resumeVisibility: visibility } : prev));
          }}
          hideTrigger
        />
      )}

      {/* Loading overlay */}
      {isMutating && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/30">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}
    </>
  );
}
