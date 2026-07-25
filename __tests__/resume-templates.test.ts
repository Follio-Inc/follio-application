import { describe, expect, it } from 'vitest';

import {
  buildDefaultDesignForTemplate,
  buildDesignForTemplateSwitch,
  DEFAULT_RESUME_TEMPLATE_ID,
  getAllResumeTemplates,
  getResumeTemplateId,
  getTemplateDefaultShowPhoto,
  isResumeAtelierRailSectionType,
  isResumeSidebarSectionType,
  isValidResumeTemplateId,
} from '@/lib/resume/templates';

describe('resume templates registry', () => {
  it('lists classic, lumen, sleek, studio, and atelier', () => {
    const ids = getAllResumeTemplates().map((t) => t.id);
    expect(ids).toEqual(['classic', 'lumen', 'sleek', 'studio', 'atelier']);
  });

  it('defaults unknown template ids to classic', () => {
    expect(getResumeTemplateId(undefined)).toBe(DEFAULT_RESUME_TEMPLATE_ID);
    expect(getResumeTemplateId('nope')).toBe('classic');
    expect(getResumeTemplateId('sidebar')).toBe('classic');
    expect(isValidResumeTemplateId('sidebar')).toBe(false);
    expect(isValidResumeTemplateId('sleek')).toBe(true);
    expect(isValidResumeTemplateId('studio')).toBe(true);
    expect(isValidResumeTemplateId('atelier')).toBe(true);
    expect(isValidResumeTemplateId('lumen')).toBe(true);
    expect(isValidResumeTemplateId('portfolio')).toBe(false);
  });

  it('identifies sidebar column sections', () => {
    expect(isResumeSidebarSectionType('SKILLS')).toBe(true);
    expect(isResumeSidebarSectionType('EXPERIENCE')).toBe(false);
  });

  it('identifies atelier right-rail sections', () => {
    expect(isResumeAtelierRailSectionType('EDUCATION')).toBe(true);
    expect(isResumeAtelierRailSectionType('SKILLS')).toBe(true);
    expect(isResumeAtelierRailSectionType('SUMMARY')).toBe(false);
    expect(isResumeAtelierRailSectionType('EXPERIENCE')).toBe(false);
  });

  it('declares a clear photo default per template', () => {
    expect(getTemplateDefaultShowPhoto('classic')).toBe(false);
    expect(getTemplateDefaultShowPhoto('lumen')).toBe(false);
    expect(getTemplateDefaultShowPhoto('sleek')).toBe(true);
    expect(getTemplateDefaultShowPhoto('studio')).toBe(true);
    expect(getTemplateDefaultShowPhoto('atelier')).toBe(false);
    expect(getTemplateDefaultShowPhoto('unknown')).toBe(false);
  });

  it('restores classic defaults including centered header and italic title', () => {
    const restored = buildDefaultDesignForTemplate('classic');
    expect(restored.templateId).toBe('classic');
    expect(restored.fontFamily).toBe('georgia');
    expect(restored.nameFontFamily).toBe('georgia');
    expect(restored.titleFontFamily).toBe('georgia');
    expect(restored.headingFontFamily).toBe('system');
    expect(restored.contactFontFamily).toBe('system');
    expect(restored.headerAlignment).toBe('center');
    expect(restored.headerPhotoLayout).toBe('photo-left');
    expect(restored.photoSize).toBe(80);
    expect(restored.nameStyle.bold).toBe(true);
    expect(restored.titleStyle.italic).toBe(true);
    expect(restored.headingStyle.bold).toBe(true);
    expect(restored.bodyStyle.bold).toBe(false);
    expect(restored.nameFontSize).toBe(28);
    expect(restored.titleFontSize).toBe(15);
  });

  it('restores atelier defaults without switching template to classic', () => {
    const restored = buildDefaultDesignForTemplate('atelier');
    expect(restored.templateId).toBe('atelier');
    expect(restored.fontFamily).toBe('garamond');
    expect(restored.nameFontFamily).toBe('great-vibes');
    expect(restored.titleFontFamily).toBe('lato');
    expect(restored.headingFontFamily).toBe('lato');
    expect(restored.titleFontSize).toBe(11);
    expect(restored.headingFontSize).toBe(12);
    expect(restored.headingColor).toBe('#C25B42');
    expect(restored.accentColor).toBe('#C25B42');
    expect(restored.headerAlignment).toBe('left');
    expect(restored.nameStyle.bold).toBe(false);
    expect(restored.titleStyle.italic).toBe(false);
    expect(restored.colorTheme).toBe('light');
    expect(restored.justifyAll).toBe(false);
  });

  it('restores sleek defaults without switching template to classic', () => {
    const restored = buildDefaultDesignForTemplate('sleek');
    expect(restored.templateId).toBe('sleek');
    expect(restored.fontFamily).toBe('lato');
    expect(restored.headingColor).toBe('#1f2d3d');
    expect(restored.accentColor).toBe('#8f9aa8');
    expect(restored.headerAlignment).toBe('left');
    expect(restored.headerPhotoLayout).toBe('photo-left');
    expect(restored.photoSize).toBe(64);
    expect(restored.nameStyle.bold).toBe(true);
    expect(restored.titleStyle.italic).toBe(false);
  });

  it('restores studio defaults with open-sans and left header', () => {
    const restored = buildDefaultDesignForTemplate('studio');
    expect(restored.templateId).toBe('studio');
    expect(restored.fontFamily).toBe('open-sans');
    expect(restored.nameFontFamily).toBe('open-sans');
    expect(restored.contactFontFamily).toBe('open-sans');
    expect(restored.headerAlignment).toBe('left');
    expect(restored.photoSize).toBe(64);
    expect(restored.headingColor).toBe('#1a1a1a');
    expect(restored.accentColor).toBe('#7a9aa5');
    expect(restored.titleFontSize).toBe(13);
    expect(restored.headingFontSize).toBe(13);
  });

  it('restores lumen defaults without switching template to classic', () => {
    const restored = buildDefaultDesignForTemplate('lumen');
    expect(restored.templateId).toBe('lumen');
    expect(restored.fontFamily).toBe('instrument-sans');
    expect(restored.nameFontFamily).toBe('instrument-sans');
    expect(restored.titleFontFamily).toBe('instrument-sans');
    expect(restored.headingFontFamily).toBe('instrument-sans');
    expect(restored.contactFontFamily).toBe('instrument-sans');
    expect(restored.headerAlignment).toBe('left');
    expect(restored.photoSize).toBe(80);
    expect(restored.headingColor).toBe('#171717');
    expect(restored.accentColor).toBe('#b0aaa3');
    expect(restored.nameFontSize).toBe(30);
    expect(restored.titleFontSize).toBe(13);
    expect(restored.headingFontSize).toBe(11);
    expect(restored.titleStyle.italic).toBe(false);
  });

  it('switches template without dropping unrelated design fields', () => {
    const next = buildDesignForTemplateSwitch(
      {
        templateId: 'classic',
        colorTheme: 'dark',
        justifyAll: true,
        pageLayout: 'letter',
        fontSize: 14,
        nameFontSize: 32,
        headingColor: '#ff0000',
        accentColor: '#00ff00',
      },
      'sleek'
    );

    expect(next.templateId).toBe('sleek');
    expect(next.colorTheme).toBe('dark');
    expect(next.justifyAll).toBe(true);
    expect(next.pageLayout).toBe('letter');
    expect(next.fontSize).toBe(14);
    expect(next.nameFontSize).toBe(32);
    // Custom colors preserved
    expect(next.headingColor).toBe('#ff0000');
    expect(next.accentColor).toBe('#00ff00');
    // Typography/layout defaults from sleek applied
    expect(next.fontFamily).toBe('lato');
    expect(next.headerAlignment).toBe('left');
    expect(next.headerPhotoLayout).toBe('photo-left');
  });

  it('applies recommended colors when previous colors matched prior template defaults', () => {
    const next = buildDesignForTemplateSwitch(
      {
        templateId: 'classic',
        headingColor: '#000000',
        accentColor: '#000000',
      },
      'sleek'
    );

    expect(next.headingColor).toBe('#1f2d3d');
    expect(next.accentColor).toBe('#8f9aa8');
  });

  it('applies lumen Instrument Sans defaults on switch from classic', () => {
    const next = buildDesignForTemplateSwitch(
      {
        templateId: 'classic',
        headingColor: '#000000',
        accentColor: '#000000',
      },
      'lumen'
    );

    expect(next.templateId).toBe('lumen');
    expect(next.fontFamily).toBe('instrument-sans');
    expect(next.nameFontFamily).toBe('instrument-sans');
    expect(next.headingColor).toBe('#171717');
    expect(next.accentColor).toBe('#b0aaa3');
    expect(next.headerAlignment).toBe('left');
  });

  it('applies atelier terracotta defaults on switch from classic', () => {
    const next = buildDesignForTemplateSwitch(
      {
        templateId: 'classic',
        headingColor: '#000000',
        accentColor: '#000000',
      },
      'atelier'
    );

    expect(next.templateId).toBe('atelier');
    expect(next.fontFamily).toBe('garamond');
    expect(next.nameFontFamily).toBe('great-vibes');
    expect(next.titleFontFamily).toBe('lato');
    expect(next.headingFontFamily).toBe('lato');
    expect(next.headingColor).toBe('#C25B42');
    expect(next.accentColor).toBe('#C25B42');
  });

  it('applies studio typography defaults on switch from classic', () => {
    const next = buildDesignForTemplateSwitch(
      {
        templateId: 'classic',
        headingColor: '#000000',
        accentColor: '#000000',
      },
      'studio'
    );

    expect(next.templateId).toBe('studio');
    expect(next.fontFamily).toBe('open-sans');
    expect(next.headerAlignment).toBe('left');
    expect(next.headingColor).toBe('#1a1a1a');
    expect(next.accentColor).toBe('#7a9aa5');
  });
});
