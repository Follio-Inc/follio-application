import { describe, expect, it } from 'vitest';

import { formatDocumentDownloadFilename } from '@/lib/document-download/filename';
import { hasPdfMagic } from '@/lib/document-download/pdf-bytes';
import { applyPaperWidthOverride } from '@/lib/document-pdf/print-html';
import { isPdfWorkerConfigured, workerRenderUrl } from '@/lib/document-pdf/render-client';
import { hashDocumentPdfSource } from '@/lib/document-pdf/source-hash';
import { buildDocumentPdfUrl } from '@/lib/hooks/use-document-download';
import { buildResumePdfUrl } from '@/lib/hooks/use-resume-download';

describe('buildDocumentPdfUrl', () => {
  it('sets layout and preserves other search params', () => {
    const url = buildDocumentPdfUrl(
      '/api/export/jdoe/pdf',
      'continuous',
      '?token=abc123&layout=letter'
    );
    expect(url).toBe('/api/export/jdoe/pdf?layout=continuous&token=abc123');
  });

  it('works for cover letter paths without search forwarding', () => {
    const url = buildDocumentPdfUrl('/api/cover-letters/cl_1/pdf', 'a4', '');
    expect(url).toBe('/api/cover-letters/cl_1/pdf?layout=a4');
  });
});

describe('buildResumePdfUrl', () => {
  it('delegates to the shared document URL builder', () => {
    const url = buildResumePdfUrl('jdoe', 'letter', '');
    expect(url).toBe('/api/export/jdoe/pdf?layout=letter');
  });
});

describe('formatDocumentDownloadFilename', () => {
  it('sanitizes titles and uses fallbacks', () => {
    expect(formatDocumentDownloadFilename('My Cover Letter!', 'Cover_Letter')).toBe(
      'My_Cover_Letter'
    );
    expect(formatDocumentDownloadFilename('  ', 'Cover_Letter')).toBe('Cover_Letter');
  });
});

describe('PDF worker client', () => {
  it('builds the render URL', () => {
    expect(workerRenderUrl('https://follio-pdf.fly.dev/')).toBe(
      'https://follio-pdf.fly.dev/render'
    );
  });

  it('requires both worker URL and secret', () => {
    expect(isPdfWorkerConfigured({ PDF_WORKER_URL: 'https://pdf.example' })).toBe(false);
    expect(
      isPdfWorkerConfigured({
        PDF_WORKER_URL: 'https://pdf.example',
        PDF_WORKER_SECRET: 'secret',
      })
    ).toBe(true);
  });
});

describe('hashDocumentPdfSource', () => {
  it('changes when layout or HTML changes', () => {
    const html = '<html><body>Resume</body></html>';
    const a = hashDocumentPdfSource(html, 'letter');
    const b = hashDocumentPdfSource(html, 'a4');
    const c = hashDocumentPdfSource(`${html} `, 'letter');
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(a).toBe(hashDocumentPdfSource(html, 'letter'));
  });
});

describe('applyPaperWidthOverride', () => {
  it('injects A4 width before </head>', () => {
    const html = '<html><head></head><body></body></html>';
    expect(applyPaperWidthOverride(html, 'a4')).toContain('max-width:794px');
    expect(applyPaperWidthOverride(html, 'letter')).toBe(html);
  });
});

describe('hasPdfMagic', () => {
  it('accepts a PDF header', () => {
    expect(hasPdfMagic(new TextEncoder().encode('%PDF-1.4\n'))).toBe(true);
  });

  it('rejects HTML error pages', () => {
    expect(hasPdfMagic(new TextEncoder().encode('<!DOCTYPE html><html>'))).toBe(false);
  });
});
