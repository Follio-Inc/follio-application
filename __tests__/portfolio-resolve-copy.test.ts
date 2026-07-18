import { describe, expect, it } from 'vitest';

import {
  resolveProjectDescription,
  resolveSectionHeading,
} from '@/lib/portfolio/templates/resolve-copy';

import type { TemplateCopy } from '@/lib/portfolio/templates/types';

function makeCopy(patch: Partial<TemplateCopy> = {}): TemplateCopy {
  return {
    heroHeadline: 'Hi',
    heroSubtext: 'Sub',
    aboutTitle: 'About',
    aboutText: 'Text',
    contactTitle: 'Contact',
    contactSubtext: 'Reach out',
    primaryCtaLabel: 'Get in touch',
    seoTitle: 'Jane',
    seoDescription: 'Portfolio',
    ...patch,
  };
}

describe('resolveProjectDescription', () => {
  it('prefers owned project description over generation narratives', () => {
    const copy = makeCopy({
      projectNarratives: { Alpha: 'Ghost narrative that should not win' },
    });
    expect(
      resolveProjectDescription(
        { title: 'Alpha', description: 'Edited in the portfolio editor' },
        copy
      )
    ).toBe('Edited in the portfolio editor');
  });

  it('falls back to narrative only when description is empty', () => {
    const copy = makeCopy({
      projectNarratives: { Alpha: 'Legacy narrative' },
    });
    expect(resolveProjectDescription({ title: 'Alpha', description: null }, copy)).toBe(
      'Legacy narrative'
    );
  });
});

describe('resolveSectionHeading', () => {
  const defaults = {
    projects: { eyebrow: 'Selected Work', title: "Things I've made" },
    experience: { eyebrow: '', title: 'Experience' },
  };

  it('uses template defaults when overrides are blank', () => {
    expect(resolveSectionHeading(makeCopy(), 'projects', defaults)).toEqual({
      eyebrow: 'Selected Work',
      title: "Things I've made",
    });
  });

  it('prefers non-empty user overrides', () => {
    const copy = makeCopy({
      sectionHeadings: {
        projects: { eyebrow: 'Work', title: 'My projects' },
      },
    });
    expect(resolveSectionHeading(copy, 'projects', defaults)).toEqual({
      eyebrow: 'Work',
      title: 'My projects',
    });
  });

  it('supports title-only templates like Developer Dark', () => {
    expect(resolveSectionHeading(makeCopy(), 'experience', defaults)).toEqual({
      eyebrow: '',
      title: 'Experience',
    });
  });
});
