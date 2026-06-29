import { describe, expect, it } from 'vitest';

import {
  applyPortfolioOverrides,
  getDraftPlan,
  hasUnpublishedChanges,
  resolveAboutStyle,
  resolveEffectiveAvatar,
  resolveEffectiveProjectImage,
  resolvePortraitStyle,
  resolveSkillsStyle,
  resolveWorkStyle,
} from '@/lib/portfolio/templates/overrides';
import { parseTemplatePortfolio } from '@/lib/portfolio/templates/validation';

import type { TemplatePortfolio, TemplateProfileData } from '@/lib/portfolio/templates/types';

function makeProfile(): TemplateProfileData {
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
    workExperiences: [],
    educations: [],
    skills: [],
    skillGroups: [],
    projects: [
      {
        id: 'proj-1',
        title: 'Alpha',
        description: null,
        url: null,
        repoUrl: null,
        imageUrl: '/api/photos/alpha',
        techStack: [],
        isVisible: true,
        showOnPortfolio: true,
        ghStars: null,
        ghForks: null,
        ghLanguage: null,
      },
      {
        id: 'proj-2',
        title: 'Beta',
        description: null,
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
    certifications: [],
    awards: [],
    blogPosts: [],
    photos: [],
    github: null,
  };
}

function makePlan(): TemplatePortfolio {
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
    sections: [
      { id: 'hero', type: 'hero', enabled: true, order: 0 },
      { id: 'work', type: 'projects', enabled: true, order: 1 },
    ],
    style: { accentColor: '#000000', fontFamily: 'inter' },
    enrichment: null,
  };
}

describe('applyPortfolioOverrides', () => {
  it('returns the same reference when there are no overrides', () => {
    const profile = makeProfile();
    expect(applyPortfolioOverrides(profile, null)).toBe(profile);
    expect(applyPortfolioOverrides(profile, {})).toBe(profile);
  });

  it('replaces the avatar with an override URL', () => {
    const profile = makeProfile();
    const result = applyPortfolioOverrides(profile, { avatarUrl: '/api/photos/custom' });
    expect(result.avatarUrl).toBe('/api/photos/custom');
    expect(profile.avatarUrl).toBe('/api/photos/default'); // input untouched
  });

  it('hides the avatar when override is explicitly null', () => {
    const result = applyPortfolioOverrides(makeProfile(), { avatarUrl: null });
    expect(result.avatarUrl).toBeNull();
  });

  it('applies per-project image overrides and leaves others untouched', () => {
    const result = applyPortfolioOverrides(makeProfile(), {
      projectImages: { 'proj-1': null, 'proj-2': '/api/photos/beta' },
    });
    const alpha = result.projects.find((p) => p.id === 'proj-1');
    const beta = result.projects.find((p) => p.id === 'proj-2');
    expect(alpha?.imageUrl).toBeNull();
    expect(beta?.imageUrl).toBe('/api/photos/beta');
  });
});

describe('resolveEffective helpers', () => {
  it('falls back to profile values when no override key exists', () => {
    expect(resolveEffectiveAvatar('/api/photos/default', {})).toBe('/api/photos/default');
    expect(resolveEffectiveProjectImage('proj-1', '/api/photos/alpha', {})).toBe(
      '/api/photos/alpha'
    );
  });

  it('honors explicit null overrides', () => {
    expect(resolveEffectiveAvatar('/api/photos/default', { avatarUrl: null })).toBeNull();
    expect(
      resolveEffectiveProjectImage('proj-1', '/api/photos/alpha', {
        projectImages: { 'proj-1': null },
      })
    ).toBeNull();
  });

  it('resolves portrait style with defaults, overrides, and legacy migration', () => {
    expect(resolvePortraitStyle(null)).toBe('style-1');
    expect(resolvePortraitStyle({ portraitStyle: 'style-4' })).toBe('style-4');
    expect(resolvePortraitStyle({ portraitStyle: 'invalid' as 'style-1' })).toBe('style-1');
    expect(resolvePortraitStyle({ portraitLayout: { size: 'large', align: 'right' } })).toBe(
      'style-2'
    );
    expect(resolvePortraitStyle({ portraitLayout: { size: 'large', align: 'left' } })).toBe(
      'style-3'
    );
    expect(resolvePortraitStyle({ portraitLayout: { size: 'medium', align: 'left' } })).toBe(
      'style-4'
    );
    expect(resolvePortraitStyle({ portraitLayout: { size: 'small', align: 'right' } })).toBe(
      'style-5'
    );
  });

  it('resolves section layout styles with defaults and overrides', () => {
    expect(resolveWorkStyle(null)).toBe('editorial');
    expect(resolveWorkStyle({ workStyle: 'gallery' })).toBe('gallery');
    expect(resolveWorkStyle({ workStyle: 'nope' as 'grid' })).toBe('editorial');

    expect(resolveAboutStyle(null)).toBe('sidebar');
    expect(resolveAboutStyle({ aboutStyle: 'statement' })).toBe('statement');
    expect(resolveAboutStyle({ aboutStyle: 'nope' as 'centered' })).toBe('sidebar');

    expect(resolveSkillsStyle(null)).toBe('columns');
    expect(resolveSkillsStyle({ skillsStyle: 'columns' })).toBe('columns');
    expect(resolveSkillsStyle({ skillsStyle: 'rows' })).toBe('rows');
    expect(resolveSkillsStyle({ skillsStyle: 'nope' as 'inline' })).toBe('columns');
  });
});

describe('draft helpers', () => {
  it('extracts a valid draft plan from userOverrides', () => {
    const plan = makePlan();
    expect(getDraftPlan({ draftPlan: plan })).toEqual(plan);
  });

  it('returns null for missing or malformed drafts', () => {
    expect(getDraftPlan(null)).toBeNull();
    expect(getDraftPlan({})).toBeNull();
    expect(getDraftPlan({ draftPlan: { foo: 'bar' } })).toBeNull();
  });

  it('detects unpublished changes', () => {
    const published = makePlan();
    expect(hasUnpublishedChanges(published, null)).toBe(false);
    expect(hasUnpublishedChanges(published, makePlan())).toBe(false);
    const edited = makePlan();
    edited.copy.heroHeadline = 'Changed';
    expect(hasUnpublishedChanges(published, edited)).toBe(true);
  });
});

describe('parseTemplatePortfolio', () => {
  it('accepts a valid portfolio with overrides', () => {
    const plan = makePlan();
    plan.overrides = {
      avatarUrl: '/api/photos/x',
      portraitStyle: 'style-2',
      workStyle: 'gallery',
      aboutStyle: 'centered',
      skillsStyle: 'columns',
      projectImages: { 'proj-1': null },
    };
    expect(() => parseTemplatePortfolio(plan)).not.toThrow();
  });

  it('rejects unknown section layout styles', () => {
    const plan = makePlan();
    plan.overrides = { workStyle: 'fancy' as 'grid' };
    expect(() => parseTemplatePortfolio(plan)).toThrow();
  });

  it('accepts editable section headings', () => {
    const plan = makePlan();
    plan.copy.sectionHeadings = {
      projects: { eyebrow: 'My Work', title: 'Selected projects' },
      experience: { title: 'Career so far' },
    };
    const parsed = parseTemplatePortfolio(plan);
    expect(parsed.copy.sectionHeadings?.projects?.title).toBe('Selected projects');
  });

  it('rejects a portfolio missing required fields', () => {
    expect(() => parseTemplatePortfolio({ templateId: 'x' })).toThrow();
    expect(() => parseTemplatePortfolio({ ...makePlan(), sections: 'nope' })).toThrow();
  });
});
