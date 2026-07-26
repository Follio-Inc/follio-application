'use client';

import { DocumentDownloadDialog } from '@/components/document-download/document-download-dialog';
import type { CoverLetterVisibility } from '@/lib/cover-letter';
import { formatDocumentDownloadFilename } from '@/lib/document-download/filename';
import type { DocumentPageLayout } from '@/lib/document-design';

interface CoverLetterDownloadDialogProps {
  coverLetterId: string;
  title: string;
  pageLayout?: DocumentPageLayout;
  visibility?: CoverLetterVisibility;
  onShareClick?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Cover letter download — shared document download dialog + letter copy.
 */
export function CoverLetterDownloadDialog({
  coverLetterId,
  title,
  pageLayout = 'continuous',
  visibility = 'PRIVATE',
  onShareClick,
  open,
  onOpenChange,
}: CoverLetterDownloadDialogProps) {
  const pagedOnly = pageLayout === 'a4' || pageLayout === 'letter';

  return (
    <DocumentDownloadDialog
      pdfPath={`/api/cover-letters/${coverLetterId}/pdf`}
      filename={formatDocumentDownloadFilename(title, 'Cover_Letter')}
      pageLayout={pageLayout}
      description={
        pagedOnly
          ? 'Your cover letter uses print pages — choose A4 or Letter.'
          : 'Choose a layout for your cover letter.'
      }
      shareBannerText={
        onShareClick
          ? visibility === 'UNLISTED'
            ? 'Unlisted — share the secure link, or download a PDF.'
            : 'Private by default — make Unlisted for a secure link, or share a PDF.'
          : undefined
      }
      onShareClick={onShareClick}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}
