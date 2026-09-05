'use client';

import { useCallback, useRef, useState } from 'react';

import { blobHasPdfMagic } from '@/lib/document-download/pdf-bytes';
import type { PdfLayout } from '@/lib/document-design';

const DEFAULT_LAYOUT: PdfLayout = 'continuous';
const BLOB_URL_REVOKE_MS = 60_000;

/**
 * Build a PDF download URL with layout (+ optional forwarded search params).
 * Resume uses this to forward `token` / `key` for unlisted visitors.
 */
export function buildDocumentPdfUrl(
  pdfPath: string,
  layout: PdfLayout = DEFAULT_LAYOUT,
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
  pdfPath: string;
  filename: string;
  layout?: PdfLayout;
  forwardSearchParams?: boolean;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export interface UseDocumentDownloadReturn {
  download: (layoutOverride?: PdfLayout) => Promise<void>;
  isDownloading: boolean;
}

async function readExportError(response: Response, blob: Blob): Promise<string> {
  const text = await blob.text().catch(() => '');
  try {
    const body = JSON.parse(text) as { error?: string | { message?: string } };
    if (typeof body.error === 'string' && body.error.trim()) return body.error;
    if (body.error && typeof body.error === 'object' && body.error.message) {
      return body.error.message;
    }
  } catch {
    // HTML timeout / 500 page
  }
  if (response.status === 504 || /timeout|FUNCTION_INVOCATION/i.test(text)) {
    return 'PDF generation took too long. Please try again.';
  }
  if (!response.ok) {
    return `Export failed (${response.status}). Please try again.`;
  }
  return 'The server did not return a PDF. Please try again.';
}

/**
 * Wait for the PDF to finish generating, then save the file.
 *
 * Chrome's save dialog on an `<a href="/api/export/...">` starts the download
 * before any bytes exist. If generation is slow or fails, Chrome reports
 * "Site wasn't available". Fetching first avoids that.
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

  const download = useCallback(
    async (layoutOverride?: PdfLayout) => {
      if (lockRef.current) return;
      lockRef.current = true;
      setIsDownloading(true);

      try {
        const search = forwardSearchParams ? window.location.search : '';
        const pdfUrl = buildDocumentPdfUrl(pdfPath, layoutOverride ?? layout, search);
        const response = await fetch(pdfUrl, {
          cache: 'no-store',
          credentials: 'same-origin',
        });
        const blob = await response.blob();

        if (!response.ok || !(await blobHasPdfMagic(blob))) {
          throw new Error(await readExportError(response, blob));
        }

        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = `${filename}.pdf`;
        a.rel = 'noopener';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        window.setTimeout(() => {
          a.remove();
          URL.revokeObjectURL(objectUrl);
        }, BLOB_URL_REVOKE_MS);

        onSuccess?.();
      } catch (err) {
        const error = err instanceof Error ? err : new Error('PDF download failed');
        console.error('PDF download failed:', error);
        onError?.(error);
      } finally {
        lockRef.current = false;
        setIsDownloading(false);
      }
    },
    [pdfPath, filename, layout, forwardSearchParams, onSuccess, onError]
  );

  return { download, isDownloading };
}
