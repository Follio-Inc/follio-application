import { describe, expect, it } from 'vitest';

import {
  checkResumesToDelete,
  CloneResumeSchema,
  CreateResumeSchema,
  DeleteResumesSchema,
  matchOwnedResume,
  type ResumeCatalogItem,
} from '@/lib/ai-connector/resume-target';

function resume(overrides: Partial<ResumeCatalogItem>): ResumeCatalogItem {
  return {
    resumeId: 'p1',
    title: 'Product PM',
    handle: 'alex-pm',
    headline: 'PM',
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
    updatedAt: '2026-11-01T00:00:00.000Z',
    isActive: false,
    ...overrides,
  };
}

describe('matchOwnedResume', () => {
  const catalog = [
    resume({ resumeId: 'p1', title: 'Product PM', handle: 'alex-pm', isActive: true }),
    resume({ resumeId: 'p2', title: 'Stripe PM', handle: 'alex-stripe' }),
    resume({ resumeId: 'p3', title: 'Backend', handle: 'alex-be' }),
  ];

  it('matches by id first', () => {
    const match = matchOwnedResume(catalog, 'p2');
    expect(match.ok).toBe(true);
    if (match.ok) expect(match.resume.title).toBe('Stripe PM');
  });

  it('matches by handle', () => {
    const match = matchOwnedResume(catalog, 'alex-be');
    expect(match.ok).toBe(true);
    if (match.ok) expect(match.resume.resumeId).toBe('p3');
  });

  it('matches a unique title, ignoring case', () => {
    const match = matchOwnedResume(catalog, 'stripe pm');
    expect(match.ok).toBe(true);
    if (match.ok) expect(match.resume.resumeId).toBe('p2');
  });

  it('does not fall back to the active resume', () => {
    const match = matchOwnedResume(catalog, 'missing');
    expect(match.ok).toBe(false);
    if (!match.ok) expect(match.message).toContain('list_resumes');
  });

  it('asks which one when two titles collide', () => {
    const duplicates = [
      ...catalog,
      resume({ resumeId: 'p4', title: 'Product PM', handle: 'alex-pm-2' }),
    ];
    const match = matchOwnedResume(duplicates, 'Product PM');
    expect(match.ok).toBe(false);
    if (!match.ok) {
      expect(match.message).toContain('p1');
      expect(match.message).toContain('p4');
    }
  });

  it('refuses an empty ref', () => {
    const match = matchOwnedResume(catalog, '  ');
    expect(match.ok).toBe(false);
  });
});

describe('create and clone schemas', () => {
  it('allows creating a resume with only a title', () => {
    expect(CreateResumeSchema.safeParse({ title: 'Stripe PM' }).success).toBe(true);
    expect(CreateResumeSchema.safeParse({}).success).toBe(true);
  });

  it('requires a source resume to clone', () => {
    expect(CloneResumeSchema.safeParse({ title: 'Copy' }).success).toBe(false);
    expect(CloneResumeSchema.safeParse({ resumeId: 'p1', title: 'Copy' }).success).toBe(true);
  });
});

describe('delete safety check', () => {
  const catalog = [
    resume({ resumeId: 'p1', title: 'Product PM', handle: 'alex-pm' }),
    resume({ resumeId: 'p2', title: 'Stripe PM', handle: 'alex-stripe' }),
  ];

  it('passes when every id and exact title match', () => {
    const check = checkResumesToDelete(catalog, [
      { resumeId: 'p1', confirmTitle: 'Product PM' },
      { resumeId: 'p2', confirmTitle: ' Stripe PM ' },
    ]);
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.resumes.map((r) => r.resumeId)).toEqual(['p1', 'p2']);
  });

  it('deletes nothing when one title is wrong, and does not reveal the real title', () => {
    const check = checkResumesToDelete(catalog, [
      { resumeId: 'p1', confirmTitle: 'Product PM' },
      { resumeId: 'p2', confirmTitle: 'Product PM' },
    ]);
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.message).toContain('Nothing was deleted');
      expect(check.message).not.toContain('Stripe PM');
    }
  });

  it('treats the title as exact, including capital letters', () => {
    const check = checkResumesToDelete(catalog, [{ resumeId: 'p2', confirmTitle: 'stripe pm' }]);
    expect(check.ok).toBe(false);
  });

  it('refuses an unknown resume', () => {
    const check = checkResumesToDelete(catalog, [{ resumeId: 'p9', confirmTitle: 'Backend' }]);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.message).toContain('list_resumes');
  });

  it('counts the same resume named twice once', () => {
    const check = checkResumesToDelete(catalog, [
      { resumeId: 'p1', confirmTitle: 'Product PM' },
      { resumeId: 'alex-pm', confirmTitle: 'Product PM' },
    ]);
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.resumes).toHaveLength(1);
  });

  it('needs at least one resume, each with a title', () => {
    expect(DeleteResumesSchema.safeParse({ resumes: [] }).success).toBe(false);
    expect(DeleteResumesSchema.safeParse({ resumes: [{ resumeId: 'p1' }] }).success).toBe(false);
  });
});
