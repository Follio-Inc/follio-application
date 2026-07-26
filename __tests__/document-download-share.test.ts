import { describe, expect, it } from 'vitest';

import { formatDocumentDownloadFilename } from '@/lib/document-download/filename';
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
