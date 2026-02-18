import {
  compareSourcePriority,
  mergeProfileData,
  mergeSkills,
  mergeWorkExperiences,
  previewMerge,
} from '@/services/merge.service';
import { describe, expect, it } from 'vitest';

describe('Merge Service', () => {
  describe('compareSourcePriority', () => {
    it('should prioritize MANUAL over all other sources', () => {
      expect(compareSourcePriority('MANUAL', 'GITHUB')).toBe('existing');
      expect(compareSourcePriority('MANUAL', 'LINKEDIN')).toBe('existing');
      expect(compareSourcePriority('MANUAL', 'RESUME')).toBe('existing');
      expect(compareSourcePriority('MANUAL', 'GENERATED')).toBe('existing');
    });

    it('should prioritize RESUME over GITHUB', () => {
      expect(compareSourcePriority('RESUME', 'GITHUB')).toBe('existing');
      expect(compareSourcePriority('GITHUB', 'RESUME')).toBe('incoming');
    });

    it('should return equal for same source', () => {
      expect(compareSourcePriority('GITHUB', 'GITHUB')).toBe('equal');
      expect(compareSourcePriority('MANUAL', 'MANUAL')).toBe('equal');
    });
  });

  describe('mergeProfileData', () => {
    it('should merge basic profile fields', () => {
      const existing = {
        firstName: 'John',
        lastName: 'Doe',
        headline: 'Software Engineer',
        summary: null as string | null,
        source: 'MANUAL' as const,
      };

      const incoming = {
        headline: 'Senior Software Engineer',
        summary: 'Experienced developer',
      };

      const result = mergeProfileData(existing, incoming, 'GITHUB', {
        strategy: 'replace',
        protectManualEdits: false,
        deduplicateEntries: true,
      });

      expect(result.merged.headline).toBe('Senior Software Engineer');
      expect(result.merged.summary).toBe('Experienced developer');
      expect(result.applied).toBeGreaterThan(0);
    });

    it('should protect manual edits when option is enabled', () => {
      const existing = {
        headline: 'My Custom Headline',
        source: 'MANUAL' as const,
      };

      const incoming = {
        headline: 'Imported Headline',
      };

      const result = mergeProfileData(existing, incoming, 'GITHUB', {
        strategy: 'replace',
        protectManualEdits: true,
        deduplicateEntries: true,
      });

      expect(result.merged.headline).toBe('My Custom Headline');
      expect(result.conflicts.length).toBeGreaterThan(0);
      expect(result.conflicts[0].resolution).toBe('kept_existing');
    });

    it('should skip protected fields', () => {
      const existing = {
        id: 'original-id',
        handle: 'original-handle',
        firstName: 'John',
      };

      const incoming = {
        id: 'new-id',
        handle: 'new-handle',
        firstName: 'Jane',
      };

      const result = mergeProfileData(existing, incoming, 'GITHUB', {
        strategy: 'replace',
        protectManualEdits: false,
        deduplicateEntries: true,
      });

      expect(result.merged.id).toBe('original-id');
      expect(result.merged.handle).toBe('original-handle');
      expect(result.merged.firstName).toBe('Jane');
    });

    it('should append array fields when strategy is append', () => {
      const existing = {
        skills: [{ name: 'JavaScript', sortOrder: 0 }],
      };

      const incoming = {
        skills: [{ name: 'TypeScript', sortOrder: 0 }],
      };

      const result = mergeProfileData(existing, incoming, 'GITHUB', {
        strategy: 'append',
        protectManualEdits: false,
        deduplicateEntries: true,
      });

      expect(result.merged.skills).toHaveLength(2);
    });
  });

  describe('mergeSkills', () => {
    it('should deduplicate skills by name', () => {
      const existing = [
        { name: 'JavaScript', level: 'EXPERT' },
        { name: 'React', level: 'ADVANCED' },
      ];

      const incoming = [
        { name: 'javascript', level: 'INTERMEDIATE' }, // duplicate (case insensitive)
        { name: 'TypeScript', level: 'ADVANCED' },
      ];

      const result = mergeSkills(existing, incoming);

      expect(result).toHaveLength(3);
      expect(result.map((s) => s.name)).toContain('JavaScript');
      expect(result.map((s) => s.name)).toContain('React');
      expect(result.map((s) => s.name)).toContain('TypeScript');
    });

    it('should handle empty arrays', () => {
      expect(mergeSkills([], [])).toHaveLength(0);
      expect(mergeSkills([{ name: 'JS' }], [])).toHaveLength(1);
      expect(mergeSkills([], [{ name: 'JS' }])).toHaveLength(1);
    });
  });

  describe('mergeWorkExperiences', () => {
    it('should deduplicate by company and role', () => {
      const existing = [{ company: 'Google', role: 'Software Engineer', startDate: new Date() }];

      const incoming = [
        { company: 'google', role: 'software engineer', startDate: new Date() }, // duplicate
        { company: 'Meta', role: 'Engineer', startDate: new Date() },
      ];

      const result = mergeWorkExperiences(existing, incoming);

      expect(result).toHaveLength(2);
      expect(result.map((e) => e.company)).toContain('Google');
      expect(result.map((e) => e.company)).toContain('Meta');
    });

    it('should not deduplicate when option is disabled', () => {
      const existing = [{ company: 'Google', role: 'Software Engineer', startDate: new Date() }];

      const incoming = [{ company: 'Google', role: 'Software Engineer', startDate: new Date() }];

      const result = mergeWorkExperiences(existing, incoming, {
        deduplicateByCompanyRole: false,
      });

      expect(result).toHaveLength(2);
    });
  });

  describe('previewMerge', () => {
    it('should generate preview of changes', () => {
      const existing = {
        firstName: 'John',
        lastName: 'Doe',
        headline: 'Engineer',
      };

      const incoming = {
        headline: 'Senior Engineer',
        location: 'NYC',
      };

      const preview = previewMerge(existing, incoming, 'GITHUB');

      expect(preview).toHaveLength(2);
      expect(preview.find((p) => p.field === 'headline')).toBeDefined();
      expect(preview.find((p) => p.field === 'location')).toBeDefined();
    });

    it('should skip unchanged fields', () => {
      const existing = { firstName: 'John' };
      const incoming = { firstName: 'John' };

      const preview = previewMerge(existing, incoming, 'GITHUB');

      expect(preview).toHaveLength(0);
    });

    it('should skip null/undefined incoming values', () => {
      const existing = { firstName: 'John', lastName: 'Doe' };
      const incoming = { firstName: undefined, lastName: undefined };

      const preview = previewMerge(existing, incoming, 'GITHUB');

      expect(preview).toHaveLength(0);
    });
  });
});
