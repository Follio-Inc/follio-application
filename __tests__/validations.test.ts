/**
 * Validations Unit Tests
 *
 * Tests for Zod validation schemas in lib/validations.ts
 */

import {
  ApiErrorSchema,
  AwardSchema,
  CertificationSchema,
  ContactInfoSchema,
  CreateProfileSchema,
  DataSourceSchema,
  EducationSchema,
  EmploymentTypeSchema,
  GitHubImportSchema,
  HandleSchema,
  LinkSchema,
  LinkTypeSchema,
  LinkedInImportSchema,
  LinksArraySchema,
  LocationTypeSchema,
  PaginationSchema,
  ProfileBasicInfoSchema,
  ProfileStatusSchema,
  ProjectSchema,
  ResumeUploadSchema,
  SkillGroupSchema,
  SkillLevelSchema,
  SkillSchema,
  UpdateProfileSchema,
  WorkExperienceSchema,
  normalizeCurrentDates,
} from '@/lib/validations';
import { describe, expect, it } from 'vitest';

describe('Validation Schemas', () => {
  describe('Enum Schemas', () => {
    it('ProfileStatusSchema should accept valid values', () => {
      expect(ProfileStatusSchema.parse('DRAFT')).toBe('DRAFT');
      expect(ProfileStatusSchema.parse('PUBLIC')).toBe('PUBLIC');
      expect(ProfileStatusSchema.parse('PRIVATE')).toBe('PRIVATE');
    });

    it('ProfileStatusSchema should reject invalid values', () => {
      expect(() => ProfileStatusSchema.parse('INVALID')).toThrow();
    });

    it('DataSourceSchema should accept valid values', () => {
      expect(DataSourceSchema.parse('MANUAL')).toBe('MANUAL');
      expect(DataSourceSchema.parse('GITHUB')).toBe('GITHUB');
      expect(DataSourceSchema.parse('RESUME')).toBe('RESUME');
      expect(DataSourceSchema.parse('LINKEDIN')).toBe('LINKEDIN');
      expect(DataSourceSchema.parse('GENERATED')).toBe('GENERATED');
    });

    it('LinkTypeSchema should accept valid values', () => {
      const validTypes = [
        'GITHUB',
        'LINKEDIN',
        'TWITTER',
        'PORTFOLIO',
        'BLOG',
        'DRIBBBLE',
        'BEHANCE',
        'YOUTUBE',
        'OTHER',
      ];
      validTypes.forEach((type) => {
        expect(LinkTypeSchema.parse(type)).toBe(type);
      });
    });

    it('SkillLevelSchema should accept valid values', () => {
      expect(SkillLevelSchema.parse('BEGINNER')).toBe('BEGINNER');
      expect(SkillLevelSchema.parse('INTERMEDIATE')).toBe('INTERMEDIATE');
      expect(SkillLevelSchema.parse('ADVANCED')).toBe('ADVANCED');
      expect(SkillLevelSchema.parse('EXPERT')).toBe('EXPERT');
    });

    it('LocationTypeSchema should accept valid values', () => {
      expect(LocationTypeSchema.parse('ONSITE')).toBe('ONSITE');
      expect(LocationTypeSchema.parse('REMOTE')).toBe('REMOTE');
      expect(LocationTypeSchema.parse('HYBRID')).toBe('HYBRID');
    });

    it('EmploymentTypeSchema should accept valid values', () => {
      const validTypes = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'FREELANCE', 'INTERNSHIP'];
      validTypes.forEach((type) => {
        expect(EmploymentTypeSchema.parse(type)).toBe(type);
      });
    });
  });

  describe('HandleSchema', () => {
    it('should accept valid handles', () => {
      expect(HandleSchema.parse('john-doe')).toBe('john-doe');
      expect(HandleSchema.parse('abc')).toBe('abc');
      expect(HandleSchema.parse('john123')).toBe('john123');
      expect(HandleSchema.parse('a1b')).toBe('a1b');
    });

    it('should reject handles that are too short', () => {
      expect(() => HandleSchema.parse('ab')).toThrow(/at least 3 characters/);
    });

    it('should reject handles that are too long', () => {
      expect(() => HandleSchema.parse('a'.repeat(31))).toThrow(/at most 30 characters/);
    });

    it('should reject handles starting with hyphen', () => {
      expect(() => HandleSchema.parse('-john')).toThrow();
    });

    it('should reject handles ending with hyphen', () => {
      expect(() => HandleSchema.parse('john-')).toThrow();
    });

    it('should reject handles with uppercase', () => {
      expect(() => HandleSchema.parse('John')).toThrow();
    });

    it('should reject handles with spaces', () => {
      expect(() => HandleSchema.parse('john doe')).toThrow();
    });
  });

  describe('ProfileBasicInfoSchema', () => {
    it('should accept valid profile info', () => {
      const data = {
        firstName: 'John',
        lastName: 'Doe',
        headline: 'Software Engineer',
        summary: 'Experienced developer',
        location: 'San Francisco, CA',
        avatarUrl: 'https://example.com/avatar.jpg',
      };
      expect(() => ProfileBasicInfoSchema.parse(data)).not.toThrow();
    });

    it('should require firstName', () => {
      const data = { lastName: 'Doe' };
      expect(() => ProfileBasicInfoSchema.parse(data)).toThrow();
    });

    it('should allow empty avatarUrl', () => {
      const data = { firstName: 'John', avatarUrl: '' };
      expect(() => ProfileBasicInfoSchema.parse(data)).not.toThrow();
    });

    it('should reject invalid avatarUrl', () => {
      const data = { firstName: 'John', avatarUrl: 'not-a-url' };
      expect(() => ProfileBasicInfoSchema.parse(data)).toThrow();
    });

    it('should reject firstName that is too long', () => {
      const data = { firstName: 'a'.repeat(51) };
      expect(() => ProfileBasicInfoSchema.parse(data)).toThrow();
    });
  });

  describe('CreateProfileSchema', () => {
    it('should accept valid create profile data', () => {
      const data = {
        handle: 'john-doe',
        firstName: 'John',
        lastName: 'Doe',
      };
      expect(() => CreateProfileSchema.parse(data)).not.toThrow();
    });

    it('should require handle and firstName', () => {
      expect(() => CreateProfileSchema.parse({ firstName: 'John' })).toThrow();
      expect(() => CreateProfileSchema.parse({ handle: 'john-doe' })).toThrow();
    });
  });

  describe('UpdateProfileSchema', () => {
    it('should make all fields optional', () => {
      expect(() => UpdateProfileSchema.parse({})).not.toThrow();
      expect(() => UpdateProfileSchema.parse({ firstName: 'John' })).not.toThrow();
    });
  });

  describe('ContactInfoSchema', () => {
    it('should accept valid contact info', () => {
      const data = {
        email: 'john@example.com',
        emailPublic: true,
        phone: '+1234567890',
        phonePublic: false,
        website: 'https://example.com',
      };
      expect(() => ContactInfoSchema.parse(data)).not.toThrow();
    });

    it('should accept empty email', () => {
      expect(() => ContactInfoSchema.parse({ email: '' })).not.toThrow();
    });

    it('should reject invalid email', () => {
      expect(() => ContactInfoSchema.parse({ email: 'not-an-email' })).toThrow();
    });

    it('should accept empty website', () => {
      expect(() => ContactInfoSchema.parse({ website: '' })).not.toThrow();
    });

    it('should reject invalid website', () => {
      expect(() => ContactInfoSchema.parse({ website: 'not-a-url' })).toThrow();
    });
  });

  describe('LinkSchema', () => {
    it('should accept valid link', () => {
      const data = {
        type: 'GITHUB',
        url: 'https://github.com/johndoe',
        label: 'GitHub Profile',
      };
      expect(() => LinkSchema.parse(data)).not.toThrow();
    });

    it('should require type and url', () => {
      expect(() => LinkSchema.parse({ type: 'GITHUB' })).toThrow();
      expect(() => LinkSchema.parse({ url: 'https://github.com' })).toThrow();
    });

    it('should reject invalid URL', () => {
      expect(() => LinkSchema.parse({ type: 'GITHUB', url: 'not-a-url' })).toThrow();
    });

    it('should reject javascript: and data: URLs (XSS vectors)', () => {
      // eslint-disable-next-line no-script-url
      expect(() => LinkSchema.parse({ type: 'OTHER', url: 'javascript:alert(1)' })).toThrow();
      expect(() =>
        LinkSchema.parse({ type: 'OTHER', url: 'data:text/html,<script>alert(1)</script>' })
      ).toThrow();
    });

    it('should reject non-http(s) schemes like ftp:', () => {
      expect(() => LinkSchema.parse({ type: 'OTHER', url: 'ftp://example.com/file' })).toThrow();
    });
  });

  describe('LinksArraySchema', () => {
    it('should accept array of valid links', () => {
      const data = [
        { type: 'GITHUB', url: 'https://github.com/johndoe' },
        { type: 'LINKEDIN', url: 'https://linkedin.com/in/johndoe' },
      ];
      expect(() => LinksArraySchema.parse(data)).not.toThrow();
    });

    it('should accept empty array', () => {
      expect(() => LinksArraySchema.parse([])).not.toThrow();
    });
  });

  describe('WorkExperienceSchema', () => {
    it('should accept valid work experience', () => {
      const data = {
        company: 'Tech Corp',
        role: 'Software Engineer',
        startDate: '2020-01-01',
        endDate: '2024-01-01',
        isCurrent: false,
        bullets: ['Developed web applications', 'Built APIs', 'Led team'],
        tags: ['JavaScript', 'React'],
      };
      expect(() => WorkExperienceSchema.parse(data)).not.toThrow();
    });

    it('should require company and role', () => {
      expect(() =>
        WorkExperienceSchema.parse({ company: 'Test', startDate: '2020-01-01' })
      ).toThrow();
      expect(() =>
        WorkExperienceSchema.parse({ role: 'Engineer', startDate: '2020-01-01' })
      ).toThrow();
    });

    it('should accept optional fields', () => {
      const data = {
        company: 'Tech Corp',
        role: 'Engineer',
        startDate: '2020-01-01',
      };
      expect(() => WorkExperienceSchema.parse(data)).not.toThrow();
    });

    it('should coerce date strings', () => {
      const data = {
        company: 'Tech Corp',
        role: 'Engineer',
        startDate: '2020-01-01',
      };
      const result = WorkExperienceSchema.parse(data);
      expect(result.startDate).toBeInstanceOf(Date);
    });

    it('should accept location types', () => {
      const data = {
        company: 'Tech Corp',
        role: 'Engineer',
        startDate: '2020-01-01',
        locationType: 'REMOTE',
      };
      expect(() => WorkExperienceSchema.parse(data)).not.toThrow();
    });

    it('should accept employment types', () => {
      const data = {
        company: 'Tech Corp',
        role: 'Engineer',
        startDate: '2020-01-01',
        employmentType: 'FULL_TIME',
      };
      expect(() => WorkExperienceSchema.parse(data)).not.toThrow();
    });
  });

  describe('EducationSchema', () => {
    it('should accept valid education', () => {
      const data = {
        institution: 'MIT',
        degree: 'Bachelor of Science',
        fieldOfStudy: 'Computer Science',
        startDate: '2016-09-01',
        endDate: '2020-05-01',
      };
      expect(() => EducationSchema.parse(data)).not.toThrow();
    });

    it('should require institution', () => {
      expect(() => EducationSchema.parse({ degree: 'BS' })).toThrow();
    });

    it('should accept optional fields', () => {
      expect(() => EducationSchema.parse({ institution: 'MIT' })).not.toThrow();
    });

    it('should accept arrays for activities and honors', () => {
      const data = {
        institution: 'MIT',
        activities: ['Chess Club', 'Debate Team'],
        honors: ["Dean's List", 'Summa Cum Laude'],
      };
      expect(() => EducationSchema.parse(data)).not.toThrow();
    });
  });

  describe('SkillSchema', () => {
    it('should accept valid skill', () => {
      const data = {
        name: 'JavaScript',
        level: 'EXPERT',
        yearsOfExp: 5,
      };
      expect(() => SkillSchema.parse(data)).not.toThrow();
    });

    it('should require name', () => {
      expect(() => SkillSchema.parse({ level: 'BEGINNER' })).toThrow();
    });

    it('should reject yearsOfExp out of range', () => {
      expect(() => SkillSchema.parse({ name: 'JS', yearsOfExp: -1 })).toThrow();
      expect(() => SkillSchema.parse({ name: 'JS', yearsOfExp: 51 })).toThrow();
    });
  });

  describe('SkillGroupSchema', () => {
    it('should accept valid skill group', () => {
      expect(() => SkillGroupSchema.parse({ name: 'Frontend' })).not.toThrow();
    });

    it('should require name', () => {
      expect(() => SkillGroupSchema.parse({})).toThrow();
    });
  });

  describe('ProjectSchema', () => {
    it('should accept valid project', () => {
      const data = {
        title: 'My Project',
        description: 'A cool project',
        url: 'https://myproject.com',
        repoUrl: 'https://github.com/me/project',
        techStack: ['React', 'Node.js'],
        featured: true,
      };
      expect(() => ProjectSchema.parse(data)).not.toThrow();
    });

    it('should require title', () => {
      expect(() => ProjectSchema.parse({ description: 'Test' })).toThrow();
    });

    it('should accept empty URLs', () => {
      expect(() =>
        ProjectSchema.parse({ title: 'Test', url: '', repoUrl: '', imageUrl: '' })
      ).not.toThrow();
    });

    it('should reject invalid URLs', () => {
      expect(() => ProjectSchema.parse({ title: 'Test', url: 'not-a-url' })).toThrow();
    });
  });

  describe('AwardSchema', () => {
    it('should accept valid award', () => {
      const data = {
        title: 'Best Developer',
        issuer: 'Tech Awards',
        date: '2024-01-01',
        description: 'Awarded for excellence',
        url: 'https://awards.com/best-developer',
      };
      expect(() => AwardSchema.parse(data)).not.toThrow();
    });

    it('should require title', () => {
      expect(() => AwardSchema.parse({ issuer: 'Test' })).toThrow();
    });
  });

  describe('CertificationSchema', () => {
    it('should accept valid certification', () => {
      const data = {
        name: 'AWS Certified',
        issuer: 'Amazon',
        credentialId: 'ABC123',
        credentialUrl: 'https://aws.amazon.com/cert/ABC123',
        issueDate: '2024-01-01',
        expirationDate: '2027-01-01',
      };
      expect(() => CertificationSchema.parse(data)).not.toThrow();
    });

    it('should require name and issuer', () => {
      expect(() => CertificationSchema.parse({ name: 'AWS' })).toThrow();
      expect(() => CertificationSchema.parse({ issuer: 'Amazon' })).toThrow();
    });
  });

  describe('ApiErrorSchema', () => {
    it('should accept valid API error', () => {
      const data = {
        error: 'NOT_FOUND',
        message: 'Resource not found',
        details: { id: '123' },
      };
      expect(() => ApiErrorSchema.parse(data)).not.toThrow();
    });

    it('should require error and message', () => {
      expect(() => ApiErrorSchema.parse({ error: 'TEST' })).toThrow();
      expect(() => ApiErrorSchema.parse({ message: 'Test' })).toThrow();
    });
  });

  describe('PaginationSchema', () => {
    it('should accept valid pagination', () => {
      const result = PaginationSchema.parse({ page: 2, limit: 50 });
      expect(result.page).toBe(2);
      expect(result.limit).toBe(50);
    });

    it('should use defaults', () => {
      const result = PaginationSchema.parse({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should coerce string values', () => {
      const result = PaginationSchema.parse({ page: '3', limit: '30' });
      expect(result.page).toBe(3);
      expect(result.limit).toBe(30);
    });

    it('should reject page less than 1', () => {
      expect(() => PaginationSchema.parse({ page: 0 })).toThrow();
    });

    it('should reject limit over 100', () => {
      expect(() => PaginationSchema.parse({ limit: 101 })).toThrow();
    });
  });

  describe('ResumeUploadSchema', () => {
    it('should accept valid PDF upload', () => {
      const data = {
        fileName: 'resume.pdf',
        fileType: 'application/pdf',
        fileSize: 1024 * 1024, // 1MB
      };
      expect(() => ResumeUploadSchema.parse(data)).not.toThrow();
    });

    it('should accept valid DOCX upload', () => {
      const data = {
        fileName: 'resume.docx',
        fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileSize: 1024 * 1024,
      };
      expect(() => ResumeUploadSchema.parse(data)).not.toThrow();
    });

    it('should reject invalid file type', () => {
      const data = {
        fileName: 'resume.txt',
        fileType: 'text/plain',
        fileSize: 1024,
      };
      expect(() => ResumeUploadSchema.parse(data)).toThrow();
    });

    it('should reject files over 5MB', () => {
      const data = {
        fileName: 'resume.pdf',
        fileType: 'application/pdf',
        fileSize: 6 * 1024 * 1024,
      };
      expect(() => ResumeUploadSchema.parse(data)).toThrow(/5MB/);
    });
  });

  describe('GitHubImportSchema', () => {
    it('should accept valid GitHub import', () => {
      const data = {
        accessToken: 'ghp_xxxxxxxxxxxx',
        includePrivateRepos: true,
        maxRepos: 50,
      };
      expect(() => GitHubImportSchema.parse(data)).not.toThrow();
    });

    it('should require accessToken', () => {
      expect(() => GitHubImportSchema.parse({})).toThrow();
    });

    it('should reject maxRepos over 100', () => {
      expect(() => GitHubImportSchema.parse({ accessToken: 'token', maxRepos: 101 })).toThrow();
    });
  });

  describe('LinkedInImportSchema', () => {
    it('should accept valid LinkedIn import', () => {
      const data = {
        jsonData: '{"profile": {"firstName": "John"}}',
      };
      expect(() => LinkedInImportSchema.parse(data)).not.toThrow();
    });

    it('should require jsonData', () => {
      expect(() => LinkedInImportSchema.parse({})).toThrow();
    });
  });

  describe('normalizeCurrentDates', () => {
    it('forces endDate to null when isCurrent is true', () => {
      const result = normalizeCurrentDates({
        isCurrent: true,
        endDate: new Date('2024-01-01'),
      });
      expect(result.endDate).toBeNull();
      expect(result.isCurrent).toBe(true);
    });

    it('leaves endDate untouched when isCurrent is false', () => {
      const end = new Date('2024-01-01');
      const result = normalizeCurrentDates({ isCurrent: false, endDate: end });
      expect(result.endDate).toBe(end);
    });

    it('leaves endDate untouched when isCurrent is undefined', () => {
      const end = new Date('2024-01-01');
      const result = normalizeCurrentDates({ endDate: end });
      expect(result.endDate).toBe(end);
    });

    it('preserves other fields', () => {
      const result = normalizeCurrentDates({
        isCurrent: true,
        endDate: new Date('2024-01-01'),
        company: 'Acme',
        startDate: new Date('2020-01-01'),
      });
      expect(result.company).toBe('Acme');
      expect(result.startDate).toEqual(new Date('2020-01-01'));
      expect(result.endDate).toBeNull();
    });
  });
});
