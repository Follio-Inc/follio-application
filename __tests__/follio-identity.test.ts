import { describe, expect, it } from 'vitest';

import {
  buildFollioIdentity,
  buildVCard,
  canShowResumeDoor,
  canShowWorkDoor,
  cloakContactValue,
  condense,
  embedAsVisitor,
  follioCardActions,
  follioCardDoors,
  follioCardFacts,
  formatDuration,
  getFollioCompleteness,
  splitFollioLinks,
  toDialString,
  unveilContactValue,
  vcardFilename,
} from '@/lib/follio-identity';
import type { PublicProfile } from '@/types';

function link(overrides: Record<string, unknown> = {}) {
  return {
    id: 'l1',
    profileId: 'p1',
    type: 'GITHUB',
    url: 'https://github.com/ada',
    label: 'GitHub',
    isVisible: true,
    source: 'MANUAL',
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function experience(overrides: Record<string, unknown> = {}) {
  return {
    id: 'w1',
    profileId: 'p1',
    company: 'Analytical Engine',
    companyUrl: null,
    companyLogo: null,
    role: 'Chief visionary',
    location: 'London',
    locationType: null,
    employmentType: null,
    startDate: new Date('2018-01-01'),
    endDate: null,
    isCurrent: true,
    bullets: ['<strong>Designed</strong> the first published algorithm'],
    bulletsHtml: null,
    metrics: null,
    isVisible: true,
    source: 'MANUAL',
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function profile(overrides: Partial<PublicProfile> = {}): PublicProfile {
  return {
    id: 'p1',
    handle: 'ada',
    firstName: 'Ada',
    middleName: null,
    lastName: 'Lovelace',
    headline: 'Mathematician and writer',
    location: 'London',
    summary: '<p>Wrote the first algorithm.</p>',
    avatarUrl: 'https://example.com/ada.png',
    resumeVisibility: 'PUBLIC',
    portfolioVisibility: 'PUBLIC',
    status: 'PUBLIC',
    contactInfo: {
      email: 'ada@example.com',
      phone: '+44::GB 2012345678',
      website: 'https://www.ada.dev',
    },
    links: [link()],
    workExperiences: [experience()],
    skills: [
      {
        id: 's1',
        profileId: 'p1',
        name: 'Mathematics',
        level: null,
        yearsOfExp: null,
        groupId: null,
        isVisible: true,
        source: 'MANUAL',
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    skillGroups: [],
    educations: [
      {
        id: 'e1',
        profileId: 'p1',
        institution: 'University of London',
        institutionUrl: null,
        institutionLogo: null,
        degree: 'BS',
        fieldOfStudy: 'Mathematics',
        location: null,
        startDate: new Date('2014-09-01'),
        endDate: new Date('2018-05-01'),
        isCurrent: false,
        gpa: null,
        description: null,
        activities: [],
        honors: [],
        isVisible: true,
        source: 'MANUAL',
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    projects: [],
    awards: [],
    certifications: [],
    blogPosts: [],
    youtubeVideos: [],
    photos: [],
    sections: [],
    ...overrides,
  } as unknown as PublicProfile;
}

describe('buildFollioIdentity', () => {
  it('builds identity, contact, and doors', () => {
    const identity = buildFollioIdentity(profile(), { showResume: true, showWork: false });

    expect(identity.fullName).toBe('Ada Lovelace');
    expect(identity.shortName).toBe('Ada');
    expect(identity.initials).toBe('AL');
    expect(identity.contact.email).not.toContain('@');
    expect(unveilContactValue(identity.contact.email!)).toBe('ada@example.com');
    expect(identity.contact.location).toBe('London');
    expect(identity.currentRole).toEqual({
      role: 'Chief visionary',
      company: 'Analytical Engine',
      companyUrl: null,
    });
    expect(identity.doors).toEqual({ resume: true, work: false });
    expect(identity.resumeHref).toBe('/u/ada/resume');
    expect(identity.workHref).toBe('/u/ada/work');
  });

  it('makes a legacy stored phone dialable and readable', () => {
    const identity = buildFollioIdentity(profile(), { showResume: false, showWork: false });

    expect(unveilContactValue(identity.contact.phone!)).toBe('+442012345678');
    expect(identity.contact.phone).not.toContain('442012345678');
    expect(unveilContactValue(identity.contact.phoneDisplay!)).not.toContain('::');
  });

  it('strips HTML from the summary', () => {
    const identity = buildFollioIdentity(profile(), { showResume: false, showWork: false });

    expect(identity.about).toBe('Wrote the first algorithm.');
  });

  it('keeps experience to role, employer, and month-precision dates', () => {
    const identity = buildFollioIdentity(profile(), { showResume: false, showWork: false });

    expect(identity.experience[0]).toMatchObject({
      id: 'w1',
      role: 'Chief visionary',
      company: 'Analytical Engine',
      companyUrl: null,
      period: 'Jan 2018 – Present',
      isCurrent: true,
      location: 'London',
      highlights: ['Designed the first published algorithm'],
    });
    expect(identity.experience[0]?.duration).toMatch(/yr/);
  });

  it('reduces education to years', () => {
    const identity = buildFollioIdentity(profile(), { showResume: false, showWork: false });

    expect(identity.education[0]).toMatchObject({
      institution: 'University of London',
      credential: 'BS, Mathematics',
      period: '2014 – 2018',
      honors: [],
      activities: [],
    });
  });

  it('caps skills at the top five', () => {
    const skill = (name: string, order: number) => ({
      id: name,
      profileId: 'p1',
      name,
      level: null,
      yearsOfExp: null,
      groupId: null,
      isVisible: true,
      source: 'MANUAL',
      sortOrder: order,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const identity = buildFollioIdentity(
      profile({
        skills: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(
          skill
        ) as unknown as PublicProfile['skills'],
      }),
      { showResume: false, showWork: false }
    );

    expect(identity.skills).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('labels links with a handle and shortens the website host', () => {
    const identity = buildFollioIdentity(profile(), { showResume: false, showWork: false });

    expect(identity.links[0]).toMatchObject({ label: 'GitHub', detail: '@ada', kind: 'github' });
    expect(identity.contact.websiteLabel).toBe('ada.dev');
  });

  it('classifies links by type and host, including platforms stored as OTHER', () => {
    const identity = buildFollioIdentity(
      profile({
        links: [
          link({ id: 'a', type: 'MEDIUM', url: 'https://medium.com/@ada', label: 'Medium' }),
          link({ id: 'b', type: 'OTHER', url: 'https://x.com/ada', label: 'X' }),
          link({ id: 'c', type: 'OTHER', url: 'https://gitlab.com/ada', label: 'GitLab' }),
          link({
            id: 'd',
            type: 'OTHER',
            url: 'https://stackoverflow.com/users/1/ada',
            label: 'SO',
          }),
        ] as unknown as PublicProfile['links'],
      }),
      { showResume: false, showWork: false }
    );

    expect(identity.links.map((l) => l.kind)).toEqual([
      'medium',
      'twitter',
      'gitlab',
      'stackoverflow',
    ]);
    // Medium paths already carry the @, so it must not be doubled.
    expect(identity.links[0]?.detail).toBe('@ada');
  });

  it('omits hidden links and falls back to the handle when the name is missing', () => {
    const identity = buildFollioIdentity(
      profile({
        firstName: null,
        lastName: null,
        links: [link({ id: 'hidden', isVisible: false })] as unknown as PublicProfile['links'],
      }),
      { showResume: false, showWork: false }
    );

    expect(identity.fullName).toBe('ada');
    expect(identity.shortName).toBe('ada');
    expect(identity.links).toEqual([]);
  });
});

describe('toDialString', () => {
  it('normalizes stored formats and rejects unusable values', () => {
    expect(toDialString('+44::GB 2012345678')).toBe('+442012345678');
    expect(toDialString('(628) 724-1570')).toBe('6287241570');
    expect(toDialString('12')).toBeNull();
    expect(toDialString(null)).toBeNull();
  });
});

describe('formatDuration', () => {
  it('formats whole years and months inclusively', () => {
    // Jan 2020 – Dec 2020 reads as a full year, not eleven months.
    expect(formatDuration('2020-01-01', '2020-12-01', false)).toBe('1 yr');
    expect(formatDuration('2020-01-01', '2022-02-01', false)).toBe('2 yrs 2 mos');
    expect(formatDuration('2023-01-01', '2023-03-01', false)).toBe('3 mos');
  });

  it('measures a current role up to today', () => {
    const start = new Date();
    start.setUTCFullYear(start.getUTCFullYear() - 3);
    expect(formatDuration(start, null, true)).toMatch(/^3 yrs/);
  });

  it('returns null for missing or reversed dates', () => {
    expect(formatDuration(null, null, false)).toBeNull();
    expect(formatDuration('2024-01-01', '2020-01-01', false)).toBeNull();
  });
});

describe('condense', () => {
  it('keeps short text intact', () => {
    expect(condense('Short and crisp.', 240)).toBe('Short and crisp.');
  });

  it('cuts at a sentence boundary when one fits', () => {
    const text = `${'A'.repeat(30)}. ${'B'.repeat(60)}. ${'C'.repeat(60)}.`;
    const result = condense(text, 100);

    expect(result?.endsWith('.')).toBe(true);
    expect(result).not.toContain('C');
    expect(result?.length).toBeLessThanOrEqual(100);
  });

  it('falls back to a word boundary with an ellipsis', () => {
    const result = condense('alpha beta gamma delta epsilon zeta', 20);

    expect(result?.endsWith('…')).toBe(true);
    expect(result).not.toContain('zeta');
  });

  it('strips markup before measuring', () => {
    expect(condense('<p>Plain <strong>text</strong>.</p>', 240)).toBe('Plain text.');
  });
});

describe('getFollioCompleteness', () => {
  it('is ready to share with a name and public status', () => {
    const result = getFollioCompleteness({
      firstName: 'Ada',
      lastName: 'Lovelace',
      headline: 'Writer',
      avatarUrl: 'https://example.com/a.png',
      email: 'ada@example.com',
      emailPublic: true,
      phone: null,
      phonePublic: false,
      status: 'PUBLIC',
    });
    expect(result.readyToShare).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('lists missing identity pieces and unpublished state', () => {
    const result = getFollioCompleteness({
      firstName: null,
      lastName: null,
      headline: null,
      avatarUrl: null,
      email: 'hidden@example.com',
      emailPublic: false,
      phone: null,
      phonePublic: false,
      status: 'PRIVATE',
    });
    expect(result.readyToShare).toBe(false);
    expect(result.missing).toContain('Add your name');
    expect(result.missing).toContain('Make email or phone visible to visitors');
    expect(result.missing).toContain('Publish your Follio so the link works');
  });
});

describe('identity doors', () => {
  it('shows resume to visitors only when public or unlisted with access', () => {
    expect(canShowResumeDoor('PRIVATE', 'anonymous', false)).toBe(false);
    expect(canShowResumeDoor('PUBLIC', 'anonymous', false)).toBe(true);
    expect(canShowResumeDoor('UNLISTED', 'anonymous', false)).toBe(false);
    expect(canShowResumeDoor('UNLISTED', 'anonymous', true)).toBe(true);
    expect(canShowResumeDoor('PRIVATE', 'owner', false)).toBe(true);
  });

  it('hides work when the portfolio product is off', () => {
    expect(canShowWorkDoor(false, 'PUBLIC', 'anonymous', false)).toBe(false);
    expect(canShowWorkDoor(true, 'PUBLIC', 'anonymous', false)).toBe(true);
    expect(canShowWorkDoor(true, 'PRIVATE', 'anonymous', false)).toBe(false);
    expect(canShowWorkDoor(true, 'PRIVATE', 'owner', false)).toBe(true);
  });

  it('embeds the dashboard snapshot as a visitor, not the owner', () => {
    const doors = embedAsVisitor();
    expect(doors).toEqual({ authState: 'anonymous', hasUnlistedAccess: false });
    expect(canShowResumeDoor('PRIVATE', doors.authState, doors.hasUnlistedAccess)).toBe(false);
    expect(canShowResumeDoor('PUBLIC', doors.authState, doors.hasUnlistedAccess)).toBe(true);
  });
});

describe('Follio card', () => {
  it('shows Call, Email, and Save when both ways to reach them are public', () => {
    const identity = buildFollioIdentity(profile(), { showResume: true, showWork: true });
    expect(follioCardActions(identity)).toEqual(['Call', 'Email', 'Save']);
  });

  it('hides reach pills when there is no public contact', () => {
    const identity = buildFollioIdentity(
      profile({
        contactInfo: {
          email: null,
          phone: null,
          website: null,
        },
      }),
      { showResume: false, showWork: false }
    );
    expect(follioCardActions(identity)).toEqual([]);
  });

  it('lists current company, location, and school as card facts', () => {
    const identity = buildFollioIdentity(profile(), { showResume: true, showWork: false });
    expect(follioCardFacts(identity)).toEqual([
      { label: 'Now', value: 'Analytical Engine' },
      { label: 'Based in', value: 'London' },
      { label: 'Studied', value: 'University of London' },
    ]);
  });

  it('adds a previous employer when there is one besides the current role', () => {
    const identity = buildFollioIdentity(
      profile({
        workExperiences: [
          experience(),
          experience({
            id: 'w2',
            company: 'Royal Society',
            role: 'Fellow',
            isCurrent: false,
            startDate: new Date('2014-01-01'),
            endDate: new Date('2017-12-01'),
          }),
        ] as unknown as PublicProfile['workExperiences'],
      }),
      { showResume: false, showWork: false }
    );
    expect(follioCardFacts(identity)[1]).toEqual({ label: 'Previously', value: 'Royal Society' });
  });

  it('names resume and work as doors, not website chrome', () => {
    const identity = buildFollioIdentity(profile(), { showResume: true, showWork: true });
    expect(follioCardDoors(identity)).toEqual([
      { label: 'Résumé', actions: ['Open', 'Download'] },
      { label: 'Work' },
    ]);
  });

  it('omits resume door actions when the resume is not reachable', () => {
    const identity = buildFollioIdentity(profile(), { showResume: false, showWork: true });
    expect(follioCardDoors(identity)).toEqual([{ label: 'Work' }]);
  });
});

describe('vCard', () => {
  it('includes provided fields and escapes special characters', () => {
    const card = buildVCard({
      fullName: 'Ada; Lovelace',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      phone: '+442012345678',
      url: 'https://follio.me/ada',
      title: 'Mathematician',
      org: 'Analytical Engine',
      location: 'London, UK',
      socials: [{ label: 'GitHub', url: 'https://github.com/ada' }],
    });

    expect(card).toContain('BEGIN:VCARD');
    expect(card).toContain('FN:Ada\\; Lovelace');
    expect(card).toContain('N:Lovelace;Ada;;;');
    expect(card).toContain('EMAIL;TYPE=INTERNET:ada@example.com');
    expect(card).toContain('TEL;TYPE=CELL:+442012345678');
    expect(card).toContain('ADR;TYPE=WORK:;;;London\\, UK;;;');
    expect(card).toContain('X-SOCIALPROFILE;TYPE=GitHub:https://github.com/ada');
    expect(card).toContain('NOTE:Follio: https://follio.me/ada');
    expect(card).toContain('END:VCARD');
  });

  it('omits absent fields', () => {
    const card = buildVCard({ fullName: 'Ada Lovelace' });

    expect(card).not.toContain('EMAIL');
    expect(card).not.toContain('TEL');
    expect(card).not.toContain('ADR');
    expect(vcardFilename('Ada Lovelace')).toBe('ada-lovelace.vcf');
  });
});

describe('cloakContactValue', () => {
  it('round-trips email and phone without leaving harvestable plaintext', () => {
    const email = 'ada@example.com';
    const phone = '+442012345678';
    const cloakedEmail = cloakContactValue(email);
    const cloakedPhone = cloakContactValue(phone);

    expect(cloakedEmail).not.toContain('@');
    expect(cloakedEmail.toLowerCase()).not.toContain('example.com');
    expect(cloakedPhone).not.toContain(phone);
    expect(cloakedPhone).not.toContain('442012345678');
    expect(unveilContactValue(cloakedEmail)).toBe(email);
    expect(unveilContactValue(cloakedPhone)).toBe(phone);
  });

  it('leaves already-plain values untouched so unveil is safe to call twice', () => {
    expect(unveilContactValue('ada@example.com')).toBe('ada@example.com');
  });
});

describe('splitFollioLinks', () => {
  it('promotes GitHub and LinkedIn and leaves the rest for Elsewhere', () => {
    const identity = buildFollioIdentity(
      profile({
        links: [
          link({ id: 'g', type: 'GITHUB', url: 'https://github.com/ada', label: 'GitHub' }),
          link({
            id: 'li',
            type: 'LINKEDIN',
            url: 'https://linkedin.com/in/ada',
            label: 'LinkedIn',
            sortOrder: 1,
          }),
          link({
            id: 'x',
            type: 'TWITTER',
            url: 'https://x.com/ada',
            label: 'X',
            sortOrder: 2,
          }),
        ] as unknown as PublicProfile['links'],
      }),
      { showResume: false, showWork: false }
    );

    const split = splitFollioLinks(identity.links);
    expect(split.github?.label).toBe('GitHub');
    expect(split.linkedin?.label).toBe('LinkedIn');
    expect(split.elsewhere.map((item) => item.kind)).toEqual(['twitter']);
  });
});
