import { describe, expect, it } from 'vitest';

import {
  COVER_LETTER_CONTENT_DEFAULTS,
  COVER_LETTER_DESIGN_DEFAULTS,
  coverLetterBodyParagraphs,
  designFromResumePaper,
  mergeCoverLetterContent,
  mergeCoverLetterDesign,
  validateCoverLetterDesignPatch,
} from '@/lib/cover-letter';
import {
  DOCUMENT_DESIGN_DEFAULTS,
  buildDocumentDesignStyles,
  pickDocumentDesign,
  resolveDocumentPageLayout,
} from '@/lib/document-design';
import { buildResumeDesignStyles, mergeResumeDesign } from '@/lib/resume-design';

describe('document-design shared core', () => {
  it('exposes the locked resume paper defaults', () => {
    expect(DOCUMENT_DESIGN_DEFAULTS.colorTheme).toBe('light');
    expect(DOCUMENT_DESIGN_DEFAULTS.fontFamily).toBe('georgia');
    expect(DOCUMENT_DESIGN_DEFAULTS.pageLayout).toBe('continuous');
  });

  it('builds the same --rd-* token keys for resume and cover letter', () => {
    const resumeStyles = buildResumeDesignStyles(mergeResumeDesign(null));
    const letterDesign = mergeCoverLetterDesign(null);
    const letterStyles = buildDocumentDesignStyles({
      headingColor: letterDesign.headingColor,
      accentColor: letterDesign.accentColor,
      fonts: {
        body: letterDesign.fontFamily,
        name: letterDesign.nameFontFamily,
        title: letterDesign.fontFamily,
        heading: letterDesign.headingFontFamily,
        contact: letterDesign.headingFontFamily,
      },
      textStyles: {
        name: letterDesign.nameStyle,
        title: letterDesign.bodyStyle,
        heading: letterDesign.headingStyle,
        body: letterDesign.bodyStyle,
        contact: letterDesign.bodyStyle,
      },
      fontSize: letterDesign.fontSize,
      nameFontSize: letterDesign.nameFontSize,
      titleFontSize: letterDesign.fontSize,
      headingFontSize: letterDesign.headingFontSize,
      contactFontSize: letterDesign.fontSize,
      photoSize: 80,
      headerAlignment: 'left',
      density: letterDesign.density,
      dividerStyle: letterDesign.dividerStyle,
      justifyAll: letterDesign.justifyAll,
    });

    expect(Object.keys(resumeStyles).sort()).toEqual(Object.keys(letterStyles).sort());
    expect(resumeStyles).toHaveProperty('--rd-heading-color');
    expect(letterStyles).toHaveProperty('--rd-font-body');
  });

  it('picks only shared paper fields from a resume design', () => {
    const picked = pickDocumentDesign({
      ...DOCUMENT_DESIGN_DEFAULTS,
      templateId: 'classic',
      photoSize: 64,
      headingColor: '#112233',
    } as never);
    expect(picked.headingColor).toBe('#112233');
    expect(picked).not.toHaveProperty('templateId');
    expect(picked).not.toHaveProperty('photoSize');
  });
});

describe('cover letter design', () => {
  it('merges defaults with classic template', () => {
    const merged = mergeCoverLetterDesign(null);
    expect(merged.templateId).toBe('classic');
    expect(merged.colorTheme).toBe(COVER_LETTER_DESIGN_DEFAULTS.colorTheme);
  });

  it('copies shared paper fields from a resume design', () => {
    const fromResume = designFromResumePaper({
      colorTheme: 'dark',
      headingColor: '#abcdef',
      accentColor: '#123456',
      fontFamily: 'inter',
      density: 'compact',
      pageLayout: 'a4',
    });
    expect(fromResume.colorTheme).toBe('dark');
    expect(fromResume.headingColor).toBe('#abcdef');
    expect(fromResume.fontFamily).toBe('inter');
    expect(fromResume.pageLayout).toBe('a4');
    expect(fromResume.templateId).toBe('classic');
    expect(resolveDocumentPageLayout(fromResume)).toBe('a4');
  });

  it('validates shared design patches', () => {
    const ok = validateCoverLetterDesignPatch({
      colorTheme: 'dark',
      fontSize: 14,
      templateId: 'classic',
    });
    expect(ok.valid).toBe(true);
    expect(ok.data?.colorTheme).toBe('dark');
    expect(ok.data?.fontSize).toBe(14);

    const bad = validateCoverLetterDesignPatch({ colorTheme: 'neon' });
    expect(bad.valid).toBe(false);
  });
});

describe('cover letter content', () => {
  it('merges content defaults', () => {
    const merged = mergeCoverLetterContent({ body: 'Hello' });
    expect(merged.body).toBe('Hello');
    expect(merged.greeting).toBe(COVER_LETTER_CONTENT_DEFAULTS.greeting);
  });

  it('splits body into paragraphs', () => {
    expect(coverLetterBodyParagraphs('One\n\nTwo\n\nThree')).toEqual(['One', 'Two', 'Three']);
    expect(coverLetterBodyParagraphs('')).toEqual([]);
  });
});
