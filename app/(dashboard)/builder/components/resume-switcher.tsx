'use client';

import {
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NewResumeTemplatePicker } from '@/components/resume/new-resume-template-picker';
import { suggestCloneResumeTitle, suggestDefaultResumeTitle } from '@/lib/resume-title';
import type { ResumeDesign } from '@/types';

import { useBuilderStore } from './builder-store-provider';

// ─── Types ────────────────────────────────────────────────────────

type ResumeItem = {
  id: string;
  handle: string;
  resumeTitle: string;
  status: 'DRAFT' | 'PUBLIC' | 'PRIVATE';
  firstName: string | null;
  lastName: string | null;
  headline: string | null;
  updatedAt: string;
  createdAt: string;
};

type ResumeResponse = {
  resumes: ResumeItem[];
  activeProfileId: string | null;
};

type CreateStrategy = 'BLANK' | 'CLONE' | 'UPLOAD';

// ─── Constants ────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PUBLIC: 'Public',
  PRIVATE: 'Private',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  PUBLIC: 'bg-green-500/15 text-green-700 dark:text-green-400',
  PRIVATE: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400',
};

/** Max resumes shown in the dropdown before showing a "View all" link */
const MAX_VISIBLE_RESUMES = 4;

// ─── Helpers ──────────────────────────────────────────────────────

async function fetchResumes(): Promise<ResumeResponse> {
  const response = await fetch('/api/resumes', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Failed to load resumes');
  }
  return (await response.json()) as ResumeResponse;
}

// ─── Component ────────────────────────────────────────────────────

export function ResumeSwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const commitInlineChange = useBuilderStore((s) => s.commitInlineChange);

  const isBuilderRoute = pathname.startsWith('/builder');
  const [resumes, setResumes] = useState<ResumeItem[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New resume dialog state
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newResumeTitle, setNewResumeTitle] = useState('');
  const [pendingStrategy, setPendingStrategy] = useState<CreateStrategy | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [pendingBlankTitle, setPendingBlankTitle] = useState<string | undefined>(undefined);

  // Inline rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Dropdown ref for outside-click dismissal
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeResume = useMemo(
    () => resumes.find((resume) => resume.id === activeProfileId) ?? null,
    [resumes, activeProfileId]
  );

  const loadResumes = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchResumes();
      setResumes(data.resumes);
      setActiveProfileId(data.activeProfileId);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load resumes');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isBuilderRoute) return;
    void loadResumes();
  }, [isBuilderRoute, loadResumes]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Focus rename input when editing
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  if (!isBuilderRoute) {
    return null;
  }

  // ─── Handlers ───────────────────────────────────────────────────

  const handleActivate = async (resumeId: string) => {
    if (resumeId === activeProfileId) {
      setIsOpen(false);
      return;
    }

    setIsMutating(true);
    setError(null);

    try {
      const response = await fetch(`/api/resumes/${resumeId}/activate`, {
        method: 'PATCH',
      });

      if (!response.ok) {
        throw new Error('Failed to switch resume');
      }

      setActiveProfileId(resumeId);
      setIsOpen(false);
      router.refresh();
    } catch (activateError) {
      setError(activateError instanceof Error ? activateError.message : 'Failed to switch resume');
    } finally {
      setIsMutating(false);
    }
  };

  const openNewResumeDialog = (strategy: CreateStrategy) => {
    setPendingStrategy(strategy);
    const existingTitles = resumes.map((resume) => resume.resumeTitle);
    if (strategy === 'CLONE' && activeResume) {
      setNewResumeTitle(
        suggestCloneResumeTitle(activeResume.resumeTitle, new Date(), existingTitles)
      );
    } else {
      setNewResumeTitle(suggestDefaultResumeTitle(new Date(), existingTitles));
    }
    setShowNewDialog(true);
  };

  const handleCreateResume = async () => {
    if (!pendingStrategy) return;

    const title = newResumeTitle.trim() || undefined;

    // Blank: name first, then template gallery (sample-when-sparse), then create.
    if (pendingStrategy === 'BLANK') {
      setShowNewDialog(false);
      setPendingBlankTitle(title);
      setPendingStrategy(null);
      setTemplatePickerOpen(true);
      return;
    }

    setShowNewDialog(false);
    setIsMutating(true);
    setError(null);

    try {
      const payload: {
        strategy: CreateStrategy;
        sourceProfileId?: string;
        title?: string;
      } = {
        strategy: pendingStrategy,
        title,
      };

      if (pendingStrategy === 'CLONE' && activeProfileId) {
        payload.sourceProfileId = activeProfileId;
      }

      const response = await fetch('/api/resumes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Failed to create resume');
      }

      const data = (await response.json()) as {
        resume: { id: string; handle: string; resumeTitle: string };
        nextAction: 'UPLOAD_RESUME' | 'OPEN_BUILDER';
      };

      setActiveProfileId(data.resume.id);
      setIsOpen(false);

      if (data.nextAction === 'UPLOAD_RESUME') {
        // Store the target profile ID so the onboarding flow populates the right resume
        sessionStorage.setItem('importTargetProfileId', data.resume.id);
        router.push('/onboarding/import?from=builder&resume=new');
        return;
      }

      // Reload builder with new resume
      await loadResumes();
      router.refresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create resume');
    } finally {
      setIsMutating(false);
    }
  };

  const handleBlankTemplateSelect = async (design: ResumeDesign) => {
    setTemplatePickerOpen(false);
    setIsMutating(true);
    setError(null);

    try {
      const response = await fetch('/api/resumes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy: 'BLANK',
          title: pendingBlankTitle,
          resumeDesign: design,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create resume');
      }

      const data = (await response.json()) as {
        resume: { id: string; handle: string; resumeTitle: string };
      };

      setActiveProfileId(data.resume.id);
      setPendingBlankTitle(undefined);
      setIsOpen(false);
      await loadResumes();
      router.refresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create resume');
    } finally {
      setIsMutating(false);
    }
  };

  const handleRename = async (resumeId: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed.length > 120) {
      setRenamingId(null);
      return;
    }

    setIsMutating(true);
    try {
      const response = await fetch(`/api/resumes/${resumeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeTitle: trimmed }),
      });

      if (!response.ok) {
        throw new Error('Failed to rename');
      }

      setResumes((prev) =>
        prev.map((r) => (r.id === resumeId ? { ...r, resumeTitle: trimmed } : r))
      );

      if (resumeId === activeProfileId) {
        commitInlineChange({ resumeTitle: trimmed });
      }
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : 'Failed to rename');
    } finally {
      setRenamingId(null);
      setIsMutating(false);
    }
  };

  const handleDelete = async (resumeId: string) => {
    if (resumes.length <= 1) {
      setError('Cannot delete your only resume');
      return;
    }

    setIsMutating(true);
    setError(null);

    try {
      const response = await fetch(`/api/resumes/${resumeId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete resume');
      }

      const deletedWasActive = resumeId === activeProfileId;
      setResumes((prev) => prev.filter((r) => r.id !== resumeId));

      if (deletedWasActive) {
        // Switch to the first remaining resume
        const remaining = resumes.filter((r) => r.id !== resumeId);
        if (remaining.length > 0) {
          await handleActivate(remaining[0].id);
        }
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete');
    } finally {
      setIsMutating(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        className="h-9 gap-2 px-2"
        onClick={() => setIsOpen((current) => !current)}
        disabled={isLoading || isMutating}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="max-w-[180px] truncate text-xs font-medium sm:text-sm">
              {activeResume?.resumeTitle || 'Resume'}
            </span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </>
        )}
      </Button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-lg border bg-background p-2 shadow-lg">
          <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Your resumes ({resumes.length})
          </p>

          <div className="space-y-1">
            {resumes.slice(0, MAX_VISIBLE_RESUMES).map((resume) => {
              const isActive = resume.id === activeProfileId;
              const isRenaming = renamingId === resume.id;

              return (
                <div
                  key={resume.id}
                  className={`group flex items-center gap-2 rounded-md px-2 py-2 transition-colors ${
                    isActive ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
                  }`}
                >
                  {isRenaming ? (
                    <form
                      className="flex-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void handleRename(resume.id);
                      }}
                    >
                      <Input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => void handleRename(resume.id)}
                        className="h-7 text-sm"
                        maxLength={120}
                      />
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleActivate(resume.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">{resume.resumeTitle}</p>
                        {isActive && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs text-muted-foreground">
                          /{resume.handle}
                        </span>
                        <span
                          className={`inline-flex shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                            STATUS_COLORS[resume.status] || ''
                          }`}
                        >
                          {STATUS_LABELS[resume.status] || resume.status}
                        </span>
                      </div>
                    </button>
                  )}

                  {/* Action buttons — visible on hover */}
                  {!isRenaming && (
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        title="Rename"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenamingId(resume.id);
                          setRenameValue(resume.resumeTitle);
                        }}
                        className="rounded p-1 hover:bg-muted-foreground/10"
                      >
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                      {resumes.length > 1 && (
                        <button
                          type="button"
                          title="Delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDelete(resume.id);
                          }}
                          className="rounded p-1 hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {resumes.length > MAX_VISIBLE_RESUMES && (
            <Link
              href="/resumes"
              onClick={() => setIsOpen(false)}
              className="mt-1 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/5"
            >
              View all {resumes.length} resumes
              <ArrowRight className="h-3 w-3" />
            </Link>
          )}

          <div className="my-2 border-t" />

          {/* Create new resume actions */}
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => openNewResumeDialog('BLANK')}
              disabled={isMutating}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Create blank resume
            </button>

            <button
              type="button"
              onClick={() => openNewResumeDialog('CLONE')}
              disabled={!activeProfileId || isMutating}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Copy className="h-4 w-4" />
              Clone current resume
            </button>

            <button
              type="button"
              onClick={() => openNewResumeDialog('UPLOAD')}
              disabled={isMutating}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              New resume from upload
            </button>
          </div>

          {error && <p className="mt-2 px-2 text-xs text-destructive">{error}</p>}
        </div>
      )}

      {/* New Resume Name Dialog */}
      {showNewDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-lg border bg-background p-6 shadow-xl">
            <h3 className="text-lg font-semibold">
              {pendingStrategy === 'CLONE'
                ? 'Name your clone'
                : pendingStrategy === 'UPLOAD'
                  ? 'New Resume from Upload'
                  : 'New Resume'}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {pendingStrategy === 'CLONE'
                ? activeResume
                  ? `Creating a copy of "${activeResume.resumeTitle}".`
                  : 'Create a copy of your current resume with a new name.'
                : pendingStrategy === 'UPLOAD'
                  ? "Upload a resume file to populate a new resume. You'll review the data before saving."
                  : 'Start with a clean slate and build from scratch.'}
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleCreateResume();
              }}
            >
              <Input
                autoFocus
                value={newResumeTitle}
                onChange={(e) => setNewResumeTitle(e.target.value)}
                placeholder="Resume name"
                className="mt-4"
                maxLength={120}
              />

              <div className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setShowNewDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isMutating}>
                  {isMutating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : pendingStrategy === 'UPLOAD' ? (
                    'Continue to Upload'
                  ) : pendingStrategy === 'BLANK' ? (
                    'Choose template'
                  ) : (
                    'Create'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <NewResumeTemplatePicker
        open={templatePickerOpen}
        onOpenChange={(open) => {
          setTemplatePickerOpen(open);
          if (!open) setPendingBlankTitle(undefined);
        }}
        onSelect={(design) => void handleBlankTemplateSelect(design)}
        applyLabel="Create resume"
      />
    </div>
  );
}
