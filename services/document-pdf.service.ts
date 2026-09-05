/**
 * HTML → PDF for paper documents.
 *
 * Production: warm Chromium worker (PDF_WORKER_URL) + Postgres cache.
 * Local: Puppeteer on this machine when the worker URL is unset.
 */

import type { PdfLayout } from '@/lib/document-design';
import {
  readCachedDocumentPdf,
  writeCachedDocumentPdf,
  type DocumentPdfCacheKey,
} from '@/lib/document-pdf/cache';
import { isPdfWorkerConfigured, renderPdfViaWorker } from '@/lib/document-pdf/render-client';
import { Errors } from '@/lib/errors';
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
    throw Errors.externalService(
      'PDF renderer',
      'PDF generation is not configured. Set PDF_WORKER_URL and PDF_WORKER_SECRET to the warm Chromium worker.'
    );
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
