'use client';

import {
  Check,
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
import { MAX_RESUMES_PER_USER } from '@/lib/validations';

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
import { ResumeThumbnail } from './resume-thumbnail';

// ─── Types ────────────────────────────────────────────────────────

type CreateStrategy = 'BLANK' | 'CLONE' | 'UPLOAD';

export interface ResumeItem {
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

interface ResumeDashboardClientProps {
  initialResumes: ResumeItem[];
  /**
   * Used internally to optimise builder navigation — never shown in UI.
   * Each resume is independently shareable, there is no user-facing "active" concept.
   */
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

function getDisplayName(resume: ResumeItem): string | null {
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
    // Auto-focus and select all text when entering rename mode
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

// ─── Component ────────────────────────────────────────────────────

export function ResumeDashboardClient({
  initialResumes,
  initialActiveProfileId,
}: ResumeDashboardClientProps) {
  const router = useRouter();

  const [resumes, setResumes] = useState<ResumeItem[]>(initialResumes);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(initialActiveProfileId);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createStrategy, setCreateStrategy] = useState<CreateStrategy>('BLANK');
  const [createTitle, setCreateTitle] = useState('');
  const [cloneSourceId, setCloneSourceId] = useState<string | null>(null);

  // Inline rename state
  const [renamingResumeId, setRenamingResumeId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Delete confirmation dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingResume, setDeletingResume] = useState<ResumeItem | null>(null);

  // Download dialog state
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [downloadingResume, setDownloadingResume] = useState<ResumeItem | null>(null);

  // Share dialog state
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [sharingResume, setSharingResume] = useState<ResumeItem | null>(null);

  // ─── Data refresh ─────────────────────────────────────────────

  const refreshResumes = useCallback(async () => {
    try {
      const response = await fetch('/api/resumes', { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to load resumes');
      const data = (await response.json()) as {
        resumes: ResumeItem[];
        activeProfileId: string | null;
      };
      setResumes(data.resumes);
      setActiveProfileId(data.activeProfileId);
    } catch {
      // Silently fail on refresh — user sees stale data until next action
    }
  }, []);

  // ─── Handlers ─────────────────────────────────────────────────

  /**
   * Silently set the builder's working resume. This is an internal
   * mechanism — there is no user-facing "active" concept.
   */
  const activateForBuilder = async (resumeId: string) => {
    if (resumeId === activeProfileId) return;

    const response = await fetch(`/api/resumes/${resumeId}/activate`, {
      method: 'PATCH',
    });

    if (!response.ok) throw new Error('Failed to open resume in builder');

    setActiveProfileId(resumeId);
  };

  /** Create a blank resume and navigate straight to the builder. */
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

      const data = (await response.json()) as {
        resume: { id: string; handle: string; resumeTitle: string };
      };

      // Navigate to builder with ?new=1 to trigger the import suggestion popup
      router.push('/builder?new=1');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create resume');
      setIsMutating(false);
    }
  };

  const openCreateDialog = (strategy: CreateStrategy, sourceId?: string) => {
    setCreateStrategy(strategy);
    setCloneSourceId(sourceId ?? null);
    setCreateTitle('');
    setShowCreateDialog(true);
  };

  const handleCreate = async () => {
    setShowCreateDialog(false);
    setIsMutating(true);
    setError(null);

    try {
      const payload: {
        strategy: CreateStrategy;
        sourceProfileId?: string;
        title?: string;
      } = {
        strategy: createStrategy,
        title: createTitle.trim() || undefined,
      };

      if (createStrategy === 'CLONE' && cloneSourceId) {
        payload.sourceProfileId = cloneSourceId;
      }

      const response = await fetch('/api/resumes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Failed to create resume');

      const data = (await response.json()) as {
        resume: { id: string; handle: string; resumeTitle: string };
        nextAction: 'UPLOAD_RESUME' | 'OPEN_BUILDER';
      };

      if (data.nextAction === 'UPLOAD_RESUME') {
        sessionStorage.setItem('importTargetProfileId', data.resume.id);
        router.push('/onboarding/import?from=builder&resume=new');
        return;
      }

      // Reload to show new resume
      await refreshResumes();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create resume');
    } finally {
      setIsMutating(false);
    }
  };

  const startInlineRename = (resume: ResumeItem) => {
    setRenamingResumeId(resume.id);
    setRenameValue(resume.resumeTitle);
    setRenameError(null);
  };

  const cancelInlineRename = () => {
    setRenamingResumeId(null);
    setRenameValue('');
    setRenameError(null);
  };

  // Rename error shown inline below the input
  const [renameError, setRenameError] = useState<string | null>(null);

  const handleInlineRename = async (resumeId: string) => {
    const trimmed = renameValue.trim();

    if (!trimmed || trimmed.length > 120) {
      setRenameError(trimmed ? 'Title must be 120 characters or fewer.' : 'Title is required.');
      return;
    }

    // Quick client-side duplicate check
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

  const openDeleteDialog = (resume: ResumeItem) => {
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
      const response = await fetch(`/api/resumes/${deletingResume.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete resume');

      setResumes((prev) => prev.filter((r) => r.id !== deletingResume.id));

      // Refresh to let the server pick a new active profile if needed
      await refreshResumes();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete resume');
    } finally {
      setIsMutating(false);
      setDeletingResume(null);
    }
  };

  const handleOpenDownloadDialog = (resume: ResumeItem) => {
    setDownloadingResume(resume);
    setDownloadDialogOpen(true);
  };

  const handleOpenShareDialog = (resume: ResumeItem) => {
    setSharingResume(resume);
    setShareDialogOpen(true);
  };

  /**
   * Called by ShareDialog before making API calls.
   * Ensures the correct profile is active so `/api/profile` and
   * `/api/profile/unlisted-key` target the right resume.
   */
  const handleShareBeforeOpen = useCallback(async () => {
    if (sharingResume) {
      await activateForBuilder(sharingResume.id);
    }
  }, [sharingResume, activeProfileId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ─── Render ───────────────────────────────────────────────────

  return (
    <div className="flat-cards space-y-8">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Resumes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create and manage multiple tailored resumes for different roles.
          </p>
        </div>

        {/* Create new */}
        <div className="flex items-center gap-2">
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    disabled={isMutating || resumes.length >= MAX_RESUMES_PER_USER}
                    onClick={() => void handleCreateBlankAndOpen()}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    New Resume
                  </Button>
                </span>
              </TooltipTrigger>
              {resumes.length >= MAX_RESUMES_PER_USER && (
                <TooltipContent side="bottom">
                  <p>
                    Maximum {MAX_RESUMES_PER_USER} resumes per user. Delete one to create a new
                    resume.
                  </p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
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

      {/* Resume cards grid */}
      {resumes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <h2 className="mt-4 text-lg font-semibold">No resumes yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first resume to get started.
          </p>
          <Button
            className="mt-6"
            disabled={isMutating}
            onClick={() => void handleCreateBlankAndOpen()}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Resume
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {resumes.map((resume) => {
            const displayName = getDisplayName(resume);

            return (
              <Card
                key={resume.id}
                className="group relative overflow-hidden transition-shadow hover:shadow-md"
              >
                {/* Resume thumbnail preview */}
                <button
                  type="button"
                  className="relative block w-full cursor-pointer border-b"
                  onClick={() => void handleOpenInBuilder(resume.id)}
                  disabled={isMutating}
                  aria-label={`Open ${resume.resumeTitle} in builder`}
                >
                  <ResumeThumbnail profileId={resume.id} className="rounded-t-xl" />
                </button>

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
                          onClick={() => openCreateDialog('CLONE', resume.id)}
                          disabled={resumes.length >= MAX_RESUMES_PER_USER}
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
                            onClick={() => openCreateDialog('CLONE', resume.id)}
                            disabled={resumes.length >= MAX_RESUMES_PER_USER || isMutating}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p>
                            {resumes.length >= MAX_RESUMES_PER_USER
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

          {/* "New resume" ghost card — hidden when at limit */}
          {resumes.length < MAX_RESUMES_PER_USER && (
            <button
              type="button"
              onClick={() => void handleCreateBlankAndOpen()}
              disabled={isMutating}
              className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
            >
              <Plus className="h-8 w-8" />
              <span className="text-sm font-medium">New Resume</span>
            </button>
          )}
        </div>
      )}

      {/* ─── Create Dialog ──────────────────────────────────────── */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
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
              void handleCreate();
            }}
          >
            <Input
              autoFocus
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
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

      {/* ─── Download Dialog (reuses builder's layout picker) ──── */}
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

      {/* ─── Share Dialog (reuses builder's share service) ──── */}
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
            // Sync local state so the card badge and future dialog opens reflect the change
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
    </div>
  );
}
