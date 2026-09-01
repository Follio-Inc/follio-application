import { describe, expect, it } from 'vitest';

import { peekSummary, pickWikipediaTitle, scoreWikipediaHit } from '@/lib/brand-insight';
import { formatArrangement, highlightLines } from '@/lib/follio-identity';

describe('highlightLines', () => {
  it('strips HTML from resume bullets and caps length', () => {
    expect(
      highlightLines({
        bullets: ['<strong>Designed</strong> the first published algorithm', '  '],
      })
    ).toEqual(['Designed the first published algorithm']);
  });

  it('falls back to rich-text HTML when the bullet array is empty', () => {
    expect(
      highlightLines({
        bullets: [],
        bulletsHtml: '<ul><li>Shipped the compiler</li><li>Wrote the notes</li></ul>',
      })
    ).toEqual(['Shipped the compiler', 'Wrote the notes']);
  });
});

describe('formatArrangement', () => {
  it('joins employment and location type into one label', () => {
    expect(formatArrangement('FULL_TIME', 'REMOTE')).toBe('Full-time · Remote');
    expect(formatArrangement('INTERNSHIP', null)).toBe('Internship');
    expect(formatArrangement(null, null)).toBeNull();
  });
});

describe('Wikipedia insight matching', () => {
  it('picks a close company title and rejects disambiguation', () => {
    expect(
      pickWikipediaTitle(
        'Stripe',
        [
          { title: 'Stripe (disambiguation)', description: 'Topics referred to by the same name' },
          { title: 'Stripe, Inc.', description: 'Irish-American payment company' },
          { title: 'Racing stripe', description: 'Vehicle decoration' },
        ],
        'company'
      )
    ).toBe('Stripe, Inc.');
  });

  it('prefers a school page that names the institution', () => {
    expect(
      pickWikipediaTitle(
        'Stanford University',
        [
          { title: 'Stanford, California', description: 'City in California' },
          { title: 'Stanford University', description: 'Private university in California' },
        ],
        'school'
      )
    ).toBe('Stanford University');
  });

  it('returns null when nothing is close enough', () => {
    expect(
      pickWikipediaTitle('Acme Widgets', [{ title: 'Widget (economics)' }], 'company')
    ).toBeNull();
  });

  it('does not score a disambiguation page', () => {
    expect(scoreWikipediaHit('Stripe', { title: 'Stripe (disambiguation)' }, 'company')).toBe(0);
  });

  it('keeps a short extract as the peek blurb', () => {
    expect(
      peekSummary('Stripe is a payments company. It is based in South San Francisco. Extra.')
    ).toBe('Stripe is a payments company. It is based in South San Francisco.');
  });
});
