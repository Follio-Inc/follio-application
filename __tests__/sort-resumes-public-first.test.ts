import { describe, expect, it } from 'vitest';

import {
  sortResumesWithPortfolioFirst,
  sortResumesWithPublicFirst,
} from '@/app/(dashboard)/resumes/new-resume-options';

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

describe('sortResumesWithPortfolioFirst', () => {
  const items = [
    { id: 'a', updatedAt: '2026-01-03T00:00:00.000Z' },
    { id: 'b', updatedAt: '2026-01-02T00:00:00.000Z' },
    { id: 'c', updatedAt: '2026-01-01T00:00:00.000Z' },
  ];

  it('puts the attached (primary) resume first', () => {
    expect(sortResumesWithPortfolioFirst(items, 'c').map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });

  it('keeps the attached resume first even when others are newer', () => {
    const newerRest = [
      { id: 'a', updatedAt: '2026-06-01T00:00:00.000Z' },
      { id: 'attached', updatedAt: '2025-01-01T00:00:00.000Z' },
      { id: 'b', updatedAt: '2026-05-01T00:00:00.000Z' },
    ];
    expect(sortResumesWithPortfolioFirst(newerRest, 'attached').map((r) => r.id)).toEqual([
      'attached',
      'a',
      'b',
    ]);
  });
});
