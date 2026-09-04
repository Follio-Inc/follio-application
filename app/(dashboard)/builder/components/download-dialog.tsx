'use client';

import { DocumentDownloadDialog } from '@/components/document-download/document-download-dialog';
import { formatDocumentDownloadFilename } from '@/lib/document-download/filename';
import type { DocumentPageLayout, PdfLayout } from '@/lib/document-design';

/** Re-export for callers that imported PdfLayout from this module. */
export type { PdfLayout };

interface DownloadDialogProps {
  handle: string;
  /** Resume's current title — used as the download filename. */
  resumeTitle: string;
  /**
   * Live resume page layout. Continuous → all three download options;
   * A4/Letter → A4 and Letter only.
   */
  resumePageLayout?: DocumentPageLayout;
  /** Called when the user clicks the share button in the banner. */
  onShareClick?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Resume download dialog — shared document download foundation + resume copy.
 */
export function DownloadDialog({
  handle,
  resumeTitle,
  resumePageLayout = 'continuous',
  onShareClick,
  open,
  onOpenChange,
}: DownloadDialogProps) {
  const pagedOnly = resumePageLayout === 'a4' || resumePageLayout === 'letter';

  return (
    <DocumentDownloadDialog
      pdfPath={`/api/export/${handle}/pdf`}
      filename={formatDocumentDownloadFilename(resumeTitle, 'Resume')}
      pageLayout={resumePageLayout}
      forwardSearchParams
      description={
        pagedOnly
          ? 'Your resume uses print pages — choose A4 or Letter, then download.'
          : 'Choose a layout, then download your resume.'
      }
      shareBannerText={
        onShareClick
          ? 'Follio resumes are true digital resumes — share a link with anyone for a live, interactive view.'
          : undefined
      }
      onShareClick={onShareClick}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}
