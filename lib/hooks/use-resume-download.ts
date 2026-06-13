'use client';

import { useCallback, useState } from 'react';

import type { PdfLayout } from '@/app/(dashboard)/builder/components/download-dialog';

const DEFAULT_LAYOUT: PdfLayout = 'continuous';

export function buildResumePdfUrl(
  handle: string,
  layout: PdfLayout,
  currentSearch: string
): string {
  const url = new URL(`/api/export/${handle}/pdf`, 'http://localhost');
  url.searchParams.set('layout', layout);

  if (currentSearch) {
    const searchParams = new URLSearchParams(currentSearch);
    for (const [key, value] of searchParams.entries()) {
      if (key === 'layout') continue;
      url.searchParams.set(key, value);
    }
  }

  return `${url.pathname}${url.search}`;
}

interface UseResumeDownloadOptions {
  /** Profile handle used to build the export API URL. */
  handle: string;
  /** Used as the downloaded filename (without extension). */
  resumeTitle: string;
  /** PDF layout mode. Defaults to `'continuous'`. */
  layout?: PdfLayout;
  /** Called after a successful download. */
  onSuccess?: () => void;
  /** Called when the download fails. Receives the error. */
  onError?: (error: Error) => void;
}

interface UseResumeDownloadReturn {
  /** Trigger the PDF download. */
  download: () => Promise<void>;
  /** Whether a download is currently in progress. */
  isDownloading: boolean;
}

/**
 * Shared hook that downloads a resume PDF via the export API.
 *
 * Used by both the builder's `DownloadDialog` and the `/resumes` card menu.
 */
export function useResumeDownload({
  handle,
  resumeTitle,
  layout = DEFAULT_LAYOUT,
  onSuccess,
  onError,
}: UseResumeDownloadOptions): UseResumeDownloadReturn {
  const [isDownloading, setIsDownloading] = useState(false);

  const download = useCallback(async () => {
    setIsDownloading(true);
    try {
      const pdfUrl = buildResumePdfUrl(handle, layout, window.location.search);
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
      a.download = `${resumeTitle}.pdf`;
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
  }, [handle, layout, resumeTitle, onSuccess, onError]);

  return { download, isDownloading };
}
