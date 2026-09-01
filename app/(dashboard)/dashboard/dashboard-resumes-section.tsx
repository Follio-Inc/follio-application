'use client';

import {
  ArrowRight,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  MoreHorizontal,
  Pencil,
  Share2,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type Ref } from 'react';

import { DownloadDialog } from '@/app/(dashboard)/builder/components/download-dialog';
import {
  DashboardDocumentCard,
  DashboardDocumentCardTitle,
  DashboardDocumentsEmptyState,
  DashboardDocumentsScroller,
  DashboardDocumentsToolbar,
  DashboardDocumentThumbnailButton,
  DocumentVisibilityMeta,
} from '@/components/document-dashboard';
import { ShareDialog } from '@/components/share-dialog';
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
import { isPortfolioEnabled } from '@/lib/features';
import type { ResumePageLayout } from '@/types';

import {
  NewResumeCloneDialog,
  NewResumeMenuButton,
  NewResumeTemplatePickerHost,
  NewResumeUploadHost,
  sortResumesWithPortfolioFirst,
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
  /** Live resume page layout — gates download options. */
  pageLayout: ResumePageLayout;
}

interface DashboardResumesSectionProps {
  initialResumes: DashboardResumeItem[];
  initialActiveProfileId: string | null;
  initialPrimaryProfileId: string | null;
  /**
   * When true, the section title/count are omitted — the parent owns that chrome
   * (e.g. dashboard documents tabs). Actions toolbar is still shown.
   */
  embedded?: boolean;
  /** Marks the resume the Follio is attached to, for the dashboard rail. */
  attachedResumeRef?: Ref<HTMLDivElement>;
}

// ─── Constants ────────────────────────────────────────────────────

/** How many resume cards to show on the dashboard before "View all". */
const DASHBOARD_RESUME_PREVIEW_LIMIT = 4;

// ─── Helpers ──────────────────────────────────────────────────────

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
  embedded = false,
  attachedResumeRef,
}: DashboardResumesSectionProps) {
  const router = useRouter();

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

  const sortedResumes = useMemo(
    () => sortResumesWithPortfolioFirst(resumes, primaryProfileId),
    [resumes, primaryProfileId]
  );
  const previewResumes = useMemo(
    () => sortedResumes.slice(0, DASHBOARD_RESUME_PREVIEW_LIMIT),
    [sortedResumes]
  );
  const hasMoreResumes = sortedResumes.length > DASHBOARD_RESUME_PREVIEW_LIMIT;
  const remainingResumeCount = sortedResumes.length - previewResumes.length;

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

  return (
    <div className="space-y-4">
      <DashboardDocumentsToolbar
        embedded={embedded}
        title="Resume"
        count={resumes.length}
        secondaryActions={
          hasMoreResumes ? (
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" asChild>
              <Link href="/resumes">
                View all
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          ) : null
        }
        createAction={
          <NewResumeMenuButton
            isMutating={isBusy}
            onBlank={() => void newResume.createBlank()}
            onUpload={() => void newResume.startUpload()}
            onClone={() => newResume.openCloneDialog()}
          />
        }
      />

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
        <DashboardDocumentsEmptyState
          icon={FileText}
          title="No resumes yet"
          description="Create your first resume and we'll open it in the builder."
          action={
            <NewResumeMenuButton
              isMutating={isBusy}
              onBlank={() => void newResume.createBlank()}
              onUpload={() => void newResume.startUpload()}
              onClone={() => newResume.openCloneDialog()}
            />
          }
        />
      ) : (
        <DashboardDocumentsScroller itemCount={previewResumes.length + (hasMoreResumes ? 1 : 0)}>
          {previewResumes.map((resume, index) => {
            const displayName = getDisplayName(resume);
            const isPublic = resume.resumeVisibility === 'PUBLIC';
            const portfolioEnabled = isPortfolioEnabled();

            return (
              <div key={resume.id} className="shrink-0">
                <DashboardDocumentCard
                  accent={isPublic ? 'public' : 'default'}
                  thumbnail={
                    <div ref={index === 0 ? attachedResumeRef : undefined}>
                      <DashboardDocumentThumbnailButton
                        label={`Open ${resume.resumeTitle} in builder`}
                        disabled={isMutating}
                        onOpen={() => void handleOpenInBuilder(resume.id)}
                      >
                        <ResumeThumbnail
                          profileId={resume.id}
                          showPublicBadge={isPublic}
                          showPortfolioBadge={
                            portfolioEnabled && resume.id === primaryProfileId && !isPublic
                          }
                        />
                      </DashboardDocumentThumbnailButton>
                    </div>
                  }
                  title={
                    renamingResumeId === resume.id ? (
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
                      <DashboardDocumentCardTitle
                        title={resume.resumeTitle}
                        subtitle={displayName ?? undefined}
                      />
                    )
                  }
                  menu={
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
                        <DropdownMenuItem onClick={() => newResume.openCloneDialog()}>
                          <Copy className="mr-2 h-4 w-4" />
                          Clone
                        </DropdownMenuItem>
                        {portfolioEnabled && (
                          <DropdownMenuItem
                            onClick={() => void handleSetAsPortfolio(resume.id)}
                            disabled={resume.id === primaryProfileId || isMutating}
                          >
                            <Star className="mr-2 h-4 w-4" />
                            {resume.id === primaryProfileId
                              ? 'Current Portfolio'
                              : 'Set as Portfolio'}
                          </DropdownMenuItem>
                        )}
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
                  }
                  meta={
                    <DocumentVisibilityMeta
                      visibility={resume.resumeVisibility}
                      updatedAt={resume.updatedAt}
                      descriptions={{
                        PUBLIC: 'Anyone can view at your Follio URL',
                        UNLISTED: 'Only people with the secure link can view this resume',
                        PRIVATE: 'Only you can see this resume',
                      }}
                    />
                  }
                  primaryActions={
                    <>
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
                    </>
                  }
                />
              </div>
            );
          })}

          {hasMoreResumes && (
            <Link
              href="/resumes"
              className="group flex w-[180px] shrink-0 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center transition-colors hover:border-border hover:bg-muted/40"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm ring-1 ring-border/60 transition-colors group-hover:text-foreground">
                <ArrowRight className="h-4 w-4" />
              </span>
              <span className="space-y-1">
                <span className="block text-sm font-medium text-foreground">View all</span>
                <span className="block text-xs text-muted-foreground">
                  {remainingResumeCount} more resume{remainingResumeCount === 1 ? '' : 's'}
                </span>
              </span>
            </Link>
          )}
        </DashboardDocumentsScroller>
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

      <NewResumeUploadHost
        inputRef={newResume.uploadInputRef}
        onFileChange={(event) => void newResume.handleUploadFileChange(event)}
        isParsing={newResume.isUploadParsing}
        fileName={newResume.uploadFileName}
        disabled={isBusy}
      />

      <NewResumeTemplatePickerHost
        open={newResume.templatePickerOpen}
        onOpenChange={newResume.onTemplatePickerOpenChange}
        onSelect={newResume.handleTemplateSelect}
        profile={newResume.templatePickerProfile}
        applyLabel={newResume.templatePickerApplyLabel}
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
          resumePageLayout={downloadingResume.pageLayout}
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
            id: sharingResume.id,
            handle: sharingResume.handle,
            firstName: sharingResume.firstName,
            resumeTitle: sharingResume.resumeTitle,
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
              prev.map((r) => {
                if (r.id === sharingResume.id) return { ...r, resumeVisibility: visibility };
                if (visibility === 'PUBLIC' && r.resumeVisibility === 'PUBLIC') {
                  return { ...r, resumeVisibility: 'UNLISTED' };
                }
                return r;
              })
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
