/**
 * HTML → PDF for paper documents.
 *
 * Primary: warm Chromium worker (PDF_WORKER_URL).
 * Fallback: bundled Chromium on Vercel, or local Puppeteer in `next dev`.
 * Cache stores a successful PDF so repeat downloads skip Chrome entirely.
 */

import type { PdfLayout } from '@/lib/document-design';
import {
  readCachedDocumentPdf,
  writeCachedDocumentPdf,
  type DocumentPdfCacheKey,
} from '@/lib/document-pdf/cache';
import { isPdfWorkerConfigured, renderPdfViaWorker } from '@/lib/document-pdf/render-client';
import { toPdfRenderAppError } from '@/lib/document-pdf/render-errors';
import { logger } from '@/lib/logger';

const serviceLogger = logger.child({ source: 'document-pdf' });

export interface DocumentPdfOptions {
  /** @default 'letter' */
  layout?: PdfLayout;
  /** When set, reuse a stored PDF until the HTML for this layout changes. */
  cache?: DocumentPdfCacheKey;
}

function isServerlessRuntime(): boolean {
  return Boolean(process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

async function renderOnThisMachine(html: string, layout: PdfLayout): Promise<Buffer> {
  if (isServerlessRuntime()) {
    const { renderPdfViaServerlessChromium } = await import('@/services/document-pdf.serverless');
    return renderPdfViaServerlessChromium(html, layout);
  }

  const { renderPdfViaLocalChromium } = await import('@/services/document-pdf.local');
  return renderPdfViaLocalChromium(html, layout);
}

export async function renderHtmlToPdf(html: string, layout: PdfLayout): Promise<Buffer> {
  if (isPdfWorkerConfigured()) {
    try {
      return await renderPdfViaWorker(html, layout);
    } catch (error) {
      serviceLogger.warn('PDF worker failed; falling back to local Chromium', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  try {
    return await renderOnThisMachine(html, layout);
  } catch (error) {
    serviceLogger.error('PDF render failed', error);
    throw toPdfRenderAppError(error);
  }
}

export async function generateDocumentPDF(
  html: string,
  { layout = 'letter', cache }: DocumentPdfOptions = {}
): Promise<Buffer> {
  if (cache) {
    const cached = await readCachedDocumentPdf(cache, html);
    if (cached) {
      serviceLogger.info('PDF cache hit', { ...cache });
      return cached;
    }
  }

  const pdf = await renderHtmlToPdf(html, layout);

  if (cache) {
    await writeCachedDocumentPdf(cache, html, pdf);
  }

  return pdf;
}
