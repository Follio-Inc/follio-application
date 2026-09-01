import { describe, expect, it } from 'vitest';

import {
  buildFollioIdentity,
  rewriteAbout,
  rewriteEducationNote,
  rewriteExtras,
  rewriteHeadline,
  rewriteHighlights,
} from '@/lib/follio-identity';
import type { PublicProfile } from '@/types';

describe('Follio voice', () => {
  it('keeps a short headline and strips keyword soup', () => {
    expect(rewriteHeadline('Mathematician and writer')).toBe('Mathematician and writer');
    expect(rewriteHeadline('Engineer | React | Node | AWS | Seeking roles')).toBe('Engineer');
  });

  it('drops résumé-objective filler and keeps signal', () => {
    expect(
      rewriteAbout(
        'Results-driven engineer seeking a challenging role. Wrote the first published algorithm. Passionate team player looking for opportunities.'
      )
    ).toBe('Wrote the first published algorithm.');
  });

  it('picks two proof points and drops duty-list noise', () => {
    expect(
      rewriteHighlights({
        bullets: [
          'Responsible for various duties and day-to-day tasks',
          'Worked with team members on several projects etc.',
          'Shipped the compiler to 12 national labs',
          'Wrote the notes that defined the analytical engine',
          'Participated in weekly standups',
          'Assisted with documentation',
        ],
      })
    ).toEqual([
      'Shipped the compiler to 12 national labs',
      'Wrote the notes that defined the analytical engine',
    ]);
  });

  it('drops coursework and caps extras', () => {
    expect(rewriteEducationNote('Relevant coursework: Algebra, Geometry, French')).toBeNull();
    expect(rewriteEducationNote('Thesis on the analytical engine.')).toBe(
      'Thesis on the analytical engine.'
    );
    expect(
      rewriteExtras(['First published algorithm', 'Royal Society medal', 'Chess club'])
    ).toEqual(['First published algorithm', 'Royal Society medal']);
  });
});

describe('buildFollioIdentity applies Follio voice', () => {
  it('does not dump the résumé onto the page', () => {
    const identity = buildFollioIdentity(
      {
        id: 'p1',
        handle: 'ada',
        firstName: 'Ada',
        lastName: 'Lovelace',
        headline: 'Mathematician | Writer | Analyst | Seeking roles',
        summary:
          'Results-driven professional seeking a challenging role. Wrote the first algorithm. Passionate about leveraging synergies.',
        location: 'London',
        workExperiences: [
          {
            id: 'w1',
            company: 'Analytical Engine',
            role: 'Chief visionary',
            location: 'London',
            startDate: new Date('2018-01-01'),
            endDate: null,
            isCurrent: true,
            bullets: [
              'Responsible for various planning duties',
              'Shipped the compiler',
              'Wrote the notes',
              'Worked on miscellaneous tasks',
              'Participated in meetings',
            ],
            isVisible: true,
          },
        ],
        educations: [
          {
            id: 'e1',
            institution: 'University of London',
            degree: 'BS',
            fieldOfStudy: 'Mathematics',
            description: 'Relevant coursework: Algebra, Geometry',
            honors: ['Medal', 'Prize', 'Club'],
            activities: [],
            isVisible: true,
          },
        ],
        skills: [],
        skillGroups: [],
        links: [],
        contactInfo: {},
      } as unknown as PublicProfile,
      { showResume: false, showWork: false }
    );

    expect(identity.headline).toBe('Mathematician');
    expect(identity.about).toBe('Wrote the first algorithm.');
    expect(identity.experience[0]?.highlights).toEqual(['Shipped the compiler', 'Wrote the notes']);
    expect(identity.education[0]?.description).toBeNull();
    expect(identity.education[0]?.honors).toEqual(['Medal', 'Prize']);
  });
});
