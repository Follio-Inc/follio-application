import {
  formatDefaultResumeTitle,
  formatResumeDownloadFilename,
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

  describe('withResumeTitleSequence', () => {
    it('returns the base title for sequence 1', () => {
      expect(withResumeTitleSequence('Resume-Jul-03-26', 1)).toBe('Resume-Jul-03-26');
    });

    it('appends -N starting from 2', () => {
      expect(withResumeTitleSequence('Resume-Jul-03-26', 2)).toBe('Resume-Jul-03-26-2');
      expect(withResumeTitleSequence('Resume-Jul-03-26', 3)).toBe('Resume-Jul-03-26-3');
    });
  });

  describe('formatResumeDownloadFilename', () => {
    it('uses the resume title as the download filename', () => {
      expect(formatResumeDownloadFilename('Resume-Jul-03-26')).toBe('Resume-Jul-03-26');
      expect(formatResumeDownloadFilename('Resume-Jul-03-26-2')).toBe('Resume-Jul-03-26-2');
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
