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
  });
});
