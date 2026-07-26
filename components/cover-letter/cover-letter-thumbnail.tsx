'use client';

import { FilePenLine } from 'lucide-react';

import { DocumentThumbnail } from '@/components/document-preview/document-thumbnail';
import { getDocumentPageSize, type DocumentPageLayout } from '@/lib/document-design';

interface CoverLetterThumbnailProps {
  coverLetterId: string;
  /** Live page layout — drives thumbnail aspect ratio. */
  pageLayout?: DocumentPageLayout;
  className?: string;
  maxHeight?: number;
}

/**
 * Cover letter thumbnail — same DocumentThumbnail foundation as resumes.
 * No thumbnail badges (visibility lives in the shared meta row, like unlisted resumes).
 */
export function CoverLetterThumbnail({
  coverLetterId,
  pageLayout = 'continuous',
  className,
  maxHeight,
}: CoverLetterThumbnailProps) {
  const pageSize = getDocumentPageSize(pageLayout);

  return (
    <DocumentThumbnail
      previewSrc={`/cover-letter-preview/${coverLetterId}`}
      title="Cover letter preview"
      contentWidth={pageSize.widthPx}
      contentHeight={pageSize.heightPx}
      className={className}
      maxHeight={maxHeight}
      fallbackIcon={FilePenLine}
    />
  );
}
