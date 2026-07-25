import { describe, expect, it } from 'vitest';

import { buildResumePdfUrl } from '@/lib/hooks/use-resume-download';

describe('buildResumePdfUrl', () => {
  it('sets layout and preserves other search params', () => {
    const url = buildResumePdfUrl('jdoe', 'continuous', '?token=abc123&layout=letter');
    expect(url).toBe('/api/export/jdoe/pdf?layout=continuous&token=abc123');
  });

  it('overrides an existing layout param', () => {
    const url = buildResumePdfUrl('jdoe', 'a4', '?layout=continuous&key=secret');
    expect(url).toBe('/api/export/jdoe/pdf?layout=a4&key=secret');
  });

  it('works with an empty search string', () => {
    const url = buildResumePdfUrl('jdoe', 'letter', '');
    expect(url).toBe('/api/export/jdoe/pdf?layout=letter');
  });
});
