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
  const [downloadTarget, setDownloadTarget] = useState<DashboardCoverLetterItem | null>(null);
  const [shareTarget, setShareTarget] = useState<DashboardCoverLetterItem | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/cover-letters');
    if (!res.ok) return;
    const data = await res.json();
    setLetters(data.coverLetters ?? []);
    setActiveId(data.activeCoverLetterId ?? null);
  }, []);

  const createLetter = useCallback(async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/cover-letters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) return;
      const data = await res.json();
      const id = data.coverLetter?.id as string | undefined;
      if (id) {
        router.push(`/cover-letter-builder?id=${id}`);
        return;
      }
      await refresh();
    } finally {
      setCreating(false);
    }
  }, [refresh, router]);

  const openLetter = useCallback(
    async (id: string) => {
      setOpeningId(id);
      try {
        await fetch(`/api/cover-letters/${id}/activate`, { method: 'POST' });
        router.push(`/cover-letter-builder?id=${id}`);
      } finally {
        setOpeningId(null);
      }
    },
    [router]
  );

  const deleteLetter = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/cover-letters/${id}`, { method: 'DELETE' });
      if (!res.ok) return;
      setLetters((prev) => prev.filter((l) => l.id !== id));
      if (activeId === id) setActiveId(null);
    },
    [activeId]
  );

  const viewHref = (letter: DashboardCoverLetterItem) => {
    if (letter.visibility === 'UNLISTED' && letter.unlistedKey) {
      return getUnlistedCoverLetterPath(letter.unlistedKey);
    }
    // Owner-only preview — particular to cover letters (no username public URL).
    return `/cover-letter-preview/${letter.id}`;
  };

  const isBusy = creating || openingId !== null;

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
                        onClick={() => void deleteLetter(letter.id)}
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
