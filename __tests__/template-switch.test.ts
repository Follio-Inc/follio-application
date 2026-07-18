import { describe, expect, it } from 'vitest';

import {
  isTemplateBasedPlan,
  preserveUserHiddenSections,
  reconcileStyle,
} from '@/services/portfolio/enhanced-generation.service';
import { resolveWorkingPlan } from '@/services/portfolio/plan-helpers';
import type {
  TemplateKitMeta,
  TemplatePortfolio,
  TemplateSectionConfig,
} from '@/lib/portfolio/templates/types';

function makeCopy() {
  return {
    heroHeadline: 'Hi',
    heroSubtext: 'Sub',
    aboutTitle: 'About',
    aboutText: 'Text',
    contactTitle: 'Contact',
    contactSubtext: 'Reach out',
    primaryCtaLabel: 'Browse',
    seoTitle: 'Jane',
    seoDescription: 'Portfolio',
  };
}

function makePlan(templateId: string, patch: Partial<TemplatePortfolio> = {}): TemplatePortfolio {
  return {
    templateId,
    copy: makeCopy(),
    sections: [{ id: 'hero', type: 'hero', enabled: true, order: 0 }],
    style: { accentColor: '#000000', fontFamily: 'inter' },
    enrichment: null,
    ...patch,
  };
}

describe('resolveWorkingPlan', () => {
  it('prefers the client draft over saved draft and published plan', () => {
    const published = makePlan('minimal-studio', {
      copy: { ...makeCopy(), heroHeadline: 'Published' },
    });
    const savedDraft = makePlan('minimal-studio', {
      copy: { ...makeCopy(), heroHeadline: 'Saved draft' },
    });
    const clientDraft = makePlan('developer-dark', {
      copy: { ...makeCopy(), heroHeadline: 'Client draft' },
    });

    const resolved = resolveWorkingPlan(published, { draftPlan: savedDraft }, clientDraft);
    expect(resolved?.copy.heroHeadline).toBe('Client draft');
    expect(resolved?.templateId).toBe('developer-dark');
  });

  it('prefers saved draft over published plan', () => {
    const published = makePlan('minimal-studio', {
      copy: { ...makeCopy(), heroHeadline: 'Published' },
    });
    const savedDraft = makePlan('minimal-studio', {
      copy: { ...makeCopy(), heroHeadline: 'Saved draft' },
    });

    const resolved = resolveWorkingPlan(published, { draftPlan: savedDraft });
    expect(resolved?.copy.heroHeadline).toBe('Saved draft');
  });

  it('falls back to published plan when no draft exists', () => {
    const published = makePlan('minimal-studio', {
      copy: { ...makeCopy(), heroHeadline: 'Published' },
    });

    const resolved = resolveWorkingPlan(published, null);
    expect(resolved?.copy.heroHeadline).toBe('Published');
  });
});

function section(
  type: TemplateSectionConfig['type'],
  order: number,
  enabled = true
): TemplateSectionConfig {
  return { id: type, type, enabled, order };
}

const baseMeta: TemplateKitMeta = {
  id: 'demo',
  name: 'Demo',
  description: 'A demo template',
  tags: ['minimal'],
  defaultSections: [],
  defaultAppearance: 'light',
  compatibleAccentColors: [
    { name: 'Ink', value: '#111111' },
    { name: 'Blue', value: '#3b82f6' },
  ],
  compatibleFonts: [
    { id: 'inter', name: 'Inter', css: 'Inter, sans-serif' },
    { id: 'fraunces', name: 'Fraunces', css: 'Fraunces, serif' },
  ],
} as unknown as TemplateKitMeta;

describe('reconcileStyle', () => {
  it('keeps the user accent + font when the new template supports them', () => {
    const result = reconcileStyle(
      { accentColor: '#3b82f6', fontFamily: 'fraunces', appearance: 'dark' },
      baseMeta
    );
    expect(result).toEqual({ accentColor: '#3b82f6', fontFamily: 'fraunces', appearance: 'dark' });
  });

  it('falls back to the template defaults when the choices are unsupported', () => {
    const result = reconcileStyle(
      { accentColor: '#ff0000', fontFamily: 'comic-sans', appearance: 'invalid' as 'dark' },
      baseMeta
    );
    expect(result).toEqual({ accentColor: '#111111', fontFamily: 'inter', appearance: 'light' });
  });

  it('uses template defaults when no prior style exists', () => {
    const result = reconcileStyle(undefined, baseMeta);
    expect(result).toEqual({ accentColor: '#111111', fontFamily: 'inter', appearance: 'light' });
  });

  it('reconciles each field independently', () => {
    const result = reconcileStyle(
      { accentColor: '#3b82f6', fontFamily: 'comic-sans', appearance: 'system' },
      baseMeta
    );
    expect(result).toEqual({ accentColor: '#3b82f6', fontFamily: 'inter', appearance: 'system' });
  });
});

describe('preserveUserHiddenSections', () => {
  it('carries over sections the user previously disabled', () => {
    const derived = [section('hero', 0), section('skills', 1), section('about', 2)];
    const previous = [section('skills', 0, false)];

    const result = preserveUserHiddenSections(derived, previous);

    expect(result.find((s) => s.type === 'skills')?.enabled).toBe(false);
    expect(result.find((s) => s.type === 'about')?.enabled).toBe(true);
  });

  it('never disables structural sections even if previously off', () => {
    const derived = [section('navigation', 0), section('hero', 1), section('footer', 2)];
    const previous = [
      section('navigation', 0, false),
      section('hero', 1, false),
      section('footer', 2, false),
    ];

    const result = preserveUserHiddenSections(derived, previous);

    expect(result.every((s) => s.enabled)).toBe(true);
  });

  it('never force-enables a section the new template left disabled', () => {
    const derived = [section('hero', 0), section('github', 1, false)];
    const previous = [section('github', 0, true)];

    const result = preserveUserHiddenSections(derived, previous);

    expect(result.find((s) => s.type === 'github')?.enabled).toBe(false);
  });

  it('preserves the new template ordering', () => {
    const derived = [section('hero', 0), section('experience', 1), section('about', 2)];
    const previous = [section('about', 0), section('experience', 1), section('hero', 2)];

    const result = preserveUserHiddenSections(derived, previous);

    expect(result.map((s) => s.type)).toEqual(['hero', 'experience', 'about']);
  });
});

describe('isTemplateBasedPlan', () => {
  it('accepts a plan with a string templateId', () => {
    expect(isTemplateBasedPlan({ templateId: 'minimal-studio', copy: {} })).toBe(true);
  });

  it('rejects a legacy AI plan without a templateId', () => {
    expect(isTemplateBasedPlan({ sections: [], heroHeadline: 'Hi' })).toBe(false);
  });

  it('rejects a plan whose templateId is not a string', () => {
    expect(isTemplateBasedPlan({ templateId: 123 })).toBe(false);
  });

  it('rejects null / non-object plans', () => {
    expect(isTemplateBasedPlan(null)).toBe(false);
    expect(isTemplateBasedPlan(undefined)).toBe(false);
    expect(isTemplateBasedPlan('minimal-studio')).toBe(false);
  });
});
