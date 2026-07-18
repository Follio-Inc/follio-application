import { describe, expect, it } from 'vitest';

import { applyDeterministicTransform } from '@/services/portfolio/content-transform.service';
import {
  ensurePlanContent,
  resolvePortfolioProfile,
  sanitizeOwnedProfileText,
  toPortfolioPlainText,
} from '@/lib/portfolio/templates/content';

import type { TemplatePortfolio, TemplateProfileData } from '@/lib/portfolio/templates/types';

function makeProfile(overrides: Partial<TemplateProfileData> = {}): TemplateProfileData {
  return {
    id: 'p1',
    handle: 'jane',
    firstName: 'Jane',
    middleName: null,
    lastName: 'Doe',
    headline: 'Designer',
    summary: null,
    avatarUrl: '/api/photos/default',
    location: null,
    contactInfo: null,
    links: [],
    workExperiences: [
      {
        id: 'exp-1',
        company: 'Acme',
        companyLogoUrl: null,
        role: 'Engineer',
        location: null,
        startDate: '2020-01-01',
        endDate: null,
        isCurrent: true,
        bullets: [
          'Responsible for building payment APIs used by millions of customers worldwide',
          'Leveraged Kubernetes to orchestrate microservices across three regions',
          'Spearheaded migration of legacy billing stack',
        ],
        isVisible: true,
      },
    ],
    educations: [],
    skills: [],
    skillGroups: [],
    projects: [
      {
        id: 'proj-1',
        title: 'Alpha',
        description:
          'A very long resume-style project description that goes on and on about implementation details, tech choices, and every minor contribution without focusing on impact or purpose for the reader of a personal portfolio website. It keeps listing responsibilities, frameworks, and internal tooling until it far exceeds a reasonable portfolio blurb length.',
        url: null,
        repoUrl: null,
        imageUrl: null,
        techStack: ['TypeScript'],
        isVisible: true,
        showOnPortfolio: true,
        ghStars: null,
        ghForks: null,
        ghLanguage: null,
      },
    ],
    certifications: [],
    awards: [],
    blogPosts: [],
    photos: [],
    github: null,
    ...overrides,
  };
}

function makePlan(content?: TemplateProfileData): TemplatePortfolio {
  return {
    templateId: 'minimal-studio',
    copy: {
      heroHeadline: 'Hi',
      heroSubtext: 'Sub',
      aboutTitle: 'About',
      aboutText: 'Text',
      contactTitle: 'Contact',
      contactSubtext: 'Reach out',
      primaryCtaLabel: 'Browse',
      seoTitle: 'Jane',
      seoDescription: 'Portfolio',
    },
    content,
    sections: [{ id: 'hero', type: 'hero', enabled: true, order: 0 }],
    style: { accentColor: '#000000', fontFamily: 'inter' },
    enrichment: null,
  };
}

describe('toPortfolioPlainText', () => {
  it('strips TipTap justify wrappers into a single line', () => {
    const html =
      '<p style="text-align: justify;">Architected and owned an enterprise RAG platform.</p>';
    expect(toPortfolioPlainText(html)).toBe('Architected and owned an enterprise RAG platform.');
  });

  it('leaves plain text unchanged', () => {
    expect(toPortfolioPlainText('  Already clean  ')).toBe('Already clean');
  });
});

describe('sanitizeOwnedProfileText', () => {
  it('preserves portfolio rich HTML and can force plain when seeding', () => {
    const dirty = makeProfile({
      summary: '<p style="text-align: justify;">About me</p>',
      workExperiences: [
        {
          id: 'exp-1',
          company: 'Acme',
          companyLogoUrl: null,
          role: 'Engineer',
          location: null,
          startDate: '2020-01-01',
          endDate: null,
          isCurrent: true,
          bullets: [
            '<p style="text-align: justify;">Architected and owned an enterprise RAG platform.</p>',
          ],
          isVisible: true,
        },
      ],
      projects: [
        {
          id: 'proj-1',
          title: 'Alpha',
          description: '<p>Built <strong>Alpha</strong> for payments.</p>',
          url: null,
          repoUrl: null,
          imageUrl: null,
          techStack: [],
          isVisible: true,
          showOnPortfolio: true,
          ghStars: null,
          ghForks: null,
          ghLanguage: null,
        },
      ],
      awards: [
        {
          id: 'aw-1',
          title: 'Best Eng',
          issuer: null,
          date: null,
          description: '<p style="text-align: center;">Top performer</p>',
          isVisible: true,
        },
      ],
    });

    const preserved = sanitizeOwnedProfileText(dirty);
    expect(preserved.summary).toBe('<p style="text-align: left;">About me</p>');
    expect(preserved.workExperiences[0].bullets[0]).toContain('Architected and owned');
    expect(preserved.workExperiences[0].bullets[0]).toContain('<p');
    expect(preserved.projects[0].description).toContain('<strong>Alpha</strong>');
    expect(preserved.awards[0].description).toBe(
      '<p style="text-align: center;">Top performer</p>'
    );

    const plain = sanitizeOwnedProfileText(dirty, { preferPlain: true });
    expect(plain.summary).toBe('About me');
    expect(plain.workExperiences[0].bullets[0]).toBe(
      'Architected and owned an enterprise RAG platform.'
    );
    expect(plain.projects[0].description).toBe('Built Alpha for payments.');
    expect(plain.awards[0].description).toBe('Top performer');
    expect(dirty.workExperiences[0].bullets[0]).toContain('<p');
  });
});

describe('applyDeterministicTransform', () => {
  it('collapses resume bullets into a single portfolio summary', () => {
    const result = applyDeterministicTransform(makeProfile());
    expect(result.workExperiences[0].bullets).toHaveLength(1);
    expect(result.workExperiences[0].bullets[0]).toContain('payment APIs');
  });

  it('strips TipTap HTML before collapsing bullets', () => {
    const result = applyDeterministicTransform(
      makeProfile({
        workExperiences: [
          {
            id: 'exp-1',
            company: 'Acme',
            companyLogoUrl: null,
            role: 'Engineer',
            location: null,
            startDate: '2020-01-01',
            endDate: null,
            isCurrent: true,
            bullets: [
              '<p style="text-align: justify;">Architected and owned an enterprise RAG-based inference platform — the firm\'s first shared GenAI capability — serving 1,000+ daily users.</p>',
              '<p style="text-align: justify;">Drove architecture decisions across retrieval pipelines.</p>',
            ],
            isVisible: true,
          },
        ],
      })
    );

    expect(result.workExperiences[0].bullets).toHaveLength(1);
    expect(result.workExperiences[0].bullets[0]).not.toMatch(/<[^>]+>/);
    expect(result.workExperiences[0].bullets[0]).toContain('enterprise RAG-based');
  });

  it('does not mutate the source profile', () => {
    const source = makeProfile();
    const originalBullets = [...source.workExperiences[0].bullets];
    applyDeterministicTransform(source);
    expect(source.workExperiences[0].bullets).toEqual(originalBullets);
  });

  it('bakes project narratives into project descriptions', () => {
    const result = applyDeterministicTransform(makeProfile(), {
      Alpha: 'Built Alpha to make payments feel instant.',
    });
    expect(result.projects[0].description).toBe('Built Alpha to make payments feel instant.');
  });

  it('strips HTML from project narratives', () => {
    const result = applyDeterministicTransform(makeProfile(), {
      Alpha: '<p>Built <em>Alpha</em> to make payments feel instant.</p>',
    });
    expect(result.projects[0].description).toBe('Built Alpha to make payments feel instant.');
  });

  it('truncates long project descriptions without narratives', () => {
    const result = applyDeterministicTransform(makeProfile());
    expect(result.projects[0].description!.length).toBeLessThanOrEqual(280);
    expect(result.projects[0].description).toMatch(/…$/);
  });
});

describe('resolvePortfolioProfile', () => {
  it('prefers portfolio-owned content over the live profile', () => {
    const live = makeProfile({ firstName: 'Live' });
    const owned = makeProfile({ firstName: 'Owned' });
    const plan = makePlan(owned);

    const resolved = resolvePortfolioProfile(plan, live);
    expect(resolved.firstName).toBe('Owned');
  });

  it('falls back to the live profile for legacy plans without content', () => {
    const live = makeProfile({ firstName: 'Live' });
    const plan = makePlan(undefined);

    const resolved = resolvePortfolioProfile(plan, live);
    expect(resolved.firstName).toBe('Live');
  });

  it('preserves Medium-style HTML when resolving owned content', () => {
    const owned = makeProfile({
      workExperiences: [
        {
          id: 'exp-1',
          company: 'Acme',
          companyLogoUrl: null,
          role: 'Engineer',
          location: null,
          startDate: '2020-01-01',
          endDate: null,
          isCurrent: true,
          bullets: ['<p style="text-align: justify;">Owned RAG platform</p>'],
          isVisible: true,
        },
      ],
    });
    const resolved = resolvePortfolioProfile(makePlan(owned), makeProfile());
    // Justify (resume default) is remapped to left; content stays rich HTML.
    expect(resolved.workExperiences[0].bullets[0]).toBe(
      '<p style="text-align: left;">Owned RAG platform</p>'
    );
  });

  it('applies media overrides on top of owned content', () => {
    const owned = makeProfile();
    const plan = makePlan(owned);
    plan.overrides = { avatarUrl: '/api/photos/custom' };

    const resolved = resolvePortfolioProfile(plan, makeProfile());
    expect(resolved.avatarUrl).toBe('/api/photos/custom');
    expect(owned.avatarUrl).toBe('/api/photos/default');
  });
});

describe('ensurePlanContent', () => {
  it('seeds content from the live profile when missing', () => {
    const live = makeProfile({ firstName: 'Live' });
    const plan = makePlan(undefined);
    const ensured = ensurePlanContent(plan, live);
    expect(ensured.content?.firstName).toBe('Live');
    expect(plan.content).toBeUndefined();
  });

  it('strips HTML when seeding from a dirty live profile', () => {
    const live = makeProfile({
      workExperiences: [
        {
          id: 'exp-1',
          company: 'Acme',
          companyLogoUrl: null,
          role: 'Engineer',
          location: null,
          startDate: '2020-01-01',
          endDate: null,
          isCurrent: true,
          bullets: ['<p style="text-align: justify;">Seeded bullet</p>'],
          isVisible: true,
        },
      ],
    });
    const ensured = ensurePlanContent(makePlan(undefined), live);
    expect(ensured.content?.workExperiences[0].bullets[0]).toBe('Seeded bullet');
  });

  it('keeps existing owned content identity fields and sanitizes rich text', () => {
    const live = makeProfile({ firstName: 'Live' });
    const owned = makeProfile({
      firstName: 'Owned',
      workExperiences: [
        {
          id: 'exp-1',
          company: 'Acme',
          companyLogoUrl: null,
          role: 'Engineer',
          location: null,
          startDate: '2020-01-01',
          endDate: null,
          isCurrent: true,
          bullets: ['<p>Dirty owned</p>'],
          isVisible: true,
        },
      ],
    });
    const plan = makePlan(owned);
    const ensured = ensurePlanContent(plan, live);
    expect(ensured.content?.firstName).toBe('Owned');
    expect(ensured.content?.workExperiences[0].bullets[0]).toBe('<p>Dirty owned</p>');
  });
});
