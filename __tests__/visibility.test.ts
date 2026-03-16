/**
 * Visibility Filter Unit Tests
 *
 * Tests for the centralized section-visibility filter in lib/visibility.ts.
 * This is the single source of truth for how eye-icon toggles translate
 * into hidden/shown profile data — used by:
 *   - profile.service.ts  (server-side public profile)
 *   - clean-resume-view.tsx (builder preview + public resume page)
 *   - resume-view.tsx       (legacy resume view)
 */

import { applyVisibilityFilter } from '@/lib/visibility';
import type { PublicProfile } from '@/types';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Minimal section factory */
function section(type: string, isVisible = true, extras: Record<string, unknown> = {}) {
  return { id: `sec-${type}`, type, isVisible, sortOrder: 0, title: type, ...extras };
}

/** Build a minimal profile with sensible defaults. Callers override as needed. */
function buildProfile(overrides: Partial<PublicProfile> = {}): PublicProfile {
  return {
    id: 'profile-1',
    handle: 'test',
    firstName: 'Alice',
    lastName: 'Smith',
    headline: 'Engineer',
    summary: 'A summary.',
    avatarUrl: 'https://img.example/avatar.jpg',
    location: 'New York',
    contactInfo: {
      email: 'alice@example.com',
      phone: '+1234567890',
      website: 'https://example.com',
    },
    links: [
      {
        id: 'link-1',
        url: 'https://github.com/alice',
        label: 'GitHub',
        type: 'GITHUB',
        isVisible: true,
      },
    ] as PublicProfile['links'],
    workExperiences: [
      { id: 'we-1', role: 'Dev', company: 'Co' },
    ] as unknown as PublicProfile['workExperiences'],
    educations: [{ id: 'edu-1', institution: 'MIT' }] as unknown as PublicProfile['educations'],
    skills: [{ id: 'sk-1', name: 'TS' }] as unknown as PublicProfile['skills'],
    skillGroups: [] as PublicProfile['skillGroups'],
    projects: [{ id: 'pr-1', title: 'Proj' }] as unknown as PublicProfile['projects'],
    awards: [{ id: 'aw-1', title: 'Award' }] as unknown as PublicProfile['awards'],
    certifications: [{ id: 'ce-1', name: 'Cert' }] as unknown as PublicProfile['certifications'],
    photos: [{ id: 'ph-1', url: 'pic.jpg' }] as unknown as PublicProfile['photos'],
    blogPosts: [] as PublicProfile['blogPosts'],
    youtubeVideos: [] as PublicProfile['youtubeVideos'],
    sections: [
      section('BASIC_INFO'),
      section('PHOTOS'),
      section('EXPERIENCE'),
      section('EDUCATION'),
      section('SKILLS'),
      section('PROJECTS'),
      section('LINKS'),
      section('AWARDS'),
      section('CERTIFICATIONS'),
    ] as unknown as PublicProfile['sections'],
    ...overrides,
  } as PublicProfile;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('applyVisibilityFilter', () => {
  // ── No sections configured (new profile) ──────────────────────────────

  it('returns everything visible when no sections exist', () => {
    const raw = buildProfile({ sections: [] as unknown as PublicProfile['sections'] });
    const result = applyVisibilityFilter(raw);

    expect(result.firstName).toBe('Alice');
    expect(result.lastName).toBe('Smith');
    expect(result.summary).toBe('A summary.');
    expect(result.contactInfo?.email).toBe('alice@example.com');
    expect(result.workExperiences).toHaveLength(1);
    expect(result._photosVisible).toBe(true);
  });

  // ── BASIC_INFO (Header) ───────────────────────────────────────────────

  it('hides name, headline, summary when BASIC_INFO is hidden', () => {
    const raw = buildProfile({
      sections: [
        section('BASIC_INFO', false),
        section('SUMMARY', false),
        section('EXPERIENCE'),
      ] as unknown as PublicProfile['sections'],
    });
    const result = applyVisibilityFilter(raw);

    expect(result.firstName).toBeNull();
    expect(result.lastName).toBeNull();
    expect(result.headline).toBeNull();
    expect(result.summary).toBeNull();
    // Contact is merged into BASIC_INFO — also hidden
    expect(result.contactInfo).toBeNull();
    expect(result.location).toBeNull();
  });

  it('shows name, headline, summary when BASIC_INFO is visible', () => {
    const raw = buildProfile();
    const result = applyVisibilityFilter(raw);

    expect(result.firstName).toBe('Alice');
    expect(result.lastName).toBe('Smith');
    expect(result.headline).toBe('Engineer');
    expect(result.summary).toBe('A summary.');
  });

  it('shows contact info when BASIC_INFO is visible (contact merged into Header)', () => {
    const raw = buildProfile();
    const result = applyVisibilityFilter(raw);

    expect(result.contactInfo?.email).toBe('alice@example.com');
    expect(result.location).toBe('New York');
  });

  it('hides location and contactInfo when BASIC_INFO is hidden', () => {
    const raw = buildProfile({
      sections: [
        section('BASIC_INFO', false),
        section('EXPERIENCE'),
      ] as unknown as PublicProfile['sections'],
    });
    const result = applyVisibilityFilter(raw);

    expect(result.location).toBeNull();
    expect(result.contactInfo).toBeNull();
  });

  it('respects emailPublic/phonePublic flags on contactInfo', () => {
    const raw = buildProfile({
      contactInfo: {
        email: 'alice@example.com',
        phone: '+1234567890',
        website: 'https://example.com',
        emailPublic: true,
        phonePublic: false, // phone should be hidden
      } as unknown as PublicProfile['contactInfo'],
    });
    const result = applyVisibilityFilter(raw);

    expect(result.contactInfo?.email).toBe('alice@example.com');
    expect(result.contactInfo?.phone).toBeNull();
    expect(result.contactInfo?.website).toBe('https://example.com');
  });

  // ── PHOTOS ────────────────────────────────────────────────────────────

  it('sets _photosVisible=false when PHOTOS section is hidden', () => {
    const raw = buildProfile({
      sections: [
        section('BASIC_INFO'),
        section('PHOTOS', false),
        section('EXPERIENCE'),
      ] as unknown as PublicProfile['sections'],
    });
    const result = applyVisibilityFilter(raw);

    expect(result._photosVisible).toBe(false);
    expect(result.photos).toEqual([]);
    // avatarUrl should still be available for other uses
    expect(result.avatarUrl).toBe('https://img.example/avatar.jpg');
  });

  it('sets _photosVisible=true when PHOTOS section is visible', () => {
    const raw = buildProfile();
    const result = applyVisibilityFilter(raw);

    expect(result._photosVisible).toBe(true);
    expect(result.photos).toHaveLength(1);
  });

  // ── Array-backed sections ─────────────────────────────────────────────

  const arraySections = [
    { type: 'EXPERIENCE', field: 'workExperiences' },
    { type: 'EDUCATION', field: 'educations' },
    { type: 'SKILLS', field: 'skills' },
    { type: 'PROJECTS', field: 'projects' },
    { type: 'LINKS', field: 'links' },
    { type: 'AWARDS', field: 'awards' },
    { type: 'CERTIFICATIONS', field: 'certifications' },
  ] as const;

  for (const { type, field } of arraySections) {
    it(`empties ${field} when ${type} section is hidden`, () => {
      const raw = buildProfile({
        sections: [
          section('BASIC_INFO'),
          section(type, false),
        ] as unknown as PublicProfile['sections'],
      });
      const result = applyVisibilityFilter(raw);

      expect((result as unknown as Record<string, unknown>)[field]).toEqual([]);
    });

    it(`keeps ${field} when ${type} section is visible`, () => {
      const raw = buildProfile({
        sections: [
          section('BASIC_INFO'),
          section(type, true),
        ] as unknown as PublicProfile['sections'],
      });
      const result = applyVisibilityFilter(raw);

      expect(
        ((result as unknown as Record<string, unknown>)[field] as unknown[]).length
      ).toBeGreaterThan(0);
    });
  }

  // ── SKILLS also gates skillGroups ─────────────────────────────────────

  it('empties skillGroups when SKILLS section is hidden', () => {
    const raw = buildProfile({
      skillGroups: [
        { id: 'sg-1', name: 'Front-end', skills: [] },
      ] as unknown as PublicProfile['skillGroups'],
      sections: [
        section('BASIC_INFO'),
        section('SKILLS', false),
      ] as unknown as PublicProfile['sections'],
    });
    const result = applyVisibilityFilter(raw);

    expect(result.skillGroups).toEqual([]);
    expect(result.skills).toEqual([]);
  });

  // ── Sections array itself is filtered ─────────────────────────────────

  it('only includes visible sections in the output sections array', () => {
    const raw = buildProfile({
      sections: [
        section('BASIC_INFO', true),
        section('EXPERIENCE', false),
        section('EDUCATION', true),
      ] as unknown as PublicProfile['sections'],
    });
    const result = applyVisibilityFilter(raw);

    const types = result.sections.map((s) => s.type);
    expect(types).toContain('BASIC_INFO');
    expect(types).toContain('EDUCATION');
    expect(types).not.toContain('EXPERIENCE');
  });

  // ── Multiple hidden sections at once ──────────────────────────────────

  it('handles multiple hidden sections simultaneously', () => {
    const raw = buildProfile({
      sections: [
        section('BASIC_INFO', false),
        section('SUMMARY', false),
        section('PHOTOS', false),
        section('EXPERIENCE', false),
        section('EDUCATION', false),
        section('SKILLS', false),
        section('PROJECTS', false),
        section('LINKS', false),
        section('AWARDS', false),
        section('CERTIFICATIONS', false),
      ] as unknown as PublicProfile['sections'],
    });
    const result = applyVisibilityFilter(raw);

    expect(result.firstName).toBeNull();
    expect(result.lastName).toBeNull();
    expect(result.headline).toBeNull();
    expect(result.summary).toBeNull();
    expect(result.location).toBeNull();
    expect(result.contactInfo).toBeNull();
    expect(result.workExperiences).toEqual([]);
    expect(result.educations).toEqual([]);
    expect(result.skills).toEqual([]);
    expect(result.projects).toEqual([]);
    expect(result.links).toEqual([]);
    expect(result.awards).toEqual([]);
    expect(result.certifications).toEqual([]);
    expect(result.photos).toEqual([]);
    expect(result._photosVisible).toBe(false);
  });

  // ── Idempotency: applying the filter twice gives the same result ──────

  it('is idempotent (applying twice gives the same result)', () => {
    const raw = buildProfile({
      sections: [
        section('BASIC_INFO'),
        section('EXPERIENCE', false),
      ] as unknown as PublicProfile['sections'],
    });

    const first = applyVisibilityFilter(raw);
    const second = applyVisibilityFilter(first);

    expect(second.firstName).toBe(first.firstName);
    expect(second.workExperiences).toEqual(first.workExperiences);
    expect(second.sections).toEqual(first.sections);
  });

  // ── Does not mutate the input ─────────────────────────────────────────

  it('does not mutate the input profile', () => {
    const raw = buildProfile({
      sections: [
        section('BASIC_INFO', false),
        section('EXPERIENCE', false),
      ] as unknown as PublicProfile['sections'],
    });
    const originalFirstName = raw.firstName;
    const originalExpCount = raw.workExperiences.length;

    applyVisibilityFilter(raw);

    expect(raw.firstName).toBe(originalFirstName);
    expect(raw.workExperiences).toHaveLength(originalExpCount);
  });

  // ========================================================================
  // ENTRY-LEVEL (individual item) isVisible filtering
  // ========================================================================

  describe('entry-level isVisible filtering', () => {
    it('removes workExperiences where isVisible is false', () => {
      const raw = buildProfile({
        workExperiences: [
          { id: 'we-1', role: 'Dev', company: 'Co', isVisible: true },
          { id: 'we-2', role: 'Lead', company: 'Co2', isVisible: false },
          { id: 'we-3', role: 'Intern', company: 'Co3' }, // undefined → visible
        ] as unknown as PublicProfile['workExperiences'],
      });
      const result = applyVisibilityFilter(raw);

      expect(result.workExperiences).toHaveLength(2);
      expect(result.workExperiences.map((w) => w.id)).toEqual(['we-1', 'we-3']);
    });

    it('removes educations where isVisible is false', () => {
      const raw = buildProfile({
        educations: [
          { id: 'edu-1', institution: 'MIT', isVisible: true },
          { id: 'edu-2', institution: 'Stanford', isVisible: false },
        ] as unknown as PublicProfile['educations'],
      });
      const result = applyVisibilityFilter(raw);

      expect(result.educations).toHaveLength(1);
      expect(result.educations[0].id).toBe('edu-1');
    });

    it('removes skills where isVisible is false', () => {
      const raw = buildProfile({
        skills: [
          { id: 'sk-1', name: 'TS', isVisible: true },
          { id: 'sk-2', name: 'Java', isVisible: false },
          { id: 'sk-3', name: 'Python' }, // undefined → visible
        ] as unknown as PublicProfile['skills'],
      });
      const result = applyVisibilityFilter(raw);

      expect(result.skills).toHaveLength(2);
      expect(result.skills.map((s) => s.name)).toEqual(['TS', 'Python']);
    });

    it('removes hidden skills within skill groups and drops empty groups', () => {
      const raw = buildProfile({
        skillGroups: [
          {
            id: 'sg-1',
            name: 'Frontend',
            skills: [
              { id: 'sk-1', name: 'React', isVisible: true },
              { id: 'sk-2', name: 'Vue', isVisible: false },
            ],
          },
          {
            id: 'sg-2',
            name: 'Backend',
            skills: [{ id: 'sk-3', name: 'Node', isVisible: false }],
          },
        ] as unknown as PublicProfile['skillGroups'],
      });
      const result = applyVisibilityFilter(raw);

      expect(result.skillGroups).toHaveLength(1);
      expect(result.skillGroups[0].name).toBe('Frontend');
      expect(result.skillGroups[0].skills).toHaveLength(1);
      expect(result.skillGroups[0].skills[0].name).toBe('React');
    });

    it('removes projects where isVisible is false', () => {
      const raw = buildProfile({
        projects: [
          { id: 'pr-1', title: 'Visible', isVisible: true },
          { id: 'pr-2', title: 'Hidden', isVisible: false },
          { id: 'pr-3', title: 'Default' }, // undefined → visible
        ] as unknown as PublicProfile['projects'],
      });
      const result = applyVisibilityFilter(raw);

      expect(result.projects).toHaveLength(2);
      expect(result.projects.map((p) => p.title)).toEqual(['Visible', 'Default']);
    });

    it('removes links where isVisible is false', () => {
      const raw = buildProfile({
        links: [
          { id: 'l-1', url: 'https://a.com', label: 'A', type: 'WEBSITE', isVisible: true },
          { id: 'l-2', url: 'https://b.com', label: 'B', type: 'WEBSITE', isVisible: false },
        ] as unknown as PublicProfile['links'],
      });
      const result = applyVisibilityFilter(raw);

      expect(result.links).toHaveLength(1);
      expect(result.links[0].id).toBe('l-1');
    });

    it('removes awards where isVisible is false', () => {
      const raw = buildProfile({
        awards: [
          { id: 'aw-1', title: 'Best', isVisible: true },
          { id: 'aw-2', title: 'Runner-up', isVisible: false },
        ] as unknown as PublicProfile['awards'],
      });
      const result = applyVisibilityFilter(raw);

      expect(result.awards).toHaveLength(1);
      expect(result.awards[0].id).toBe('aw-1');
    });

    it('removes certifications where isVisible is false', () => {
      const raw = buildProfile({
        certifications: [
          { id: 'ce-1', name: 'AWS', isVisible: true },
          { id: 'ce-2', name: 'GCP', isVisible: false },
        ] as unknown as PublicProfile['certifications'],
      });
      const result = applyVisibilityFilter(raw);

      expect(result.certifications).toHaveLength(1);
      expect(result.certifications[0].id).toBe('ce-1');
    });

    it('removes photos where isVisible is false', () => {
      const raw = buildProfile({
        photos: [
          { id: 'ph-1', url: 'pic1.jpg', isVisible: true },
          { id: 'ph-2', url: 'pic2.jpg', isVisible: false },
        ] as unknown as PublicProfile['photos'],
      });
      const result = applyVisibilityFilter(raw);

      expect(result.photos).toHaveLength(1);
      expect(result.photos[0].id).toBe('ph-1');
    });

    it('filters entry-level even when no sections are configured (new profile)', () => {
      const raw = buildProfile({
        sections: [] as unknown as PublicProfile['sections'],
        workExperiences: [
          { id: 'we-1', role: 'Dev', company: 'Co', isVisible: true },
          { id: 'we-2', role: 'Hidden', company: 'Co2', isVisible: false },
        ] as unknown as PublicProfile['workExperiences'],
        projects: [
          { id: 'pr-1', title: 'Visible' },
          { id: 'pr-2', title: 'Hidden', isVisible: false },
        ] as unknown as PublicProfile['projects'],
      });
      const result = applyVisibilityFilter(raw);

      expect(result.workExperiences).toHaveLength(1);
      expect(result.projects).toHaveLength(1);
      expect(result._photosVisible).toBe(true);
    });

    it('filters custom content section items by isVisible', () => {
      const raw = buildProfile({
        sections: [
          section('BASIC_INFO'),
          {
            id: 'sec-vol',
            type: 'VOLUNTEERING',
            isVisible: true,
            sortOrder: 0,
            title: 'VOLUNTEERING',
            customContent: {
              items: [
                { id: 'v1', role: 'Lead', isVisible: true },
                { id: 'v2', role: 'Hidden', isVisible: false },
                { id: 'v3', role: 'Default' }, // undefined → visible
              ],
            },
          },
        ] as unknown as PublicProfile['sections'],
      });
      const result = applyVisibilityFilter(raw);

      const volSection = result.sections.find((s) => s.type === 'VOLUNTEERING');
      expect(volSection).toBeDefined();
      const content = volSection!.customContent as { items: { id: string }[] };
      expect(content.items).toHaveLength(2);
      expect(content.items.map((i) => i.id)).toEqual(['v1', 'v3']);
    });
  });

  // ========================================================================
  // resumeContext option
  // ========================================================================

  describe('resumeContext option', () => {
    it('filters projects by showOnResume when resumeContext is true', () => {
      const raw = buildProfile({
        projects: [
          { id: 'pr-1', title: 'Both', isVisible: true, showOnResume: true },
          { id: 'pr-2', title: 'Portfolio only', isVisible: true, showOnResume: false },
          { id: 'pr-3', title: 'Default' }, // undefined → shown
        ] as unknown as PublicProfile['projects'],
      });
      const result = applyVisibilityFilter(raw, { resumeContext: true });

      expect(result.projects).toHaveLength(2);
      expect(result.projects.map((p) => p.title)).toEqual(['Both', 'Default']);
    });

    it('does NOT filter by showOnResume when resumeContext is not set', () => {
      const raw = buildProfile({
        projects: [
          { id: 'pr-1', title: 'Both', isVisible: true, showOnResume: true },
          { id: 'pr-2', title: 'Portfolio only', isVisible: true, showOnResume: false },
        ] as unknown as PublicProfile['projects'],
      });
      const result = applyVisibilityFilter(raw);

      expect(result.projects).toHaveLength(2);
    });

    it('combines isVisible and showOnResume in resumeContext', () => {
      const raw = buildProfile({
        projects: [
          { id: 'pr-1', title: 'Shown', isVisible: true, showOnResume: true },
          { id: 'pr-2', title: 'Hidden (isVisible)', isVisible: false, showOnResume: true },
          { id: 'pr-3', title: 'Hidden (showOnResume)', isVisible: true, showOnResume: false },
          { id: 'pr-4', title: 'Both hidden', isVisible: false, showOnResume: false },
        ] as unknown as PublicProfile['projects'],
      });
      const result = applyVisibilityFilter(raw, { resumeContext: true });

      expect(result.projects).toHaveLength(1);
      expect(result.projects[0].title).toBe('Shown');
    });

    it('applies showOnResume even when no sections are configured', () => {
      const raw = buildProfile({
        sections: [] as unknown as PublicProfile['sections'],
        projects: [
          { id: 'pr-1', title: 'Resume', showOnResume: true },
          { id: 'pr-2', title: 'No resume', showOnResume: false },
        ] as unknown as PublicProfile['projects'],
      });
      const result = applyVisibilityFilter(raw, { resumeContext: true });

      expect(result.projects).toHaveLength(1);
      expect(result.projects[0].title).toBe('Resume');
    });
  });

  // ========================================================================
  // Immutability with entry-level filtering
  // ========================================================================

  it('does not mutate the input arrays when filtering entries', () => {
    const raw = buildProfile({
      workExperiences: [
        { id: 'we-1', role: 'Dev', isVisible: true },
        { id: 'we-2', role: 'Hidden', isVisible: false },
      ] as unknown as PublicProfile['workExperiences'],
      projects: [
        { id: 'pr-1', title: 'A', isVisible: true },
        { id: 'pr-2', title: 'B', isVisible: false },
      ] as unknown as PublicProfile['projects'],
    });

    const originalExpCount = raw.workExperiences.length;
    const originalProjCount = raw.projects.length;

    applyVisibilityFilter(raw);

    expect(raw.workExperiences).toHaveLength(originalExpCount);
    expect(raw.projects).toHaveLength(originalProjCount);
  });
});
