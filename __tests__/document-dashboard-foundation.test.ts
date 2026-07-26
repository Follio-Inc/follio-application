import { describe, expect, it } from 'vitest';

import { formatRelativeDocumentDate } from '@/components/document-dashboard';

describe('formatRelativeDocumentDate', () => {
  const now = new Date('2026-07-25T12:00:00.000Z');

  it('formats recent and older timestamps consistently for resume and cover letter cards', () => {
    expect(formatRelativeDocumentDate('2026-07-25T11:59:30.000Z', now)).toBe('Just now');
    expect(formatRelativeDocumentDate('2026-07-25T11:45:00.000Z', now)).toBe('15m ago');
    expect(formatRelativeDocumentDate('2026-07-25T09:00:00.000Z', now)).toBe('3h ago');
    expect(formatRelativeDocumentDate('2026-07-23T12:00:00.000Z', now)).toBe('2d ago');
    expect(formatRelativeDocumentDate('2026-07-04T12:00:00.000Z', now)).toBe('3w ago');
    expect(formatRelativeDocumentDate('2026-06-01T12:00:00.000Z', now)).toBe('Jun 1');
    expect(formatRelativeDocumentDate('2025-06-01T12:00:00.000Z', now)).toBe('Jun 1, 2025');
  });
});
