import type { PdfLayout } from '@/lib/document-design';
import { hasPdfMagic } from '@/lib/document-download/pdf-bytes';
import { Errors } from '@/lib/errors';

const RENDER_TIMEOUT_MS = 25_000;
const WORKER_ATTEMPTS = 2;

export function isPdfWorkerConfigured(
  env: Record<string, string | undefined> = process.env
): boolean {
  return Boolean(env.PDF_WORKER_URL?.trim() && env.PDF_WORKER_SECRET?.trim());
}

export function workerRenderUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/render`;
}

function shouldRetryWorkerStatus(status: number): boolean {
  return status >= 500 || status === 429;
}

async function renderPdfViaWorkerOnce(
  html: string,
  layout: PdfLayout,
  baseUrl: string,
  secret: string
): Promise<Buffer> {
  let response: Response;
  try {
    response = await fetch(workerRenderUrl(baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ html, layout }),
      signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF worker unreachable';
    throw Errors.externalService('PDF renderer', `PDF worker request failed: ${message}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok || !hasPdfMagic(bytes)) {
    const detail = bytes.toString('utf8').slice(0, 200).trim();
    const err = Errors.externalService(
      'PDF renderer',
      detail || `PDF worker returned ${response.status}`
    );
    (err as Error & { retryable?: boolean }).retryable = shouldRetryWorkerStatus(response.status);
    throw err;
  }

  return bytes;
}

export async function renderPdfViaWorker(
  html: string,
  layout: PdfLayout,
  env: Record<string, string | undefined> = process.env
): Promise<Buffer> {
  const baseUrl = env.PDF_WORKER_URL?.trim();
  const secret = env.PDF_WORKER_SECRET?.trim();
  if (!baseUrl || !secret) {
    throw Errors.externalService(
      'PDF renderer',
      'PDF generation is not configured. Set PDF_WORKER_URL and PDF_WORKER_SECRET.'
    );
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= WORKER_ATTEMPTS; attempt += 1) {
    try {
      return await renderPdfViaWorkerOnce(html, layout, baseUrl, secret);
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof Error && 'retryable' in error
          ? Boolean((error as { retryable?: boolean }).retryable)
          : true;
      if (!retryable || attempt === WORKER_ATTEMPTS) break;
    }
  }

  throw lastError;
}
