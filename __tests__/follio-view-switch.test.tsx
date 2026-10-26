import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FollioPage } from '@/components/follio/follio-page';
import { ResumePresentationSwitch } from '@/components/resume-presentation/resume-presentation-switch';
import { buildFollioIdentity } from '@/lib/follio-identity';
import type { PublicProfile } from '@/types';

describe('Follio view switch', () => {
  it('labels Resume and Follio, with the selected view pressed', () => {
    const html = renderToStaticMarkup(
      <ResumePresentationSwitch value="follio" onChange={() => undefined} />
    );

    expect(html).toContain('Resume');
    expect(html).toContain('Follio');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="Resume view"');
  });

  it('renders the Follio page for a resume draft', () => {
    const identity = buildFollioIdentity(
      {
        handle: 'ada',
        firstName: 'Ada',
        lastName: 'Lovelace',
        headline: 'Mathematician',
        summary: 'Wrote the first algorithm.',
        workExperiences: [
          {
            company: 'Analytical Engine',
            role: 'Chief visionary',
            isCurrent: true,
            isVisible: true,
            bullets: ['Designed the first published algorithm'],
          },
        ],
        educations: [],
        skills: [],
        links: [],
      } as unknown as PublicProfile,
      { showResume: true, showWork: false }
    );

    const html = renderToStaticMarkup(<FollioPage identity={identity} interactive={false} />);

    expect(html).toContain('Ada Lovelace');
    expect(html).toContain('Analytical Engine');
  });
});
