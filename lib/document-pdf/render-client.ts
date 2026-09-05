import type { PdfLayout } from '@/lib/document-design';
import { hasPdfMagic } from '@/lib/document-download/pdf-bytes';
import { Errors } from '@/lib/errors';

const RENDER_TIMEOUT_MS = 25_000;

export function isPdfWorkerConfigured(
  env: Record<string, string | undefined> = process.env
): boolean {
  return Boolean(env.PDF_WORKER_URL?.trim() && env.PDF_WORKER_SECRET?.trim());
}

export function workerRenderUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/render`;
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
    throw Errors.externalService(
      'PDF renderer',
      detail || `PDF worker returned ${response.status}`
    );
  }

  return bytes;
}
