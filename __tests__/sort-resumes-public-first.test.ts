import { describe, expect, it } from 'vitest';

import { sortResumesWithPublicFirst } from '@/app/(dashboard)/resumes/new-resume-options';

describe('sortResumesWithPublicFirst', () => {
  const items = [
    { id: 'a', updatedAt: '2026-01-03T00:00:00.000Z', resumeVisibility: 'PRIVATE' },
    { id: 'b', updatedAt: '2026-01-02T00:00:00.000Z', resumeVisibility: 'PUBLIC' },
    { id: 'c', updatedAt: '2026-01-01T00:00:00.000Z', resumeVisibility: 'UNLISTED' },
  ];

  it('puts the public resume first', () => {
    expect(sortResumesWithPublicFirst(items).map((r) => r.id)).toEqual(['b', 'a', 'c']);
  });

  it('falls back to updatedAt when nothing is public', () => {
    const privateOnly = items.map((item) => ({ ...item, resumeVisibility: 'PRIVATE' }));
    expect(sortResumesWithPublicFirst(privateOnly).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});
