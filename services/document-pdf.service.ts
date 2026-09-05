/**
 * HTML → PDF for paper documents.
 *
 * Prefers a warm Chromium worker when PDF_WORKER_URL is set.
 * Otherwise prints on this machine: Puppeteer locally, bundled Chromium on Vercel.
 */

import type { PdfLayout } from '@/lib/document-design';
import {
  readCachedDocumentPdf,
  writeCachedDocumentPdf,
  type DocumentPdfCacheKey,
} from '@/lib/document-pdf/cache';
import { isPdfWorkerConfigured, renderPdfViaWorker } from '@/lib/document-pdf/render-client';
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

export async function renderHtmlToPdf(html: string, layout: PdfLayout): Promise<Buffer> {
  if (isPdfWorkerConfigured()) {
    return renderPdfViaWorker(html, layout);
  }

  if (isServerlessRuntime()) {
    const { renderPdfViaServerlessChromium } = await import('@/services/document-pdf.serverless');
    return renderPdfViaServerlessChromium(html, layout);
  }

  const { renderPdfViaLocalChromium } = await import('@/services/document-pdf.local');
  return renderPdfViaLocalChromium(html, layout);
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
