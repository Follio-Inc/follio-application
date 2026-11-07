import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CleanResumeView } from '@/app/u/[handle]/views/clean-resume-view';
import type { ResumeGlance } from '@/lib/resume/glance';
import type { PublicProfile } from '@/types';

const profile = {
  id: 'p1',
  handle: 'ada',
  firstName: 'Ada',
  lastName: 'Lovelace',
  headline: 'Engineer',
  summary: null,
  workExperiences: [
    {
      id: 'w1',
      role: 'Staff engineer',
      company: 'Stripe',
      startDate: '2021-01-01',
      isCurrent: true,
      isVisible: true,
      employmentType: 'FULL_TIME',
      headingTags: [{ label: 'Full Time', color: 'slate' }],
      bullets: ['Cut checkout latency by 40% for 12M users'],
    },
    {
      id: 'w2',
      role: 'Founding engineer',
      company: 'Follio',
      startDate: '2016-01-01',
      endDate: '2018-01-01',
      isCurrent: false,
      isVisible: true,
      bullets: ['Launched the public resume editor'],
    },
  ],
  educations: [],
  projects: [],
  awards: [],
  certifications: [],
  skills: [],
  skillGroups: [],
  links: [],
  sections: [{ id: 's1', type: 'EXPERIENCE', title: 'Experience', isVisible: true, sortOrder: 1 }],
} as unknown as PublicProfile;

const glance: ResumeGlance = {
  version: 2,
  companies: [
    {
      company: 'Stripe',
      phrases: ['12M users'],
      summary: 'Made checkout faster for every user',
      skills: ['Go', 'SQL'],
    },
    {
      company: 'Follio',
      phrases: ['public resume editor'],
      summary: 'Shipped the first public editor',
      skills: [],
    },
  ],
};

function order(html: string, needles: string[]): number[] {
  return needles.map((needle) => html.indexOf(needle));
}

describe('highlights drawn into the resume', () => {
  it('shows the resume unchanged when highlights are off', () => {
    const off = renderToStaticMarkup(<CleanResumeView profile={profile} />);
    expect(off).not.toContain('glance-');
    expect(renderToStaticMarkup(<CleanResumeView profile={profile} highlights={null} />)).toBe(off);
  });

  it('places summary then tags between each company heading and its bullets', () => {
    const html = renderToStaticMarkup(<CleanResumeView profile={profile} highlights={glance} />);

    const positions = order(html, [
      'Staff engineer',
      'Made checkout faster',
      'glance-skills',
      'Cut checkout latency',
      'Founding engineer',
      'Shipped the first public editor',
      'Launched the',
    ]);
    expect(positions.every((at) => at >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);

    expect(html).toContain('<mark class="glance-mark">12M users</mark>');
    expect(html).toContain('<mark class="glance-mark">public resume editor</mark>');
    // Follio has no skills, so it gets the summary box only.
    expect(html.match(/glance-skills/g)).toHaveLength(1);
    expect(html.match(/glance-summary/g)).toHaveLength(2);
    expect(html).toContain('resume-heading-tag');
    expect(html).toContain('Full Time');
  });

  it('hides per-role duration by default and shows it on the subheading when opted in', () => {
    const hidden = renderToStaticMarkup(<CleanResumeView profile={profile} />);
    expect(hidden).not.toContain('resume-entry-subtitle-row');
    expect(hidden).not.toContain('2 yrs 1 mo');

    const shown = renderToStaticMarkup(
      <CleanResumeView
        profile={
          {
            ...profile,
            workExperiences: profile.workExperiences.map((exp) =>
              exp.id === 'w2' ? { ...exp, durationVisible: true } : exp
            ),
          } as PublicProfile
        }
      />
    );
    expect(shown).toContain('resume-entry-subtitle-row');
    expect(shown).toContain('2 yrs 1 mo');
  });

  it('groups out-of-order roles under Most Relevant and Other combined', () => {
    const html = renderToStaticMarkup(
      <CleanResumeView
        profile={
          {
            ...profile,
            sections: [
              {
                ...profile.sections[0],
                subHeadings: {
                  groups: [
                    { id: 'featured', label: 'Most Relevant', entryIds: ['w2'] },
                    { id: 'other', label: 'Other combined', catchAll: true },
                  ],
                },
              },
            ],
          } as PublicProfile
        }
      />
    );

    expect(html).toContain('resume-subheading');
    expect(html).toContain('Most Relevant');
    expect(html).toContain('Other combined');
    const positions = order(html, [
      'Most Relevant',
      'Founding engineer',
      'Other combined',
      'Staff engineer',
    ]);
    expect(positions.every((index) => index >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('promotes consecutive same-company roles and leaves singles ungrouped in repeats mode', () => {
    const html = renderToStaticMarkup(
      <CleanResumeView
        profile={
          {
            ...profile,
            workExperiences: [
              {
                id: 'w1',
                role: 'Staff engineer',
                company: 'Stripe',
                location: 'NYC',
                startDate: '2022-01-01',
                isCurrent: true,
                isVisible: true,
                bullets: ['Later role'],
              },
              {
                id: 'w1b',
                role: 'Senior engineer',
                company: 'Stripe',
                location: 'NYC',
                startDate: '2021-01-01',
                endDate: '2021-12-01',
                isCurrent: false,
                isVisible: true,
                bullets: ['Earlier role'],
              },
              {
                id: 'w2',
                role: 'Founding engineer',
                company: 'Follio',
                startDate: '2016-01-01',
                endDate: '2018-01-01',
                isCurrent: false,
                isVisible: true,
                bullets: ['Solo stint'],
              },
            ],
            sections: [
              {
                ...profile.sections[0],
                entryGrouping: 'REPEATS',
              },
            ],
          } as unknown as PublicProfile
        }
      />
    );

    expect(html).toContain('resume-org-group');
    expect(html).toContain('resume-org-name');
    expect(html).toContain('Stripe, NYC');
    expect(html.match(/Stripe, NYC/g)?.length).toBe(1);
    expect(html).toContain('Staff engineer');
    expect(html).toContain('Senior engineer');
    expect(html).toContain('Follio');
    const follioIndex = html.indexOf('Follio');
    const foundingIndex = html.indexOf('Founding engineer');
    expect(foundingIndex).toBeGreaterThan(-1);
    expect(follioIndex).toBeGreaterThan(foundingIndex);
  });

  it('uses org-on-top style for every entry in group-all mode', () => {
    const html = renderToStaticMarkup(
      <CleanResumeView
        profile={
          {
            ...profile,
            sections: [{ ...profile.sections[0], entryGrouping: 'ALL' }],
          } as unknown as PublicProfile
        }
      />
    );

    expect(html).toContain('resume-org-group');
    expect(html).toContain('Stripe');
    expect(html).toContain('Follio');
    expect((html.match(/resume-org-name/g) ?? []).length).toBe(2);
  });
});
