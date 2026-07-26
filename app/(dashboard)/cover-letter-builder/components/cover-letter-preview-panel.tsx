'use client';

import { Check, Copy, Download, Share2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import { CoverLetterDownloadDialog } from '@/components/cover-letter/cover-letter-download-dialog';
import { CleanCoverLetterView } from '@/components/cover-letter/clean-cover-letter-view';
import { FloatingActionCluster, FloatingIconButton } from '@/components/floating-icon-button';
import { ShareDialog } from '@/components/share-dialog';
import { resolveDocumentPageLayout } from '@/lib/document-design';
import { useCopyElementText } from '@/lib/hooks';
import { cn } from '@/lib/utils';

import { useCoverLetterStore } from '../cover-letter-store';

/**
 * Live cover letter preview — floating action cluster matches resume placement
 * (bottom-center of the preview panel).
 */
export function CoverLetterPreviewPanel() {
  const content = useCoverLetterStore((s) => s.draft.content);
  const design = useCoverLetterStore((s) => s.draft.design);
  const title = useCoverLetterStore((s) => s.draft.title);
  const id = useCoverLetterStore((s) => s.draft.id);
  const visibility = useCoverLetterStore((s) => s.draft.visibility);
  const updateVisibility = useCoverLetterStore((s) => s.updateVisibility);
  const paperRef = useRef<HTMLDivElement>(null);
  const { copied, copy } = useCopyElementText(paperRef);

  const [downloadOpen, setDownloadOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const pageLayout = useMemo(() => resolveDocumentPageLayout(design), [design]);

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="border-b border-border/60 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight">Preview</h2>
      </div>

      <div
        className={cn(
          'relative flex flex-1 justify-center overflow-auto p-4 sm:p-6',
          'bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-muted/40 via-muted/20 to-transparent'
        )}
      >
        <div ref={paperRef} className="origin-top scale-[0.85] sm:scale-90 xl:scale-100">
          <CleanCoverLetterView content={content} design={design} />
        </div>
      </div>

      {/* Floating action cluster — same anchor as resume preview (bottom-center). */}
      <div className="pointer-events-none absolute bottom-6 left-1/2 z-30 -translate-x-1/2">
        <FloatingActionCluster>
          <FloatingIconButton label={copied ? 'Copied!' : 'Copy text'} onClick={copy}>
            {copied ? (
              <Check className="h-[18px] w-[18px] text-green-600" />
            ) : (
              <Copy className="h-[18px] w-[18px]" />
            )}
          </FloatingIconButton>

          <FloatingIconButton label="Download as PDF" onClick={() => setDownloadOpen(true)}>
            <Download className="h-[18px] w-[18px]" />
          </FloatingIconButton>

          <FloatingIconButton label="Share cover letter" onClick={() => setShareOpen(true)}>
            <Share2 className="h-[18px] w-[18px]" />
          </FloatingIconButton>
        </FloatingActionCluster>
      </div>

      <CoverLetterDownloadDialog
        coverLetterId={id}
        title={title}
        pageLayout={pageLayout}
        visibility={visibility}
        open={downloadOpen}
        onOpenChange={setDownloadOpen}
        onShareClick={() => {
          setDownloadOpen(false);
          setShareOpen(true);
        }}
      />
      <ShareDialog
        variant="cover-letter"
        coverLetterId={id}
        coverLetterVisibility={visibility}
        firstName={content.signatureName?.split(/\s+/)[0] ?? null}
        open={shareOpen}
        onOpenChange={setShareOpen}
        hideTrigger
        onVisibilityChange={(next) => {
          updateVisibility(next === 'UNLISTED' ? 'UNLISTED' : 'PRIVATE');
        }}
      />
    </div>
  );
}
