import { describe, expect, it } from 'vitest';

import {
  bulletLines,
  buildGlanceFacts,
  companyKey,
  factsAreEmpty,
  type GlanceFacts,
} from '@/lib/resume/glance-facts';
import { groundGlance } from '@/lib/resume/glance-ground';
import { highlightsByEntry, markPhrasesInHtml } from '@/lib/resume/glance-marks';
import { buildGlanceUserPrompt, GLANCE_SYSTEM_PROMPT } from '@/lib/resume/glance-prompt';
import { GLANCE_LIMITS, glanceHasNotes, parseResumeGlance } from '@/lib/resume/glance';
import type { PublicProfile } from '@/types';

function profile(overrides: Partial<PublicProfile> = {}): PublicProfile {
  return {
    id: 'p1',
    handle: 'ada',
    firstName: 'Ada',
    middleName: null,
    lastName: 'Lovelace',
    headline: 'Engineer',
    summary: null,
    totalExperience: null,
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

const denseFacts: GlanceFacts = {
  companies: [
    {
      company: 'Stripe',
      roles: [
        {
          title: 'Staff engineer',
          dates: 'Jan 2021 - Present',
          bullets: [
            'Cut checkout latency by 40% for 12M users with Go and SQL',
            'Led the payments migration to Kubernetes',
          ],
        },
        {
          title: 'Engineer',
          dates: 'Mar 2018 - Dec 2020',
          bullets: ['Shipped the first billing API in Go'],
        },
      ],
    },
    {
      company: 'Follio',
      roles: [
        {
          title: 'Founding engineer',
          dates: 'Jun 2016 - Feb 2018',
          bullets: ['Launched the public resume editor in React'],
        },
      ],
    },
  ],
};

describe('highlights prompt', () => {
  it('asks for one impact line, the key skills, and marker phrases per company', () => {
    expect(GLANCE_SYSTEM_PROMPT).toMatch(/light-green highlighter/);
    expect(GLANCE_SYSTEM_PROMPT).toMatch(/"summary"/);
    expect(GLANCE_SYSTEM_PROMPT).toMatch(/"skills"/);
    expect(GLANCE_SYSTEM_PROMPT).toMatch(/"phrases"/);
    expect(GLANCE_SYSTEM_PROMPT).toMatch(/One sentence, one line/);
    expect(GLANCE_SYSTEM_PROMPT).toContain(String(GLANCE_LIMITS.summaryChars));
    expect(GLANCE_SYSTEM_PROMPT).toMatch(/what changed because this person was there/);
    expect(GLANCE_SYSTEM_PROMPT).toContain(`the ${GLANCE_LIMITS.skills} key skills`);
    expect(GLANCE_SYSTEM_PROMPT).toMatch(/give fewer rather than pad/);
    expect(GLANCE_SYSTEM_PROMPT).toMatch(/character for character/);
    expect(GLANCE_SYSTEM_PROMPT).toMatch(/Never a whole bullet/);
    expect(GLANCE_SYSTEM_PROMPT).toMatch(/Several roles at one company belong to one job/);
  });

  it('keeps the honesty rules and returns JSON only', () => {
    expect(GLANCE_SYSTEM_PROMPT).toMatch(/Use only what the packet says/);
    expect(GLANCE_SYSTEM_PROMPT).toMatch(/Copy company names exactly/);
    expect(GLANCE_SYSTEM_PROMPT).toMatch(/Never invent a metric, a number, a title, a skill/);
    expect(GLANCE_SYSTEM_PROMPT).toMatch(/Never reuse their words, numbers, or companies/);
    expect(GLANCE_SYSTEM_PROMPT).toMatch(/Skip a company whose bullets are only duties/);
    expect(GLANCE_SYSTEM_PROMPT).toMatch(/Return JSON only/);
  });

  it('no longer asks for overview, school, or extra stickies', () => {
    expect(GLANCE_SYSTEM_PROMPT).not.toMatch(/"overview"|"schools"|"extras"|sticky/i);
  });

  it('sends the experience facts and nothing else', () => {
    const prompt = buildGlanceUserPrompt({ companies: denseFacts.companies.slice(0, 1) });
    expect(prompt).toContain('If a list below is empty, that fact does not exist');
    expect(prompt).toContain('"Stripe"');
    expect(prompt).toContain('Cut checkout latency by 40%');
    expect(prompt).not.toContain('Follio');
  });
});

describe('glance facts', () => {
  it('keeps several roles at one company on one fact, in career order', () => {
    const built = buildGlanceFacts(
      profile({
        workExperiences: [
          {
            id: 'w2',
            role: 'Staff engineer',
            company: 'Stripe',
            startDate: new Date('2021-01-01'),
            isCurrent: true,
            isVisible: true,
            bullets: ['Cut checkout latency by 40%'],
            sortOrder: 0,
          },
          {
            id: 'w1',
            role: 'Engineer',
            company: 'Stripe, Inc.',
            startDate: new Date('2018-03-01'),
            endDate: new Date('2020-12-01'),
            isCurrent: false,
            isVisible: true,
            bullets: ['Shipped the first billing API'],
            sortOrder: 1,
          },
        ] as unknown as PublicProfile['workExperiences'],
      })
    );

    expect(built.companies).toHaveLength(1);
    expect(built.companies[0]?.company).toBe('Stripe');
    expect(companyKey('Stripe, Inc.')).toBe(companyKey('Stripe'));
    expect(built.companies[0]?.roles.map((role) => role.title)).toEqual([
      'Staff engineer',
      'Engineer',
    ]);
  });

  it('splits editor HTML into one line per bullet', () => {
    expect(
      bulletLines({
        bulletsHtml:
          '<ul><li><p>Cut latency by <strong>40%</strong></p></li><li><p>R&amp;D&nbsp;lead</p></li></ul>',
      })
    ).toEqual(['Cut latency by 40%', 'R&D lead']);
  });

  it('is empty when no experience has a bullet', () => {
    expect(factsAreEmpty(buildGlanceFacts(profile()))).toBe(true);
    expect(factsAreEmpty({ companies: [{ company: 'Acme', roles: [] }] })).toBe(true);
    expect(factsAreEmpty(denseFacts)).toBe(false);
  });
});

describe('groundGlance', () => {
  it('keeps exact phrases, one summary, and skills the bullets prove', () => {
    const glance = groundGlance(denseFacts, {
      companies: [
        {
          company: 'Stripe',
          phrases: ['cut checkout latency by 40%', '12M users', 'payments migration'],
          summary: 'Cut checkout latency by 40% and led the payments migration',
          skills: ['go', 'Kubernetes', 'Figma', 'SQL', 'Kotlin'],
        },
        {
          company: 'Follio',
          phrases: ['public resume editor'],
          summary: 'Launched the public resume editor from zero',
          skills: ['React', 'Go'],
        },
      ],
    });

    expect(glance.companies).toHaveLength(2);
    expect(glance.companies[0]).toEqual({
      company: 'Stripe',
      // The bullet's own casing, so the mark matches the page.
      phrases: ['Cut checkout latency by 40%', '12M users', 'payments migration'],
      summary: 'Cut checkout latency by 40% and led the payments migration',
      skills: ['Go', 'Kubernetes', 'SQL'],
    });
    // Go is a Stripe skill; it is not on Follio's bullets.
    expect(glance.companies[1]?.skills).toEqual(['React']);
  });

  it('drops phrases that are not on the page, cover a whole bullet, or overlap', () => {
    const glance = groundGlance(denseFacts, {
      companies: [
        {
          company: 'Stripe',
          phrases: [
            'Cut checkout latency by 50%',
            'Shipped the first billing API in Go',
            'checkout latency',
            'latency by 40%',
            'Led the payments migration to Kube',
          ],
          summary: null,
          skills: [],
        },
      ],
    });

    expect(glance.companies[0]?.phrases).toEqual(['checkout latency']);
  });

  it('drops a summary that invents a number or repeats a single bullet', () => {
    const invented = groundGlance(denseFacts, {
      companies: [{ company: 'Follio', phrases: [], summary: 'Grew editor use by 300%' }],
    });
    expect(invented.companies).toEqual([]);

    const repeated = groundGlance(denseFacts, {
      companies: [
        {
          company: 'Follio',
          phrases: [],
          summary: 'Launched the public resume editor in React.',
          skills: [],
        },
      ],
    });
    expect(repeated.companies).toEqual([]);
  });

  it('caps the summary length and the number of tags and phrases', () => {
    const glance = groundGlance(denseFacts, {
      companies: [
        {
          company: 'Stripe',
          phrases: Array.from({ length: 12 }, () => 'Go'),
          summary: `Cut checkout latency ${'and led the payments migration '.repeat(5)}`,
          skills: ['Go', 'SQL', 'Kubernetes', 'API', 'Billing', 'Checkout'],
        },
      ],
    });
    const stripe = glance.companies[0];
    expect(stripe?.summary).toBeNull();
    expect(stripe?.skills).toHaveLength(GLANCE_LIMITS.skills);
    expect(stripe?.phrases.length).toBeLessThanOrEqual(GLANCE_LIMITS.phrases);
  });

  it('accepts a practice the bullets show, and nothing they do not', () => {
    const glance = groundGlance(denseFacts, {
      companies: [
        {
          company: 'Stripe',
          phrases: ['12M users'],
          summary: null,
          skills: [
            'Leadership',
            'Payments Migration',
            'Data Migration',
            'Communication',
            'Kotlin',
            'Latency Optimization',
          ],
        },
      ],
    });
    // "Led" proves leadership; "payments migration" is on the page.
    // Nothing on the page says data, communication, Kotlin, or optimization.
    expect(glance.companies[0]?.skills).toEqual(['Leadership', 'Payments Migration']);
  });

  it('does not mark a lone word', () => {
    const glance = groundGlance(denseFacts, {
      companies: [{ company: 'Stripe', phrases: ['Kubernetes', '12M users'], summary: null }],
    });
    expect(glance.companies[0]?.phrases).toEqual(['12M users']);
  });

  it('skips a company whose bullets are only duties', () => {
    const office: GlanceFacts = {
      companies: [
        {
          company: 'Office',
          roles: [
            {
              title: 'Assistant',
              dates: '2020',
              bullets: ['Responsible for filing', 'Worked on weekly reports'],
            },
          ],
        },
      ],
    };
    const glance = groundGlance(office, {
      companies: [
        {
          company: 'Office',
          phrases: ['weekly reports'],
          summary: 'Kept weekly reports on time',
          skills: ['filing'],
        },
      ],
    });
    expect(glance.companies).toEqual([]);
  });

  it('merges a model that splits one employer into two objects', () => {
    const glance = groundGlance(denseFacts, {
      companies: [
        { company: 'Stripe', phrases: ['12M users'], summary: null, skills: ['Go'] },
        {
          company: 'Stripe, Inc.',
          phrases: ['first billing API'],
          summary: 'Shipped billing and cut checkout latency',
          skills: ['SQL'],
        },
      ],
    });
    expect(glance.companies).toHaveLength(1);
    expect(glance.companies[0]).toMatchObject({
      phrases: ['12M users', 'first billing API'],
      summary: 'Shipped billing and cut checkout latency',
      skills: ['Go', 'SQL'],
    });
  });

  it('ignores companies that are not in the packet and junk payloads', () => {
    expect(
      groundGlance(denseFacts, {
        companies: [{ company: 'Imaginary Lab', phrases: ['Go'], summary: 'Shipped Go' }],
      }).companies
    ).toEqual([]);
    expect(groundGlance(denseFacts, 'nope')).toEqual({ version: 2, companies: [] });
    expect(groundGlance(denseFacts, { companies: 'nope' }).companies).toEqual([]);
  });
});

describe('parseResumeGlance', () => {
  it('reads a stored version 2 glance', () => {
    const glance = parseResumeGlance({
      version: 2,
      companies: [{ company: 'Stripe', phrases: ['12M users'], summary: 'Cut', skills: ['Go'] }],
    });
    expect(glance).toEqual({
      version: 2,
      companies: [{ company: 'Stripe', phrases: ['12M users'], summary: 'Cut', skills: ['Go'] }],
    });
    expect(glanceHasNotes(glance)).toBe(true);
  });

  it('keeps a version 1 company impact and skills until the next save', () => {
    const glance = parseResumeGlance({
      version: 1,
      overview: { impacts: ['x'], skills: [] },
      companies: [{ company: 'Stripe', impact: 'Cut checkout latency', skills: ['Go'] }],
      schools: [{ school: 'State' }],
      extras: [],
    });
    expect(glance).toEqual({
      version: 2,
      companies: [
        { company: 'Stripe', phrases: [], summary: 'Cut checkout latency', skills: ['Go'] },
      ],
    });
  });

  it('reads broken payloads as no highlights', () => {
    expect(parseResumeGlance(null)).toBeNull();
    expect(parseResumeGlance({ version: 9 })).toBeNull();
    expect(parseResumeGlance({ version: 2, companies: [{ company: 'Empty' }] })).toEqual({
      version: 2,
      companies: [],
    });
    expect(glanceHasNotes(parseResumeGlance({ version: 2 }))).toBe(false);
  });
});

describe('markPhrasesInHtml', () => {
  it('wraps the first appearance of each phrase and leaves the rest of the bullet alone', () => {
    const html =
      '<ul><li><p>Cut checkout latency by 40% for 12M users. Latency matters.</p></li></ul>';
    expect(markPhrasesInHtml(html, ['checkout latency', '12M users'])).toBe(
      '<ul><li><p>Cut <mark class="glance-mark">checkout latency</mark> by 40% for ' +
        '<mark class="glance-mark">12M users</mark>. Latency matters.</p></li></ul>'
    );
  });

  it('matches through HTML entities, ignores case, and never touches tags or attributes', () => {
    const html = '<p style="text-align: justify" class="go">Led R&amp;D&nbsp;hiring in GO</p>';
    expect(markPhrasesInHtml(html, ['R&D hiring', 'go'])).toBe(
      '<p style="text-align: justify" class="go">Led <mark class="glance-mark">R&amp;D&nbsp;hiring</mark> in <mark class="glance-mark">GO</mark></p>'
    );
  });

  it('does not mark inside a longer word or across a formatting tag', () => {
    const html = '<p>Joined Google to cut <strong>40%</strong> of spend</p>';
    expect(markPhrasesInHtml(html, ['Go', '40% of spend'])).toBe(html);
  });

  it('never splits an HTML entity', () => {
    expect(markPhrasesInHtml('<p>R&amp;D</p>', ['amp'])).toBe('<p>R&amp;D</p>');
  });

  it('prefers the longer phrase when two overlap', () => {
    expect(
      markPhrasesInHtml('<p>payments migration to Kubernetes</p>', [
        'payments',
        'payments migration',
      ])
    ).toBe('<p><mark class="glance-mark">payments migration</mark> to Kubernetes</p>');
  });

  it('returns the markup unchanged with no phrases', () => {
    expect(markPhrasesInHtml('<p>x</p>', [])).toBe('<p>x</p>');
  });
});

describe('highlightsByEntry', () => {
  const glance = parseResumeGlance({
    version: 2,
    companies: [
      { company: 'Stripe', phrases: ['12M users'], summary: 'Cut latency', skills: ['Go'] },
      { company: 'Follio', phrases: ['resume editor'], summary: null, skills: [] },
    ],
  });

  it('puts the boxes under the first role of a company and marks every role', () => {
    const map = highlightsByEntry(
      [
        { id: 'a', company: 'Stripe' },
        { id: 'b', company: 'Stripe, Inc.' },
        { id: 'c', company: 'Follio' },
        { id: 'd', company: 'Acme' },
      ],
      glance
    );

    expect(map.get('a')).toEqual({
      phrases: ['12M users'],
      insert: { summary: 'Cut latency', skills: ['Go'] },
    });
    expect(map.get('b')).toEqual({ phrases: ['12M users'], insert: null });
    // Marks only: no summary and no skills means no boxes.
    expect(map.get('c')).toEqual({ phrases: ['resume editor'], insert: null });
    // A company with no highlights is unchanged.
    expect(map.has('d')).toBe(false);
  });

  it('draws nothing when highlights are off', () => {
    expect(highlightsByEntry([{ id: 'a', company: 'Stripe' }], null).size).toBe(0);
  });
});
