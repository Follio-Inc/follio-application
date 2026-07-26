'use client';

import {
  Download,
  ExternalLink,
  FilePenLine,
  FileText,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Share2,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { CoverLetterDownloadDialog } from '@/components/cover-letter/cover-letter-download-dialog';
import { CoverLetterThumbnail } from '@/components/cover-letter/cover-letter-thumbnail';
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
import type { CoverLetterVisibility } from '@/lib/cover-letter';
import type { DocumentPageLayout } from '@/lib/document-design';
import { getUnlistedCoverLetterPath } from '@/lib/url';

export interface DashboardCoverLetterItem {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  pageLayout: DocumentPageLayout;
  linkedProfileId: string | null;
  visibility: CoverLetterVisibility;
  /** Present when the letter can be opened via /cl/{key} (UNLISTED). */
  unlistedKey: string | null;
}

interface DashboardCoverLettersSectionProps {
  initialCoverLetters: DashboardCoverLetterItem[];
  initialActiveCoverLetterId: string | null;
  embedded?: boolean;
}

/**
 * Dashboard cover letters — same card chrome / scroller as resumes
 * ({@link DashboardDocumentCard} + {@link CoverLetterThumbnail}).
 */
export function DashboardCoverLettersSection({
  initialCoverLetters,
  initialActiveCoverLetterId,
  embedded = false,
}: DashboardCoverLettersSectionProps) {
  const router = useRouter();
  const [letters, setLetters] = useState(initialCoverLetters);
  const [activeId, setActiveId] = useState(initialActiveCoverLetterId);
  const [creating, setCreating] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadTarget, setDownloadTarget] = useState<DashboardCoverLetterItem | null>(null);
  const [shareTarget, setShareTarget] = useState<DashboardCoverLetterItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DashboardCoverLetterItem | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/cover-letters');
    if (!res.ok) return;
    const data = await res.json();
    setLetters(data.coverLetters ?? []);
    setActiveId(data.activeCoverLetterId ?? null);
  }, []);

  const createLetter = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/cover-letters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        setError("Couldn't create a cover letter. Try again.");
        return;
      }
      const data = await res.json();
      const id = data.coverLetter?.id as string | undefined;
      if (id) {
        router.push(`/cover-letter-builder?id=${id}`);
        return;
      }
      await refresh();
    } catch {
      setError("Couldn't create a cover letter. Check your connection and try again.");
    } finally {
      setCreating(false);
    }
  }, [refresh, router]);

  const openLetter = useCallback(
    async (id: string) => {
      setOpeningId(id);
      setError(null);
      try {
        const res = await fetch(`/api/cover-letters/${id}/activate`, { method: 'POST' });
        if (!res.ok) {
          setError("Couldn't open this cover letter. Try again.");
          return;
        }
        router.push(`/cover-letter-builder?id=${id}`);
      } catch {
        setError("Couldn't open this cover letter. Check your connection and try again.");
      } finally {
        setOpeningId(null);
      }
    },
    [router]
  );

  const deleteLetter = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/cover-letters/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) {
        setError("Couldn't delete this cover letter. Try again.");
        return;
      }
      setLetters((prev) => prev.filter((l) => l.id !== deleteTarget.id));
      if (activeId === deleteTarget.id) setActiveId(null);
      setDeleteTarget(null);
    } catch {
      setError("Couldn't delete this cover letter. Check your connection and try again.");
    } finally {
      setDeleting(false);
    }
  }, [activeId, deleteTarget]);

  const viewHref = (letter: DashboardCoverLetterItem) => {
    if (letter.visibility === 'UNLISTED' && letter.unlistedKey) {
      return getUnlistedCoverLetterPath(letter.unlistedKey);
    }
    // Owner-only preview — particular to cover letters (no username public URL).
    return `/cover-letter-preview/${letter.id}`;
  };

  const isBusy = creating || openingId !== null || deleting;

  return (
    <div className="space-y-4">
      <DashboardDocumentsToolbar
        embedded={embedded}
        title="Cover letters"
        count={letters.length}
        createAction={
          <Button type="button" onClick={createLetter} disabled={creating} className="gap-1.5">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            New cover letter
          </Button>
        }
      />

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {error}
          <button
            type="button"
            className="ml-2 underline hover:no-underline"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {letters.length === 0 ? (
        <DashboardDocumentsEmptyState
          icon={FilePenLine}
          title="No cover letters yet"
          description="Write a letter that matches your resume design. You can refine content and design anytime."
          action={
            <Button type="button" className="gap-1.5" onClick={createLetter} disabled={creating}>
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Create cover letter
            </Button>
          }
        />
      ) : (
        <DashboardDocumentsScroller itemCount={letters.length}>
          {letters.map((letter) => {
            const isOpening = openingId === letter.id;

            return (
              <DashboardDocumentCard
                key={letter.id}
                thumbnail={
                  <DashboardDocumentThumbnailButton
                    label={`Open ${letter.title} in builder`}
                    disabled={isBusy}
                    onOpen={() => void openLetter(letter.id)}
                  >
                    <CoverLetterThumbnail
                      coverLetterId={letter.id}
                      pageLayout={letter.pageLayout}
                    />
                  </DashboardDocumentThumbnailButton>
                }
                title={<DashboardDocumentCardTitle title={letter.title} />}
                menu={
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="-mr-1.5 -mt-1.5 h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Cover letter actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => void openLetter(letter.id)}>
                        <FileText className="mr-2 h-4 w-4" />
                        Open in Builder
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={viewHref(letter)} target="_blank">
                          <ExternalLink className="mr-2 h-4 w-4" />
                          View Cover Letter
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDownloadTarget(letter)}>
                        <Download className="mr-2 h-4 w-4" />
                        Download PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShareTarget(letter)}>
                        <Share2 className="mr-2 h-4 w-4" />
                        Share
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleteTarget(letter)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                }
                meta={
                  <DocumentVisibilityMeta
                    visibility={letter.visibility}
                    updatedAt={letter.updatedAt}
                    descriptions={{
                      UNLISTED: 'Only people with the secure link can view this cover letter',
                      PRIVATE: 'Only you can see this cover letter',
                    }}
                  />
                }
                primaryActions={
                  <>
                    <Button
                      size="sm"
                      className="flex-1 gap-1.5"
                      onClick={() => void openLetter(letter.id)}
                      disabled={isBusy}
                    >
                      {isOpening ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Pencil className="h-3.5 w-3.5" />
                      )}
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 gap-1.5" asChild>
                      <Link href={viewHref(letter)} target="_blank">
                        <ExternalLink className="h-3.5 w-3.5" />
                        View
                      </Link>
                    </Button>
                  </>
                }
              />
            );
          })}
        </DashboardDocumentsScroller>
      )}

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete cover letter</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3">
                <p>
                  You are about to delete &ldquo;
                  <span className="font-semibold text-foreground">{deleteTarget?.title}</span>
                  &rdquo;.
                </p>
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  <p className="font-medium">This cannot be undone.</p>
                  <p className="mt-1 text-destructive/80">
                    Any unlisted share link for this letter will stop working.
                  </p>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={deleting}>
                Cancel
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={() => void deleteLetter()} disabled={deleting}>
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {downloadTarget ? (
        <CoverLetterDownloadDialog
          coverLetterId={downloadTarget.id}
          title={downloadTarget.title}
          pageLayout={downloadTarget.pageLayout}
          visibility={downloadTarget.visibility}
          open
          onOpenChange={(open) => {
            if (!open) setDownloadTarget(null);
          }}
          onShareClick={() => {
            const target = downloadTarget;
            setDownloadTarget(null);
            setShareTarget(target);
          }}
        />
      ) : null}

      {shareTarget ? (
        <ShareDialog
          variant="cover-letter"
          coverLetterId={shareTarget.id}
          coverLetterVisibility={shareTarget.visibility}
          open
          onOpenChange={(open) => {
            if (!open) setShareTarget(null);
          }}
          hideTrigger
          onVisibilityChange={(next) => {
            const visibility: CoverLetterVisibility = next === 'UNLISTED' ? 'UNLISTED' : 'PRIVATE';
            setLetters((prev) =>
              prev.map((letter) =>
                letter.id === shareTarget.id ? { ...letter, visibility } : letter
              )
            );
            setShareTarget((prev) => (prev ? { ...prev, visibility } : prev));
            // Refresh so unlistedKey is available for View when switching to UNLISTED.
            void refresh();
          }}
        />
      ) : null}
    </div>
  );
}
