/**
 * Tests for Multi-Source Merger Service
 */

import { describe, expect, it } from 'vitest';
import {
  collectAllEmails,
  collectAllPhones,
  getSignupName,
  resolveEmails,
  resolveField,
  resolveName,
  resolvePhone,
  type EmailEntry,
  type NameEntry,
  type PhoneEntry,
} from '../services/multi-source-merger.service';

describe('Multi-Source Merger Service', () => {
  describe('resolveName', () => {
    it('should prioritize SIGNUP over RESUME', () => {
      const sources: NameEntry[] = [
        { firstName: 'Resume', lastName: 'User', source: 'RESUME' },
        { firstName: 'Signup', lastName: 'User', source: 'SIGNUP' },
      ];

      const result = resolveName(sources);

      expect(result.firstName).toBe('Signup');
      expect(result.lastName).toBe('User');
      expect(result.source).toBe('SIGNUP');
    });

    it('should prioritize RESUME over LINKEDIN', () => {
      const sources: NameEntry[] = [
        { firstName: 'LinkedIn', lastName: 'User', source: 'LINKEDIN' },
        { firstName: 'Resume', lastName: 'User', source: 'RESUME' },
      ];

      const result = resolveName(sources);

      expect(result.firstName).toBe('Resume');
      expect(result.source).toBe('RESUME');
    });

    it('should prioritize LINKEDIN over GITHUB', () => {
      const sources: NameEntry[] = [
        { firstName: 'GitHub', lastName: 'User', source: 'GITHUB' },
        { firstName: 'LinkedIn', lastName: 'User', source: 'LINKEDIN' },
      ];

      const result = resolveName(sources);

      expect(result.firstName).toBe('LinkedIn');
      expect(result.source).toBe('LINKEDIN');
    });

    it('should handle empty sources', () => {
      const sources: NameEntry[] = [];

      const result = resolveName(sources);

      expect(result.firstName).toBeUndefined();
      expect(result.lastName).toBeUndefined();
    });

    it('should skip entries without name', () => {
      const sources: NameEntry[] = [
        { firstName: undefined, lastName: undefined, source: 'SIGNUP' },
        { firstName: 'Resume', lastName: 'User', source: 'RESUME' },
      ];

      const result = resolveName(sources);

      expect(result.firstName).toBe('Resume');
      expect(result.source).toBe('RESUME');
    });

    it('should handle Mandarin vs Anglicized names correctly', () => {
      // Signup has Anglicized name, Resume has Mandarin name
      const sources: NameEntry[] = [
        { firstName: '明', lastName: '张', source: 'RESUME' },
        { firstName: 'Ming', lastName: 'Zhang', source: 'SIGNUP' },
      ];

      const result = resolveName(sources);

      // Signup should win
      expect(result.firstName).toBe('Ming');
      expect(result.lastName).toBe('Zhang');
      expect(result.source).toBe('SIGNUP');
    });
  });

  describe('resolveEmails', () => {
    it('should always use signup email as primary', () => {
      const signupEmail = 'signup@example.com';
      const sourceEmails: EmailEntry[] = [
        { email: 'resume@example.com', source: 'RESUME' },
        { email: 'linkedin@example.com', source: 'LINKEDIN' },
      ];

      const result = resolveEmails(signupEmail, sourceEmails);

      expect(result.primaryEmail).toBe('signup@example.com');
      expect(result.primaryEmailSource).toBe('MANUAL');
    });

    it('should collect all unique emails as additional', () => {
      const signupEmail = 'signup@example.com';
      const sourceEmails: EmailEntry[] = [
        { email: 'resume@example.com', source: 'RESUME' },
        { email: 'linkedin@example.com', source: 'LINKEDIN' },
        { email: 'github@example.com', source: 'GITHUB' },
      ];

      const result = resolveEmails(signupEmail, sourceEmails);

      expect(result.additionalEmails).toHaveLength(3);
      expect(result.additionalEmails.map((e) => e.email)).toContain('resume@example.com');
      expect(result.additionalEmails.map((e) => e.email)).toContain('linkedin@example.com');
      expect(result.additionalEmails.map((e) => e.email)).toContain('github@example.com');
    });

    it('should exclude signup email from additional emails', () => {
      const signupEmail = 'user@example.com';
      const sourceEmails: EmailEntry[] = [
        { email: 'user@example.com', source: 'RESUME' }, // Same as signup
        { email: 'other@example.com', source: 'LINKEDIN' },
      ];

      const result = resolveEmails(signupEmail, sourceEmails);

      expect(result.additionalEmails).toHaveLength(1);
      expect(result.additionalEmails[0].email).toBe('other@example.com');
    });

    it('should deduplicate emails (case insensitive)', () => {
      const signupEmail = 'signup@example.com';
      const sourceEmails: EmailEntry[] = [
        { email: 'User@Example.com', source: 'RESUME' },
        { email: 'user@example.com', source: 'LINKEDIN' },
      ];

      const result = resolveEmails(signupEmail, sourceEmails);

      expect(result.additionalEmails).toHaveLength(1);
    });

    it('should preserve original email case in output', () => {
      const signupEmail = 'signup@example.com';
      const sourceEmails: EmailEntry[] = [{ email: 'User.Name@Example.Com', source: 'RESUME' }];

      const result = resolveEmails(signupEmail, sourceEmails);

      expect(result.additionalEmails[0].email).toBe('User.Name@Example.Com');
    });

    it('should track source for each email', () => {
      const signupEmail = 'signup@example.com';
      const sourceEmails: EmailEntry[] = [
        { email: 'resume@example.com', source: 'RESUME' },
        { email: 'linkedin@example.com', source: 'LINKEDIN' },
      ];

      const result = resolveEmails(signupEmail, sourceEmails);

      const resumeEntry = result.additionalEmails.find((e) => e.email === 'resume@example.com');
      expect(resumeEntry?.source).toBe('RESUME');

      const linkedinEntry = result.additionalEmails.find((e) => e.email === 'linkedin@example.com');
      expect(linkedinEntry?.source).toBe('LINKEDIN');
    });
  });

  describe('resolvePhone', () => {
    it('should prioritize RESUME over LINKEDIN', () => {
      const sources: PhoneEntry[] = [
        { phone: '+1-555-111-1111', source: 'LINKEDIN' },
        { phone: '+1-555-222-2222', source: 'RESUME' },
      ];

      const result = resolvePhone(sources);

      expect(result?.phone).toBe('+1-555-222-2222');
      expect(result?.source).toBe('RESUME');
    });

    it('should skip empty phones', () => {
      const sources: PhoneEntry[] = [
        { phone: '', source: 'RESUME' },
        { phone: '+1-555-111-1111', source: 'LINKEDIN' },
      ];

      const result = resolvePhone(sources);

      expect(result?.phone).toBe('+1-555-111-1111');
    });

    it('should return null if no phones', () => {
      const sources: PhoneEntry[] = [];

      const result = resolvePhone(sources);

      expect(result).toBeNull();
    });
  });

  describe('resolveField', () => {
    it('should take the highest priority non-empty value', () => {
      const sources = [
        { value: 'github bio', source: 'GITHUB' },
        { value: 'resume bio', source: 'RESUME' },
        { value: 'linkedin bio', source: 'LINKEDIN' },
      ];

      const result = resolveField(sources);

      expect(result.value).toBe('resume bio');
      expect(result.source).toBe('RESUME');
    });

    it('should skip empty values', () => {
      const sources = [
        { value: '', source: 'RESUME' },
        { value: null, source: 'LINKEDIN' },
        { value: 'github bio', source: 'GITHUB' },
      ];

      const result = resolveField(sources);

      expect(result.value).toBe('github bio');
    });
  });

  describe('collectAllEmails', () => {
    it('should collect emails from all import sources', () => {
      const signupEmail = 'signup@example.com';
      const importedData = {
        resume: {
          contactInfo: { email: 'resume@example.com' },
        },
        linkedin: {
          contactInfo: { email: 'linkedin@example.com' },
        },
        github: {
          contactInfo: { email: 'github@example.com' },
        },
      };

      const result = collectAllEmails(signupEmail, importedData);

      expect(result.primaryEmail).toBe('signup@example.com');
      expect(result.additionalEmails).toHaveLength(3);
    });

    it('should handle LinkedIn email at root level (from OAuth)', () => {
      const signupEmail = 'signup@example.com';
      const importedData = {
        linkedin: {
          email: 'linkedin-oauth@example.com',
          contactInfo: {},
        },
      };

      const result = collectAllEmails(signupEmail, importedData);

      expect(result.additionalEmails).toHaveLength(1);
      expect(result.additionalEmails[0].email).toBe('linkedin-oauth@example.com');
    });

    it('should handle missing sources gracefully', () => {
      const signupEmail = 'signup@example.com';
      const importedData = {
        resume: {
          contactInfo: { email: 'resume@example.com' },
        },
        // No linkedin or github
      };

      const result = collectAllEmails(signupEmail, importedData);

      expect(result.additionalEmails).toHaveLength(1);
      expect(result.additionalEmails[0].email).toBe('resume@example.com');
    });
  });

  describe('collectAllPhones', () => {
    it('should return phone from highest priority source', () => {
      const importedData = {
        resume: {
          contactInfo: { phone: '+1-555-111-1111' },
        },
        linkedin: {
          contactInfo: { phone: '+1-555-222-2222' },
        },
      };

      const result = collectAllPhones(importedData);

      expect(result?.phone).toBe('+1-555-111-1111');
      expect(result?.source).toBe('RESUME');
    });

    it('should fall back to LinkedIn if no resume phone', () => {
      const importedData = {
        resume: {
          contactInfo: {},
        },
        linkedin: {
          contactInfo: { phone: '+1-555-222-2222' },
        },
      };

      const result = collectAllPhones(importedData);

      expect(result?.phone).toBe('+1-555-222-2222');
      expect(result?.source).toBe('LINKEDIN');
    });
  });

  describe('getSignupName', () => {
    it('should return name from Clerk user', () => {
      const clerkUser = {
        firstName: 'John',
        lastName: 'Doe',
      };

      const result = getSignupName(clerkUser);

      expect(result?.firstName).toBe('John');
      expect(result?.lastName).toBe('Doe');
    });

    it('should return null if no name', () => {
      const clerkUser = {
        firstName: null,
        lastName: null,
      };

      const result = getSignupName(clerkUser);

      expect(result).toBeNull();
    });

    it('should handle partial name', () => {
      const clerkUser = {
        firstName: 'John',
        lastName: null,
      };

      const result = getSignupName(clerkUser);

      expect(result?.firstName).toBe('John');
      expect(result?.lastName).toBeUndefined();
    });
  });
});
