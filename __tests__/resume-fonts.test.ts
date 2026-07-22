import { describe, expect, it } from 'vitest';

import {
  buildResumeDesignStyles,
  mergeResumeDesign,
  resolveResumeFonts,
} from '@/lib/resume-design';
import { buildDesignForTemplateSwitch } from '@/lib/resume/templates';

describe('resolveResumeFonts', () => {
  it('falls name back to body, title to body, contact to system, and headings to system UI', () => {
    expect(resolveResumeFonts({ fontFamily: 'lato' })).toEqual({
      body: 'lato',
      name: 'lato',
      title: 'lato',
      heading: 'system',
      contact: 'system',
    });
  });

  it('uses explicit name, title, heading, and contact fonts when set', () => {
    expect(
      resolveResumeFonts({
        fontFamily: 'georgia',
        nameFontFamily: 'merriweather',
        titleFontFamily: 'raleway',
        headingFontFamily: 'inter',
        contactFontFamily: 'open-sans',
      })
    ).toEqual({
      body: 'georgia',
      name: 'merriweather',
      title: 'raleway',
      heading: 'inter',
      contact: 'open-sans',
    });
  });

  it('preserves Atelier script name + Lato title/headings/contact when unset', () => {
    expect(resolveResumeFonts({ templateId: 'atelier', fontFamily: 'garamond' })).toEqual({
      body: 'garamond',
      name: 'great-vibes',
      title: 'lato',
      heading: 'lato',
      contact: 'lato',
    });
  });

  it('keeps title independent from headings when only heading is set', () => {
    expect(
      resolveResumeFonts({
        fontFamily: 'georgia',
        headingFontFamily: 'raleway',
        titleFontFamily: 'inter',
      })
    ).toEqual({
      body: 'georgia',
      name: 'georgia',
      title: 'inter',
      heading: 'raleway',
      contact: 'system',
    });
  });

  it('uses template body font when only templateId is set', () => {
    expect(resolveResumeFonts({ templateId: 'studio' })).toEqual({
      body: 'open-sans',
      name: 'open-sans',
      title: 'open-sans',
      heading: 'system',
      contact: 'open-sans',
    });

    expect(resolveResumeFonts({ templateId: 'lumen' })).toEqual({
      body: 'instrument-sans',
      name: 'instrument-sans',
      title: 'instrument-sans',
      heading: 'instrument-sans',
      contact: 'instrument-sans',
    });
  });
});

describe('buildResumeDesignStyles fonts', () => {
  it('emits CSS vars for body, name, title, and heading', () => {
    const styles = buildResumeDesignStyles({
      fontFamily: 'inter',
      nameFontFamily: 'great-vibes',
      titleFontFamily: 'raleway',
      headingFontFamily: 'lato',
      titleFontSize: 14,
      headingFontSize: 11,
      nameStyle: { bold: true, italic: false, underline: true },
      titleStyle: { bold: false, italic: true, underline: false },
    }) as Record<string, string>;

    expect(styles['--rd-font-family']).toContain('Inter');
    expect(styles['--rd-font-body']).toContain('Inter');
    expect(styles['--rd-font-name']).toContain('Great Vibes');
    expect(styles['--rd-font-title']).toContain('Raleway');
    expect(styles['--rd-font-heading']).toContain('Lato');
    expect(styles['--rd-title-font-size']).toBe('14px');
    expect(styles['--rd-heading-font-size']).toBe('11px');
    expect(styles['--rd-name-font-weight']).toBe('700');
    expect(styles['--rd-name-text-decoration']).toBe('underline');
    expect(styles['--rd-title-font-style']).toBe('italic');
  });

  it('emits photo size CSS variable', () => {
    const styles = buildResumeDesignStyles({ photoSize: 96 }) as Record<string, string>;
    expect(styles['--rd-photo-size']).toBe('96px');
  });
});

describe('mergeResumeDesign', () => {
  it('resolves font roles onto Required design', () => {
    const merged = mergeResumeDesign({ fontFamily: 'roboto' });
    expect(merged.fontFamily).toBe('roboto');
    expect(merged.nameFontFamily).toBe('roboto');
    expect(merged.titleFontFamily).toBe('roboto');
    expect(merged.headingFontFamily).toBe('system');
    expect(merged.contactFontFamily).toBe('system');
  });

  it('uses template photo size when unset', () => {
    expect(mergeResumeDesign({ templateId: 'classic' }).photoSize).toBe(80);
    expect(mergeResumeDesign({ templateId: 'sleek' }).photoSize).toBe(64);
    expect(mergeResumeDesign({ templateId: 'studio' }).photoSize).toBe(64);
    expect(mergeResumeDesign({ templateId: 'sleek', photoSize: 100 }).photoSize).toBe(100);
  });

  it('uses template title/heading/contact sizes when unset', () => {
    const studio = mergeResumeDesign({ templateId: 'studio' });
    expect(studio.titleFontSize).toBe(13);
    expect(studio.headingFontSize).toBe(13);
    expect(studio.contactFontFamily).toBe('open-sans');
    expect(studio.contactFontSize).toBe(12);

    const atelier = mergeResumeDesign({ templateId: 'atelier' });
    expect(atelier.titleFontSize).toBe(11);
    expect(atelier.headingFontSize).toBe(12);
    expect(atelier.contactFontFamily).toBe('lato');
    expect(atelier.contactFontSize).toBe(11.5);
  });
});

describe('template switch fonts', () => {
  it('applies Atelier name/title/heading/contact defaults on switch', () => {
    const next = buildDesignForTemplateSwitch(
      { fontFamily: 'georgia', templateId: 'classic' },
      'atelier'
    );
    expect(next.fontFamily).toBe('garamond');
    expect(next.nameFontFamily).toBe('great-vibes');
    expect(next.titleFontFamily).toBe('lato');
    expect(next.headingFontFamily).toBe('lato');
    expect(next.contactFontFamily).toBe('lato');
  });
});

describe('getTemplateDefaultFont', () => {
  it('returns per-role template defaults', async () => {
    const { getTemplateDefaultFont } = await import('@/lib/resume-design');
    expect(getTemplateDefaultFont('atelier', 'name')).toBe('great-vibes');
    expect(getTemplateDefaultFont('atelier', 'contact')).toBe('lato');
    expect(getTemplateDefaultFont('classic', 'heading')).toBe('system');
    expect(getTemplateDefaultFont('sleek', 'body')).toBe('lato');
  });
});
