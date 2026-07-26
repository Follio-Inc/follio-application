'use client';

import type { PdfLayout } from '@/types';
import { formatDocumentDownloadFilename } from '@/lib/document-download/filename';
import {
  buildDocumentPdfUrl,
  useDocumentDownload,
  type UseDocumentDownloadReturn,
} from '@/lib/hooks/use-document-download';

const DEFAULT_LAYOUT: PdfLayout = 'continuous';

/** @deprecated Prefer buildDocumentPdfUrl — resume-specific wrapper. */
export function buildResumePdfUrl(
  handle: string,
  layout: PdfLayout,
  currentSearch: string
): string {
  return buildDocumentPdfUrl(`/api/export/${handle}/pdf`, layout, currentSearch);
}

interface UseResumeDownloadOptions {
  handle: string;
  resumeTitle: string;
  layout?: PdfLayout;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Resume PDF download — thin wrapper over the shared document download hook.
 */
export function useResumeDownload({
  handle,
  resumeTitle,
  layout = DEFAULT_LAYOUT,
  onSuccess,
  onError,
}: UseResumeDownloadOptions): UseDocumentDownloadReturn {
  return useDocumentDownload({
    pdfPath: `/api/export/${handle}/pdf`,
    filename: formatDocumentDownloadFilename(resumeTitle, 'Resume'),
    layout,
    forwardSearchParams: true,
    onSuccess,
    onError,
  });
}
