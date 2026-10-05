import { describe, expect, it } from 'vitest';

import { buildResumeHighlights, selectHighlightLines } from '@/lib/resume/highlights';
import type { PublicProfile } from '@/types';

function profile(overrides: Partial<PublicProfile> = {}): PublicProfile {
  return {
    id: 'p1',
    handle: 'ada',
    firstName: 'Ada',
    middleName: null,
    lastName: 'Lovelace',
    headline: 'Mathematician | writer | inventor',
    summary: '<p>Wrote the first published algorithm for a machine.</p>',
    totalExperience: '8 yrs',
    totalExperienceVisible: true,
    workExperiences: [],
    educations: [],
    projects: [],
    awards: [],
    certifications: [],
    skills: [],
    skillGroups: [],
    links: [],
    sections: [],
    ...overrides,
  } as PublicProfile;
}

describe('selectHighlightLines', () => {
  it('keeps outcomes and drops duty-list filler', () => {
    expect(
      selectHighlightLines({
        bullets: [
          'Responsible for team meetings',
          '<strong>Designed</strong> the first published algorithm',
          'Cut calculation time by 40%',
        ],
      })
    ).toEqual(['Designed the first published algorithm', 'Cut calculation time by 40%']);
  });

  it('keeps written order and caps the reel', () => {
    const bullets = ['One', 'Two', 'Three', 'Four', 'Five'];
    expect(selectHighlightLines({ bullets })).toEqual(['One', 'Two', 'Three', 'Four']);
  });
});

describe('buildResumeHighlights', () => {
  it('marks proof points under the role they came from', () => {
    const highlights = buildResumeHighlights(
      profile({
        workExperiences: [
          {
            id: 'w1',
            role: 'Chief visionary',
            company: 'Analytical Engine',
            startDate: new Date('2018-03-01'),
            endDate: null,
            isCurrent: true,
            isVisible: true,
            bullets: ['Designed the first published algorithm', 'Responsible for correspondence'],
          },
        ] as PublicProfile['workExperiences'],
      })
    );

    expect(highlights.name).toBe('Ada Lovelace');
    expect(highlights.headline).toBe('Mathematician');
    expect(highlights.lead).toBe('Wrote the first published algorithm for a machine.');
    expect(highlights.tenure).toBe('8 yrs');
    expect(highlights.groups).toEqual([
      {
        id: 'experience-w1',
        kind: 'experience',
        heading: 'Chief visionary',
        meta: 'Analytical Engine · Mar 2018 – Present',
        lines: ['Designed the first published algorithm'],
      },
    ]);
  });

  it('follows section order and includes projects, study, awards, and certifications', () => {
    const highlights = buildResumeHighlights(
      profile({
        sections: [
          { id: 's-edu', type: 'EDUCATION', isVisible: true, sortOrder: 0 },
          { id: 's-exp', type: 'EXPERIENCE', isVisible: true, sortOrder: 1 },
          { id: 's-proj', type: 'PROJECTS', isVisible: true, sortOrder: 2 },
          { id: 's-award', type: 'AWARDS', isVisible: true, sortOrder: 3 },
          { id: 's-cert', type: 'CERTIFICATIONS', isVisible: true, sortOrder: 4 },
        ] as PublicProfile['sections'],
        educations: [
          {
            id: 'e1',
            institution: 'University of London',
            degree: 'BS',
            fieldOfStudy: 'Mathematics',
            startDate: new Date('2014-09-01'),
            endDate: new Date('2018-06-01'),
            isCurrent: false,
            isVisible: true,
            description:
              '<ul><li>Coursework in analysis</li><li>Thesis on the analytical engine</li></ul>',
            honors: ["Dean's list"],
            gpa: '3.9',
          },
        ] as PublicProfile['educations'],
        workExperiences: [
          {
            id: 'w1',
            role: 'Chief visionary',
            company: 'Analytical Engine',
            startDate: new Date('2018-03-01'),
            isCurrent: true,
            isVisible: true,
            bullets: ['Shipped the notes'],
          },
        ] as PublicProfile['workExperiences'],
        projects: [
          {
            id: 'p1',
            title: 'Difference Engine',
            highlights: ['Open source', '500 stars'],
            isVisible: true,
            showOnResume: true,
          },
        ] as PublicProfile['projects'],
        awards: [
          {
            id: 'a1',
            title: "Chairman's Award",
            issuer: 'Royal Society',
            date: new Date('2020-01-15'),
            description: 'For the published notes',
            isVisible: true,
          },
        ] as PublicProfile['awards'],
        certifications: [
          {
            id: 'c1',
            name: 'Analytical methods',
            issuer: 'Royal Society',
            issueDate: new Date('2019-05-01'),
            isVisible: true,
          },
        ] as PublicProfile['certifications'],
      })
    );

    expect(highlights.groups.map((group) => group.kind)).toEqual([
      'education',
      'experience',
      'project',
      'award',
      'certification',
    ]);
    expect(highlights.groups[0]).toMatchObject({
      heading: 'BS, Mathematics',
      meta: 'University of London · 2014 – 2018',
      lines: ['Thesis on the analytical engine', "Dean's list", 'GPA 3.9'],
    });
    expect(highlights.groups[2]?.lines).toEqual(['Open source', '500 stars']);
    expect(highlights.groups[3]).toMatchObject({
      heading: "Chairman's Award",
      meta: 'Royal Society · 2020',
      lines: ['For the published notes'],
    });
    expect(highlights.groups[4]).toMatchObject({
      heading: null,
      meta: 'Royal Society · 2019',
      lines: ['Analytical methods'],
    });
  });

  it('skips hidden roles, resume-hidden projects, and entries with no outcomes', () => {
    const highlights = buildResumeHighlights(
      profile({
        summary: null,
        headline: null,
        workExperiences: [
          {
            id: 'hidden',
            role: 'Hidden',
            company: 'Secret',
            isCurrent: false,
            isVisible: false,
            bullets: ['Should not appear'],
          },
          {
            id: 'noise',
            role: 'Assistant',
            company: 'Office',
            isCurrent: false,
            isVisible: true,
            bullets: ['Responsible for filing'],
          },
        ] as PublicProfile['workExperiences'],
        projects: [
          {
            id: 'off-resume',
            title: 'Side project',
            highlights: ['Not on the resume'],
            isVisible: true,
            showOnResume: false,
          },
        ] as PublicProfile['projects'],
        educations: [
          {
            id: 'e1',
            institution: 'University of London',
            degree: 'BS',
            fieldOfStudy: 'Mathematics',
            isVisible: true,
            description: null,
            honors: [] as string[],
          },
        ] as PublicProfile['educations'],
      })
    );

    expect(highlights.groups).toEqual([]);
    expect(highlights.lead).toBeNull();
    expect(highlights.headline).toBeNull();
  });

  it('hides a section the person turned off', () => {
    const highlights = buildResumeHighlights(
      profile({
        sections: [
          { id: 's-exp', type: 'EXPERIENCE', isVisible: false, sortOrder: 0 },
        ] as PublicProfile['sections'],
        workExperiences: [
          {
            id: 'w1',
            role: 'Chief visionary',
            company: 'Analytical Engine',
            isCurrent: true,
            isVisible: true,
            bullets: ['Designed the first published algorithm'],
          },
        ] as PublicProfile['workExperiences'],
      })
    );

    expect(highlights.groups).toEqual([]);
  });
});
