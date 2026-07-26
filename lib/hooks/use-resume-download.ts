'use client';

import type { PdfLayout } from '@/types';
import { buildDocumentPdfUrl } from '@/lib/hooks/use-document-download';

/** @deprecated Prefer buildDocumentPdfUrl — resume-specific path helper. */
export function buildResumePdfUrl(
  handle: string,
  layout: PdfLayout,
  currentSearch: string
): string {
  return buildDocumentPdfUrl(`/api/export/${handle}/pdf`, layout, currentSearch);
}
