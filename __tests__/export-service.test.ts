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
    expect(html).toContain('class="resume-name">John Doe</h1>');
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
    expect(html).not.toContain('EXPERIENCE</h2>');
    expect(html).not.toContain('EDUCATION</h2>');
    expect(html).not.toContain('SKILLS</h2>');
    expect(html).not.toContain('PROJECTS</h2>');
    expect(html).not.toContain('SUMMARY</h2>');
  });

  it('uses resume design CSS custom properties', () => {
    const profile = makeProfile({
      resumeDesign: {
        fontFamily: 'inter',
        headingColor: '#2563eb',
        accentColor: '#dc2626',
        headerAlignment: 'left',
      },
    } as unknown as Partial<FullProfile>);
    const html = toPDFHtml(profile);
    expect(html).toContain('--rd-heading-color: #2563eb');
    expect(html).toContain('--rd-accent-color: #dc2626');
    expect(html).toContain('--rd-header-alignment: left');
    expect(html).toContain('fonts.googleapis.com/css2?family=Inter');
  });

  it('uses resume-paper class matching CleanResumeView', () => {
    const html = toPDFHtml(makeProfile());
    expect(html).toContain('class="resume-paper"');
    expect(html).toContain('class="resume-section"');
  });

  it('falls back to classic when sidebar template id is stored', () => {
    const html = toPDFHtml(
      makeProfile({
        resumeDesign: {
          templateId: 'sidebar',
          accentColor: '#1e40af',
          fontFamily: 'inter',
        },
      } as unknown as Partial<FullProfile>)
    );
    expect(html).toContain('data-resume-template="classic"');
    expect(html).not.toContain('resume-paper--sidebar');
    expect(html).not.toContain('resume-sidebar-layout');
    expect(html).toContain('SKILLS');
    expect(html).toContain('EXPERIENCE');
    expect(html).toContain('Acme Corp');
  });

  it('renders lumen template as single-column ATS layout', () => {
    const html = toPDFHtml(
      makeProfile({
        resumeDesign: {
          templateId: 'lumen',
          accentColor: '#b0aaa3',
          fontFamily: 'instrument-sans',
          nameFontFamily: 'instrument-sans',
          titleFontFamily: 'instrument-sans',
          headingFontFamily: 'instrument-sans',
          contactFontFamily: 'instrument-sans',
          headerAlignment: 'left',
        },
      } as unknown as Partial<FullProfile>)
    );
    expect(html).toContain('resume-paper--lumen');
    expect(html).toContain('data-resume-template="lumen"');
    expect(html).toContain('Instrument Sans');
    expect(html).toMatch(/class="resume-paper resume-paper--lumen"/);
    expect(html).not.toMatch(/class="[^"]*resume-sleek-header/);
    expect(html).not.toMatch(/class="[^"]*resume-atelier-layout/);
    expect(html).toContain('SKILLS');
    expect(html).toContain('EXPERIENCE');
    expect(html).toContain('Acme Corp');
  });

  it('renders sleek template layout without losing content', () => {
    const html = toPDFHtml(
      makeProfile({
        resumeDesign: {
          templateId: 'sleek',
          accentColor: '#8f9aa8',
          fontFamily: 'lato',
        },
      } as unknown as Partial<FullProfile>)
    );
    expect(html).toContain('resume-paper--sleek');
    expect(html).toContain('data-resume-template="sleek"');
    expect(html).toContain('resume-sleek-header');
    expect(html).toContain('resume-sleek-contact');
    expect(html).toContain('SKILLS');
    expect(html).toContain('EXPERIENCE');
    expect(html).toContain('Acme Corp');
  });

  it('renders studio template as single-column layout without proficiency bars', () => {
    const html = toPDFHtml(
      makeProfile({
        resumeDesign: {
          templateId: 'studio',
          accentColor: '#7a9aa5',
          fontFamily: 'open-sans',
        },
      } as unknown as Partial<FullProfile>)
    );
    expect(html).toContain('resume-paper--studio');
    expect(html).toContain('data-resume-template="studio"');
    expect(html).toContain('resume-studio-header');
    expect(html).toContain('resume-studio-contact');
    expect(html).toContain('resume-studio-body');
    expect(html).not.toContain('resume-studio-rail');
    expect(html).not.toContain('resume-studio-layout');
    expect(html).not.toContain('type="range"');
    expect(html).toContain('SKILLS');
    expect(html).toContain('SUMMARY');
    expect(html).toContain('EXPERIENCE');
    expect(html).toContain('Acme Corp');
  });

  it('omits studio date pills when experience or education has no dates', () => {
    const html = toPDFHtml(
      makeProfile({
        resumeDesign: {
          templateId: 'studio',
          accentColor: '#7a9aa5',
          fontFamily: 'open-sans',
        },
        workExperiences: [
          {
            id: 'w1',
            profileId: 'p1',
            company: 'Acme Corp',
            companyUrl: null,
            role: 'Senior Engineer',
            location: 'Remote',
            startDate: null,
            endDate: null,
            isCurrent: false,
            bullets: ['Built scalable APIs'],
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
            institutionUrl: null,
            degree: 'B.S.',
            fieldOfStudy: 'Computer Science',
            startDate: null,
            endDate: null,
            isCurrent: false,
            gpa: null,
            activities: null,
            sortOrder: 0,
            source: 'MANUAL',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        projects: [],
      } as unknown as Partial<FullProfile>)
    );

    expect(html).toContain('Acme Corp');
    expect(html).toContain('MIT');
    // No empty date pill markup for undated entries
    expect(html).not.toMatch(/<span class="resume-entry-date">\s*<\/span>/);
    // Experience/education sections should not render a date pill at all
    const experienceBlock = html.slice(html.indexOf('EXPERIENCE'), html.indexOf('EDUCATION'));
    const educationBlock = html.slice(html.indexOf('EDUCATION'), html.indexOf('SKILLS'));
    expect(experienceBlock).not.toContain('resume-entry-date');
    expect(educationBlock).not.toContain('resume-entry-date');
  });

  it('renders atelier template with script header and rail layout', () => {
    const html = toPDFHtml(
      makeProfile({
        resumeDesign: {
          templateId: 'atelier',
          accentColor: '#C25B42',
          fontFamily: 'garamond',
        },
      } as unknown as Partial<FullProfile>)
    );
    expect(html).toContain('resume-paper--atelier');
    expect(html).toContain('data-resume-template="atelier"');
    expect(html).toContain('resume-atelier-header');
    expect(html).toContain('resume-atelier-layout');
    expect(html).toContain('resume-atelier-rail');
    expect(html).not.toContain('resume-atelier-ruler');
    expect(html).not.toContain('resume-rating-dot');
    expect(html).toContain('Great+Vibes');
    expect(html).toContain('PROFILE');
    expect(html).toContain('WORK EXPERIENCE');
    expect(html).toContain('resume-skills-stack');
    expect(html).toContain('Acme Corp');
  });

  it('renders categorized skills as bold label + colon + csv without hanging indent', () => {
    const html = toPDFHtml(
      makeProfile({
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
                level: null,
                sortOrder: 0,
                isVisible: true,
                source: 'MANUAL',
                groupId: 'sg1',
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              {
                id: 's2',
                profileId: 'p1',
                name: 'Python',
                level: null,
                sortOrder: 1,
                isVisible: true,
                source: 'MANUAL',
                groupId: 'sg1',
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
          },
          {
            id: 'sg2',
            profileId: 'p1',
            name: 'Tools',
            sortOrder: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            skills: [
              {
                id: 's3',
                profileId: 'p1',
                name: 'Docker',
                level: null,
                sortOrder: 0,
                isVisible: true,
                source: 'MANUAL',
                groupId: 'sg2',
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
          },
        ],
      } as unknown as Partial<FullProfile>)
    );

    expect(html).toContain('resume-skills-grouped');
    expect(html).toContain('resume-skill-group-name');
    expect(html).toContain('Languages');
    expect(html).toContain('TypeScript, Python');
    expect(html).toContain('Tools');
    expect(html).toContain('Docker');
    expect(html).toMatch(
      /<span class="resume-skill-group-name">Languages: <\/span><span class="resume-skill-group-items">TypeScript, Python<\/span>/
    );
    expect(html).toContain(
      '.resume-skill-group { font-size: 13px; margin: 0; text-align: justify; line-height: 1.45; }'
    );
  });

  it('does not apply a preview-only resume-justify-all overlay', () => {
    const html = toPDFHtml(
      makeProfile({
        resumeDesign: { justifyAll: true },
      } as unknown as Partial<FullProfile>)
    );
    expect(html).not.toMatch(/<article class="[^"]*\bresume-justify-all\b/);
  });

  it('justifies experience bullet paragraphs in PDF CSS the same way as the preview', () => {
    const html = toPDFHtml(makeProfile());
    expect(html).toMatch(/\.resume-entry \.rich-text-bullets li p[\s\S]*text-align: justify/);
    expect(html).toContain('display: list-item');
    expect(html).toContain('list-style: disc outside');
  });

  it('keeps editor bullet lists in PDF HTML', () => {
    const base = makeProfile();
    const html = toPDFHtml(
      makeProfile({
        workExperiences: [
          {
            ...base.workExperiences[0],
            bulletsHtml:
              '<ul class="rich-text-bullets" data-bullet-style="disc"><li><p>Built scalable APIs</p></li></ul>',
          },
        ],
      } as unknown as Partial<FullProfile>)
    );
    expect(html).toContain('class="rich-text-bullets"');
    expect(html).toContain('<li><p>Built scalable APIs</p></li>');
  });

  it('wraps plain-text bullets in a paragraph so PDF justify matches preview', () => {
    const html = toPDFHtml(makeProfile());
    expect(html).toContain('<li><p style="text-align: justify">Built scalable APIs</p></li>');
    expect(html).toContain('<li><p style="text-align: justify">Led team of 5</p></li>');
  });
});
