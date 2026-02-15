/**
 * Export Service Unit Tests
 *
 * Tests for services/export.service.ts — toJSONResume() and toPlainText()
 * are pure transformations: profile data → formatted output.
 */

import { toJSONResume, toPDFHtml, toPlainText } from '@/services/export.service';
import type { FullProfile } from '@/types';
import { describe, expect, it } from 'vitest';

// ── Minimal FullProfile factory ──────────────────────────────

function makeProfile(overrides: Partial<FullProfile> = {}): FullProfile {
  return {
    id: 'p1',
    userId: 'u1',
    handle: 'jdoe',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    headline: 'Software Engineer',
    summary: 'Experienced developer with a passion for clean code.',
    location: 'San Francisco, CA',
    avatarUrl: 'https://example.com/avatar.jpg',
    isPublic: true,
    isDraft: false,
    source: 'MANUAL',
    createdAt: new Date(),
    updatedAt: new Date(),
    status: 'ACTIVE',
    resumeVisibility: 'PUBLIC',
    portfolioVisibility: 'PUBLIC',
    linksVisibility: 'PUBLIC',
    unlistedKey: null,
    preferredView: 'portfolio',
    contactInfo: {
      id: 'ci1',
      profileId: 'p1',
      email: 'john@example.com',
      emailPublic: true,
      phone: '555-123-4567',
      phonePublic: false,
      website: 'https://johndoe.dev',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    links: [
      {
        id: 'l1',
        profileId: 'p1',
        type: 'GITHUB',
        url: 'https://github.com/jdoe',
        label: 'jdoe',
        sortOrder: 0,
        source: 'MANUAL',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    workExperiences: [
      {
        id: 'w1',
        profileId: 'p1',
        company: 'Acme Corp',
        companyUrl: 'https://acme.com',
        role: 'Senior Engineer',
        location: 'Remote',
        startDate: new Date('2020-01-01'),
        endDate: null,
        isCurrent: true,
        bullets: ['Built scalable APIs', 'Led team of 5'],
        sortOrder: 0,
        source: 'MANUAL',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    educations: [
      {
        id: 'e1',
        profileId: 'p1',
        institution: 'MIT',
        institutionUrl: 'https://mit.edu',
        degree: 'B.S.',
        fieldOfStudy: 'Computer Science',
        startDate: new Date('2014-09-01'),
        endDate: new Date('2018-06-01'),
        isCurrent: false,
        gpa: '3.8',
        activities: ['Algorithms', 'Data Structures'],
        sortOrder: 0,
        source: 'MANUAL',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    skills: [
      {
        id: 's1',
        profileId: 'p1',
        name: 'TypeScript',
        category: 'Language',
        level: 'Expert',
        sortOrder: 0,
        source: 'MANUAL',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 's2',
        profileId: 'p1',
        name: 'React',
        category: 'Framework',
        level: 'Advanced',
        sortOrder: 1,
        source: 'MANUAL',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    skillGroups: [],
    projects: [
      {
        id: 'pr1',
        profileId: 'p1',
        title: 'Follio',
        description: 'Portfolio builder',
        shortDesc: 'Portfolio builder',
        url: 'https://follio.me',
        repoUrl: 'https://github.com/jdoe/follio',
        imageUrl: null,
        techStack: ['Next.js', 'Prisma'],
        highlights: ['Open source', '500+ stars'],
        startDate: new Date('2023-01-01'),
        endDate: null,
        isCurrent: true,
        featured: true,
        sortOrder: 0,
        source: 'MANUAL',
        createdAt: new Date(),
        updatedAt: new Date(),
        ghStars: null,
        ghForks: null,
        ghLanguage: null,
      },
    ],
    awards: [
      {
        id: 'a1',
        profileId: 'p1',
        title: 'Best Hack',
        issuer: 'HackMIT',
        description: 'Won first place',
        date: new Date('2022-10-01'),
        url: null,
        sortOrder: 0,
        source: 'MANUAL',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    certifications: [
      {
        id: 'c1',
        profileId: 'p1',
        name: 'AWS Solutions Architect',
        issuer: 'Amazon',
        issueDate: new Date('2023-03-01'),
        expirationDate: null,
        credentialId: 'AWS-123',
        credentialUrl: 'https://aws.amazon.com/cert/123',
        sortOrder: 0,
        source: 'MANUAL',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    blogPosts: [],
    youtubeVideos: [],
    photos: [],
    sections: [],
    ...overrides,
  } as unknown as FullProfile;
}

// ── toJSONResume ─────────────────────────────────────────────

describe('toJSONResume', () => {
  it('maps basics correctly', () => {
    const result = toJSONResume(makeProfile());
    expect(result.basics?.name).toBe('John Doe');
    expect(result.basics?.label).toBe('Software Engineer');
    expect(result.basics?.email).toBe('john@example.com');
    expect(result.basics?.summary).toContain('Experienced developer');
    expect(result.basics?.location?.city).toBe('San Francisco, CA');
  });

  it('excludes email when emailPublic is false', () => {
    const profile = makeProfile({
      contactInfo: {
        id: 'ci1',
        profileId: 'p1',
        email: 'secret@example.com',
        emailPublic: false,
        phone: null,
        phonePublic: false,
        website: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    } as Partial<FullProfile>);
    const result = toJSONResume(profile);
    expect(result.basics?.email).toBeUndefined();
  });

  it('maps work experience', () => {
    const result = toJSONResume(makeProfile());
    expect(result.work).toHaveLength(1);
    expect(result.work![0].name).toBe('Acme Corp');
    expect(result.work![0].position).toBe('Senior Engineer');
    expect(result.work![0].highlights).toEqual(['Built scalable APIs', 'Led team of 5']);
    // isCurrent → no endDate
    expect(result.work![0].endDate).toBeUndefined();
  });

  it('maps education', () => {
    const result = toJSONResume(makeProfile());
    expect(result.education).toHaveLength(1);
    expect(result.education![0].institution).toBe('MIT');
    expect(result.education![0].studyType).toBe('B.S.');
    expect(result.education![0].area).toBe('Computer Science');
    expect(result.education![0].score).toBe('3.8');
    expect(result.education![0].courses).toEqual(['Algorithms', 'Data Structures']);
  });

  it('maps flat skills when no skill groups', () => {
    const result = toJSONResume(makeProfile());
    expect(result.skills).toHaveLength(2);
    expect(result.skills![0].name).toBe('TypeScript');
  });

  it('maps skill groups when present', () => {
    const profile = makeProfile({
      skillGroups: [
        {
          id: 'sg1',
          profileId: 'p1',
          name: 'Languages',
          sortOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          skills: [
            {
              id: 's1',
              profileId: 'p1',
              name: 'TypeScript',
              category: 'Language',
              level: null,
              sortOrder: 0,
              source: 'MANUAL',
              createdAt: new Date(),
              updatedAt: new Date(),
              skillGroupId: 'sg1',
            },
          ],
        },
      ],
    } as unknown as Partial<FullProfile>);
    const result = toJSONResume(profile);
    expect(result.skills![0].name).toBe('Languages');
    expect(result.skills![0].keywords).toEqual(['TypeScript']);
  });

  it('maps projects', () => {
    const result = toJSONResume(makeProfile());
    expect(result.projects).toHaveLength(1);
    expect(result.projects![0].name).toBe('Follio');
    expect(result.projects![0].keywords).toEqual(['Next.js', 'Prisma']);
  });

  it('maps awards', () => {
    const result = toJSONResume(makeProfile());
    expect(result.awards).toHaveLength(1);
    expect(result.awards![0].title).toBe('Best Hack');
    expect(result.awards![0].awarder).toBe('HackMIT');
  });

  it('maps certifications', () => {
    const result = toJSONResume(makeProfile());
    expect(result.certificates).toHaveLength(1);
    expect(result.certificates![0].name).toBe('AWS Solutions Architect');
    expect(result.certificates![0].issuer).toBe('Amazon');
  });

  it('maps profiles/links', () => {
    const result = toJSONResume(makeProfile());
    expect(result.basics?.profiles).toHaveLength(1);
    expect(result.basics?.profiles![0].network).toBe('GITHUB');
    expect(result.basics?.profiles![0].url).toBe('https://github.com/jdoe');
  });

  it('handles empty profile', () => {
    const profile = makeProfile({
      firstName: '',
      lastName: '',
      headline: null,
      summary: null,
      location: null,
      avatarUrl: null,
      contactInfo: null,
      links: [],
      workExperiences: [],
      educations: [],
      skills: [],
      skillGroups: [],
      projects: [],
      awards: [],
      certifications: [],
    } as unknown as Partial<FullProfile>);
    const result = toJSONResume(profile);
    expect(result.basics?.name).toBe('');
    expect(result.work).toEqual([]);
    expect(result.education).toEqual([]);
    expect(result.skills).toEqual([]);
    expect(result.projects).toEqual([]);
  });
});

// ── toPlainText ──────────────────────────────────────────────

describe('toPlainText', () => {
  it('starts with uppercase full name', () => {
    const text = toPlainText(makeProfile());
    const firstLine = text.split('\n')[0];
    expect(firstLine).toBe('JOHN DOE');
  });

  it('includes headline', () => {
    const text = toPlainText(makeProfile());
    expect(text).toContain('Software Engineer');
  });

  it('includes location', () => {
    const text = toPlainText(makeProfile());
    expect(text).toContain('San Francisco, CA');
  });

  it('includes contact info when emailPublic', () => {
    const text = toPlainText(makeProfile());
    expect(text).toContain('john@example.com');
    expect(text).toContain('https://johndoe.dev');
  });

  it('excludes email when emailPublic is false', () => {
    const profile = makeProfile({
      contactInfo: {
        id: 'ci1',
        profileId: 'p1',
        email: 'secret@example.com',
        emailPublic: false,
        phone: null,
        phonePublic: false,
        website: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    } as Partial<FullProfile>);
    const text = toPlainText(profile);
    expect(text).not.toContain('secret@example.com');
  });

  it('includes SUMMARY section', () => {
    const text = toPlainText(makeProfile());
    expect(text).toContain('SUMMARY');
    expect(text).toContain('Experienced developer');
  });

  it('includes EXPERIENCE section with bullets', () => {
    const text = toPlainText(makeProfile());
    expect(text).toContain('EXPERIENCE');
    expect(text).toContain('Senior Engineer | Acme Corp');
    expect(text).toContain('• Built scalable APIs');
    expect(text).toContain('• Led team of 5');
  });

  it('shows "Present" for current positions', () => {
    const text = toPlainText(makeProfile());
    expect(text).toContain('Present');
  });

  it('includes EDUCATION section', () => {
    const text = toPlainText(makeProfile());
    expect(text).toContain('EDUCATION');
    expect(text).toContain('MIT');
    expect(text).toContain('GPA: 3.8');
  });

  it('includes SKILLS section', () => {
    const text = toPlainText(makeProfile());
    expect(text).toContain('SKILLS');
    expect(text).toContain('TypeScript');
    expect(text).toContain('React');
  });

  it('includes PROJECTS section', () => {
    const text = toPlainText(makeProfile());
    expect(text).toContain('PROJECTS');
    expect(text).toContain('Follio');
    expect(text).toContain('Technologies: Next.js, Prisma');
  });

  it('includes CERTIFICATIONS section', () => {
    const text = toPlainText(makeProfile());
    expect(text).toContain('CERTIFICATIONS');
    expect(text).toContain('AWS Solutions Architect');
  });

  it('omits empty sections', () => {
    const profile = makeProfile({
      workExperiences: [],
      educations: [],
      skills: [],
      projects: [],
      certifications: [],
      summary: null,
    } as unknown as Partial<FullProfile>);
    const text = toPlainText(profile);
    expect(text).not.toContain('EXPERIENCE');
    expect(text).not.toContain('EDUCATION');
    expect(text).not.toContain('SKILLS');
    expect(text).not.toContain('PROJECTS');
    expect(text).not.toContain('SUMMARY');
  });
});

// ── toPDFHtml ────────────────────────────────────────────────

describe('toPDFHtml', () => {
  it('generates valid HTML with name in title', () => {
    const html = toPDFHtml(makeProfile());
    expect(html).toContain('<title>John Doe - Resume</title>');
    expect(html).toContain('<h1>John Doe</h1>');
  });

  it('includes headline', () => {
    const html = toPDFHtml(makeProfile());
    expect(html).toContain('Software Engineer');
  });

  it('includes experience section', () => {
    const html = toPDFHtml(makeProfile());
    expect(html).toContain('Senior Engineer');
    expect(html).toContain('Acme Corp');
  });

  it('includes education section', () => {
    const html = toPDFHtml(makeProfile());
    expect(html).toContain('MIT');
  });

  it('includes skills section', () => {
    const html = toPDFHtml(makeProfile());
    expect(html).toContain('TypeScript');
  });

  it('includes projects section', () => {
    const html = toPDFHtml(makeProfile());
    expect(html).toContain('Follio');
  });

  it('omits empty sections from HTML', () => {
    const profile = makeProfile({
      workExperiences: [],
      educations: [],
      skills: [],
      projects: [],
      summary: null,
    } as unknown as Partial<FullProfile>);
    const html = toPDFHtml(profile);
    expect(html).not.toContain('<h2>Experience</h2>');
    expect(html).not.toContain('<h2>Education</h2>');
    expect(html).not.toContain('<h2>Skills</h2>');
    expect(html).not.toContain('<h2>Projects</h2>');
    expect(html).not.toContain('<h2>Summary</h2>');
  });
});
