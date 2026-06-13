import { buildResumePdfUrl } from '@/lib/hooks/use-resume-download';
import { describe, expect, it } from 'vitest';

describe('buildResumePdfUrl', () => {
  it('builds URL with layout and preserves share token', () => {
    const url = buildResumePdfUrl('jdoe', 'continuous', '?token=abc123&layout=paged');
    expect(url).toBe('/api/export/jdoe/pdf?layout=continuous&token=abc123');
  });

  it('preserves key and drops duplicate layout param', () => {
    const url = buildResumePdfUrl('jdoe', 'paged', '?layout=continuous&key=secret');
    expect(url).toBe('/api/export/jdoe/pdf?layout=paged&key=secret');
  });

  it('builds URL without existing search params', () => {
    const url = buildResumePdfUrl('jdoe', 'paged', '');
    expect(url).toBe('/api/export/jdoe/pdf?layout=paged');
  });
});
