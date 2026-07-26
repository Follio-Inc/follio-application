'use client';

import { useCallback, useState } from 'react';

import type { PdfLayout } from '@/lib/document-design';

const DEFAULT_LAYOUT: PdfLayout = 'continuous';

/**
 * Build a PDF download URL with layout (+ optional forwarded search params).
 * Resume uses this to forward `token` / `key` for unlisted visitors.
 */
export function buildDocumentPdfUrl(
  pdfPath: string,
  layout: PdfLayout,
  currentSearch = ''
): string {
  const url = new URL(pdfPath, 'http://localhost');
  url.searchParams.set('layout', layout);

  if (currentSearch) {
    const searchParams = new URLSearchParams(
      currentSearch.startsWith('?') ? currentSearch.slice(1) : currentSearch
    );
    for (const [key, value] of searchParams.entries()) {
      if (key === 'layout') continue;
      url.searchParams.set(key, value);
    }
  }

  return `${url.pathname}${url.search}`;
}

export interface UseDocumentDownloadOptions {
  /** Absolute path to the PDF API, e.g. `/api/export/jdoe/pdf` or `/api/cover-letters/abc/pdf`. */
  pdfPath: string;
  /** Download filename without `.pdf`. */
  filename: string;
  layout?: PdfLayout;
  /** Forward current URL search (token/key) — resumes only. Default false. */
  forwardSearchParams?: boolean;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export interface UseDocumentDownloadReturn {
  download: () => Promise<void>;
  isDownloading: boolean;
}

/**
 * Shared document PDF download — resume and cover letter compose this.
 */
export function useDocumentDownload({
  pdfPath,
  filename,
  layout = DEFAULT_LAYOUT,
  forwardSearchParams = false,
  onSuccess,
  onError,
}: UseDocumentDownloadOptions): UseDocumentDownloadReturn {
  const [isDownloading, setIsDownloading] = useState(false);

  const download = useCallback(async () => {
    setIsDownloading(true);
    try {
      const search = forwardSearchParams ? window.location.search : '';
      const pdfUrl = buildDocumentPdfUrl(pdfPath, layout, search);
      const response = await fetch(pdfUrl);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const detail = (body as { error?: string })?.error ?? response.statusText;
        throw new Error(`Export failed: ${detail}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onSuccess?.();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('PDF download failed');
      console.error('PDF download failed:', error);
      onError?.(error);
    } finally {
      setIsDownloading(false);
    }
  }, [pdfPath, filename, layout, forwardSearchParams, onSuccess, onError]);

  return { download, isDownloading };
}
