import {
  formatDefaultResumeTitle,
  formatResumeDownloadFilename,
  getDefaultResumeTitleBase,
  isDefaultResumeTitlePattern,
  suggestCloneResumeTitle,
  suggestDefaultResumeTitle,
  withResumeTitleSequence,
} from '@/lib/resume-title';
import { describe, expect, it } from 'vitest';

describe('resume-title', () => {
  describe('formatDefaultResumeTitle', () => {
    it('formats as Resume-Mon-DD-YY', () => {
      expect(formatDefaultResumeTitle(new Date(2026, 6, 3))).toBe('Resume-Jul-03-26');
    });

    it('zero-pads single-digit days', () => {
      expect(formatDefaultResumeTitle(new Date(2026, 0, 5))).toBe('Resume-Jan-05-26');
    });

    it('uses two-digit year', () => {
      expect(formatDefaultResumeTitle(new Date(1999, 11, 31))).toBe('Resume-Dec-31-99');
    });
  });

  describe('isDefaultResumeTitlePattern', () => {
    it('matches auto-generated titles', () => {
      expect(isDefaultResumeTitlePattern('Resume-Jul-25-26')).toBe(true);
      expect(isDefaultResumeTitlePattern('Resume-Jul-03-26')).toBe(true);
      expect(isDefaultResumeTitlePattern('Resume-Jul-03-26_02')).toBe(true);
      expect(isDefaultResumeTitlePattern('Resume-Jul-03-26-2')).toBe(true);
    });

    it('rejects custom renamed titles', () => {
      expect(isDefaultResumeTitlePattern('Kriti_Thakur')).toBe(false);
      expect(isDefaultResumeTitlePattern('Software Engineer Resume')).toBe(false);
      expect(isDefaultResumeTitlePattern('Resume')).toBe(false);
    });
  });

  describe('getDefaultResumeTitleBase', () => {
    it('strips same-day sequence suffixes', () => {
      expect(getDefaultResumeTitleBase('Resume-Jul-25-26')).toBe('Resume-Jul-25-26');
      expect(getDefaultResumeTitleBase('Resume-Jul-25-26_02')).toBe('Resume-Jul-25-26');
      expect(getDefaultResumeTitleBase('Resume-Jul-25-26-2')).toBe('Resume-Jul-25-26');
    });

    it('returns null for custom titles', () => {
      expect(getDefaultResumeTitleBase('Kriti_Thakur')).toBeNull();
      expect(getDefaultResumeTitleBase('Kriti_Thakur_2')).toBeNull();
    });
  });

  describe('suggestDefaultResumeTitle', () => {
    it('returns the base date title when unused', () => {
      expect(suggestDefaultResumeTitle(new Date(2026, 6, 25), [])).toBe('Resume-Jul-25-26');
    });

    it('adds _02 when the same-date title already exists', () => {
      expect(suggestDefaultResumeTitle(new Date(2026, 6, 25), ['Resume-Jul-25-26'])).toBe(
        'Resume-Jul-25-26_02'
      );
    });

    it('adds _03 when base and _02 already exist', () => {
      expect(
        suggestDefaultResumeTitle(new Date(2026, 6, 25), [
          'Resume-Jul-25-26',
          'Resume-Jul-25-26_02',
        ])
      ).toBe('Resume-Jul-25-26_03');
    });
  });

  describe('suggestCloneResumeTitle', () => {
    it('uses today date pattern when cloning a date-pattern title', () => {
      expect(suggestCloneResumeTitle('Resume-Jan-05-26', new Date(2026, 6, 25))).toBe(
        'Resume-Jul-25-26'
      );
      expect(suggestCloneResumeTitle('Resume-Jan-05-26_02', new Date(2026, 6, 25))).toBe(
        'Resume-Jul-25-26'
      );
    });

    it('prefills _02 when cloning onto a date that already has a resume', () => {
      expect(
        suggestCloneResumeTitle('Resume-Jan-05-26', new Date(2026, 6, 25), ['Resume-Jul-25-26'])
      ).toBe('Resume-Jul-25-26_02');
    });

    it('appends _2 when cloning a custom title', () => {
      expect(suggestCloneResumeTitle('Kriti_Thakur', new Date(2026, 6, 25))).toBe('Kriti_Thakur_2');
    });

    it('increments trailing _N on custom titles', () => {
      expect(suggestCloneResumeTitle('Kriti_Thakur_2', new Date(2026, 6, 25))).toBe(
        'Kriti_Thakur_3'
      );
    });

    it('falls back to today date pattern for empty source titles', () => {
      expect(suggestCloneResumeTitle('  ', new Date(2026, 6, 25))).toBe('Resume-Jul-25-26');
    });
  });

  describe('withResumeTitleSequence', () => {
    it('returns the base title for sequence 1', () => {
      expect(withResumeTitleSequence('Resume-Jul-03-26', 1)).toBe('Resume-Jul-03-26');
    });

    it('appends zero-padded _NN for date-pattern duplicates', () => {
      expect(withResumeTitleSequence('Resume-Jul-03-26', 2)).toBe('Resume-Jul-03-26_02');
      expect(withResumeTitleSequence('Resume-Jul-03-26', 3)).toBe('Resume-Jul-03-26_03');
      expect(withResumeTitleSequence('Resume-Jul-03-26', 10)).toBe('Resume-Jul-03-26_10');
    });

    it('appends -N for custom title duplicates', () => {
      expect(withResumeTitleSequence('Kriti_Thakur', 2)).toBe('Kriti_Thakur-2');
    });
  });

  describe('formatResumeDownloadFilename', () => {
    it('uses the resume title as the download filename', () => {
      expect(formatResumeDownloadFilename('Resume-Jul-03-26')).toBe('Resume-Jul-03-26');
      expect(formatResumeDownloadFilename('Resume-Jul-03-26_02')).toBe('Resume-Jul-03-26_02');
    });

    it('preserves custom resume titles', () => {
      expect(formatResumeDownloadFilename('Software Engineer Resume')).toBe(
        'Software_Engineer_Resume'
      );
    });

    it('falls back to Resume when title is missing', () => {
      expect(formatResumeDownloadFilename(null)).toBe('Resume');
      expect(formatResumeDownloadFilename(undefined)).toBe('Resume');
      expect(formatResumeDownloadFilename('  ')).toBe('Resume');
    });
  });
});
