import { afterEach, describe, expect, it, vi } from 'vitest';

import { printHtmlOnPage, type HtmlPdfPage } from '@/lib/document-pdf/print-html';
import { renderPdfViaWorker } from '@/lib/document-pdf/render-client';

describe('printHtmlOnPage', () => {
  it('uses a custom height for continuous and format for letter', async () => {
    const pdfCalls: unknown[] = [];
    const page = {
      setContent: vi.fn(async () => undefined),
      evaluate: vi.fn(async (fn: () => unknown) => {
        const src = Function.prototype.toString.call(fn);
        if (src.includes('scrollHeight')) return 1200;
        return undefined;
      }),
      pdf: vi.fn(async (options: unknown) => {
        pdfCalls.push(options);
        return Buffer.from('%PDF-mock');
      }),
    };

    await printHtmlOnPage(
      page as unknown as HtmlPdfPage,
      '<html><head></head><body></body></html>',
      'continuous'
    );
    expect(pdfCalls[0]).toMatchObject({
      width: '816px',
      height: '1220px',
      printBackground: true,
    });

    await printHtmlOnPage(
      page as unknown as HtmlPdfPage,
      '<html><head></head><body></body></html>',
      'letter'
    );
    expect(pdfCalls[1]).toMatchObject({
      format: 'Letter',
      printBackground: true,
    });
  });
});

describe('renderPdfViaWorker', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns PDF bytes from the worker', async () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => pdf.buffer,
      }))
    );

    const result = await renderPdfViaWorker('<html></html>', 'letter', {
      PDF_WORKER_URL: 'https://pdf.example',
      PDF_WORKER_SECRET: 'secret',
    });

    expect(hasPdfPrefix(result)).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'https://pdf.example/render',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer secret',
        }),
      })
    );
  });

  it('rejects HTML error bodies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        arrayBuffer: async () => new TextEncoder().encode('boom').buffer,
      }))
    );

    await expect(
      renderPdfViaWorker('<html></html>', 'letter', {
        PDF_WORKER_URL: 'https://pdf.example',
        PDF_WORKER_SECRET: 'secret',
      })
    ).rejects.toThrow(/boom|PDF worker/);
  });
});

function hasPdfPrefix(bytes: Uint8Array): boolean {
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}
