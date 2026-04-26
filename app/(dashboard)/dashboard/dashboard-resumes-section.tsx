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
  Plus,
  Share2,
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
import { Card, CardContent, CardFooter } from '@/components/ui/card';
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

import { ResumeThumbnail } from '../resumes/resume-thumbnail';

// ─── Types ────────────────────────────────────────────────────────

export interface DashboardResumeItem {
  id: string;
  handle: string;
  resumeTitle: string;
  status: string;
  resumeVisibility: string;
  firstName: string | null;
  lastName: string | null;
  headline: string | null;
  updatedAt: string;
  createdAt: string;
}

interface DashboardResumesSectionProps {
  initialResumes: DashboardResumeItem[];
  initialActiveProfileId: string | null;
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
  const parts = [resume.firstName, resume.lastName].filter(Boolean);
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
}: DashboardResumesSectionProps) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [resumes, setResumes] = useState<DashboardResumeItem[]>(initialResumes);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(initialActiveProfileId);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clone dialog state
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [cloneSourceId, setCloneSourceId] = useState<string | null>(null);
  const [cloneTitle, setCloneTitle] = useState('');

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
      };
      setResumes(data.resumes);
      setActiveProfileId(data.activeProfileId);
    } catch {
      // Silently fail — user sees stale data until next action
    }
  }, []);

  // ─── Handlers ─────────────────────────────────────────────────

  const activateForBuilder = async (resumeId: string) => {
    if (resumeId === activeProfileId) return;
    const response = await fetch(`/api/resumes/${resumeId}/activate`, { method: 'PATCH' });
    if (!response.ok) throw new Error('Failed to open resume in builder');
    setActiveProfileId(resumeId);
  };

  const handleCreateBlankAndOpen = async () => {
    setIsMutating(true);
    setError(null);

    try {
      const response = await fetch('/api/resumes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy: 'BLANK' }),
      });

      if (!response.ok) throw new Error('Failed to create resume');

      router.push('/builder?new=1');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create resume');
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

  const openCloneDialog = (sourceId: string) => {
    setCloneSourceId(sourceId);
    setCloneTitle('');
    setShowCloneDialog(true);
  };

  const handleClone = async () => {
    setShowCloneDialog(false);
    setIsMutating(true);
    setError(null);

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

      await refreshResumes();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clone resume');
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
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/5 py-16 text-center">
          <div className="rounded-xl bg-muted/30 p-3">
            <FileText className="h-6 w-6 text-muted-foreground/50" />
          </div>
          <p className="mt-3 text-sm font-medium text-muted-foreground">No resumes yet</p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Create your first resume to get started
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-5 h-8 gap-1.5 text-xs"
            disabled={isMutating}
            onClick={() => void handleCreateBlankAndOpen()}
          >
            <Plus className="h-3 w-3" />
            Create Resume
          </Button>
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

          <div ref={scrollRef} className="scrollbar-none flex gap-4 overflow-x-auto pb-2">
            {resumes.map((resume) => {
              const displayName = getDisplayName(resume);

              return (
                <Card
                  key={resume.id}
                  className="group relative w-[280px] shrink-0 overflow-hidden transition-shadow hover:shadow-md"
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
                    <ResumeThumbnail profileId={resume.id} className="rounded-t-2xl" />
                  </div>

                  <CardContent className="pb-2 pt-3">
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
                          <h3 className="truncate text-sm font-semibold">{resume.resumeTitle}</h3>
                        )}
                        {displayName && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
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
                            className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
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
                            onClick={() => openCloneDialog(resume.id)}
                            disabled={!canCreateNew}
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            Clone
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
                  </CardContent>

                  <CardFooter className="flex-col gap-2 border-t pb-3 pt-2">
                    {/* Quick action buttons */}
                    <div className="flex w-full items-center gap-2">
                      <Button
                        variant="default"
                        size="sm"
                        className="h-7 flex-1 gap-1.5 text-xs"
                        onClick={() => handleOpenInBuilder(resume.id)}
                        disabled={isMutating}
                      >
                        <Pencil className="h-3 w-3" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 flex-1 gap-1.5 text-xs"
                        asChild
                      >
                        <Link href={`/u/${resume.handle}/resume`} target="_blank">
                          <ExternalLink className="h-3 w-3" />
                          View
                        </Link>
                      </Button>
                      <TooltipProvider delayDuration={0}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1.5 text-xs"
                              onClick={() => handleOpenShareDialog(resume)}
                              disabled={isMutating}
                            >
                              <Share2 className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            <p>Share resume</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider delayDuration={0}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1.5 text-xs"
                              onClick={() => openCloneDialog(resume.id)}
                              disabled={!canCreateNew || isMutating}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            <p>
                              {!canCreateNew
                                ? `Maximum ${MAX_RESUMES_PER_USER} resumes`
                                : 'Clone resume'}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>

                    {/* Visibility & timestamp row */}
                    <div className="flex w-full items-center gap-3 text-xs text-muted-foreground">
                      {(() => {
                        const config =
                          VISIBILITY_CONFIG[resume.resumeVisibility] ?? VISIBILITY_CONFIG.PRIVATE;
                        const Icon = config.icon;
                        return (
                          <TooltipProvider delayDuration={0}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge
                                  variant={config.variant}
                                  className="cursor-default gap-1 text-[10px]"
                                >
                                  <Icon className="h-2.5 w-2.5" />
                                  {config.label}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent side="bottom">
                                <p>{config.description}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        );
                      })()}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatRelativeDate(resume.updatedAt)}
                      </span>
                    </div>
                  </CardFooter>
                </Card>
              );
            })}

            {/* "New Resume" ghost card — directly opens builder */}
            {canCreateNew && (
              <button
                type="button"
                onClick={() => void handleCreateBlankAndOpen()}
                disabled={isMutating}
                className="flex w-[280px] shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
              >
                <Plus className="h-8 w-8" />
                <span className="text-sm font-medium">New Resume</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ─── Clone Dialog ───────────────────────────────────────── */}
      <Dialog open={showCloneDialog} onOpenChange={setShowCloneDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clone Resume</DialogTitle>
            <DialogDescription>
              Create a copy of an existing resume with all its data.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleClone();
            }}
          >
            <Input
              autoFocus
              value={cloneTitle}
              onChange={(e) => setCloneTitle(e.target.value)}
              placeholder="e.g., Software Engineer Resume"
              maxLength={120}
            />

            <DialogFooter className="mt-4">
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isMutating}>
                {isMutating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
