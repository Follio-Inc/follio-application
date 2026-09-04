'use client';

import { useCallback, useRef, useState } from 'react';

import type { PdfLayout } from '@/lib/document-design';

const DEFAULT_LAYOUT: PdfLayout = 'continuous';

/** Debounce double-clicks while Chromium is still generating the PDF. */
const DOWNLOAD_LOCK_MS = 8_000;

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

/**
 * Start a same-origin file download in the current user-gesture.
 *
 * Must run synchronously in the click handler. `fetch()` + a later `a.click()`
 * is ignored by Safari/Chrome once PDF generation has consumed the activation.
 */
export function triggerClientFileDownload(href: string, filename: string): void {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
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
  download: (layoutOverride?: PdfLayout) => Promise<void>;
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
  const lockRef = useRef(false);
  const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const download = useCallback(
    async (layoutOverride?: PdfLayout) => {
      if (lockRef.current) return;
      lockRef.current = true;
      setIsDownloading(true);

      try {
        const search = forwardSearchParams ? window.location.search : '';
        const pdfUrl = buildDocumentPdfUrl(pdfPath, layoutOverride ?? layout, search);
        triggerClientFileDownload(pdfUrl, `${filename}.pdf`);
        onSuccess?.();
      } catch (err) {
        const error = err instanceof Error ? err : new Error('PDF download failed');
        console.error('PDF download failed:', error);
        onError?.(error);
        lockRef.current = false;
        setIsDownloading(false);
        return;
      }

      if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
      unlockTimerRef.current = setTimeout(() => {
        lockRef.current = false;
        setIsDownloading(false);
        unlockTimerRef.current = null;
      }, DOWNLOAD_LOCK_MS);
    },
    [pdfPath, filename, layout, forwardSearchParams, onSuccess, onError]
  );

  return { download, isDownloading };
}
