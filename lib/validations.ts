/**
 * Zod Validation Schemas
 * Centralized validation schemas for API boundaries and forms
 */

import { z } from 'zod';

// ===========================================
// LIMITS
// ===========================================

/** Maximum number of resumes a single user can create. */
export const MAX_RESUMES_PER_USER = 6;

// ===========================================
// ENUMS (matching Prisma enums)
// ===========================================

export const ProfileStatusSchema = z.enum(['DRAFT', 'PUBLIC', 'PRIVATE']);
export const DataSourceSchema = z.enum(['MANUAL', 'GITHUB', 'RESUME', 'LINKEDIN', 'GENERATED']);
export const LinkTypeSchema = z.enum([
  'GITHUB',
  'LINKEDIN',
  'TWITTER',
  'PORTFOLIO',
  'BLOG',
  'DRIBBBLE',
  'BEHANCE',
  'YOUTUBE',
  'OTHER',
]);
export const SkillLevelSchema = z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']);
export const LocationTypeSchema = z.enum(['ONSITE', 'REMOTE', 'HYBRID']);
export const EmploymentTypeSchema = z.enum([
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'FREELANCE',
  'INTERNSHIP',
]);

// ===========================================
// PROFILE SCHEMAS
// ===========================================

export const HandleSchema = z
  .string()
  .min(3, 'Handle must be at least 3 characters')
  .max(30, 'Handle must be at most 30 characters')
  .regex(
    /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
    'Handle must start and end with a letter or number, and can only contain lowercase letters, numbers, and hyphens'
  );

export const ProfileBasicInfoSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().max(50).optional(),
  headline: z.string().max(200).optional(),
  summary: z.string().max(5000).optional(),
  location: z.string().max(100).optional(),
  avatarUrl: z.string().url().optional().or(z.literal('')),
});

export const CreateProfileSchema = z.object({
  handle: HandleSchema,
  ...ProfileBasicInfoSchema.shape,
});

export const UpdateProfileSchema = ProfileBasicInfoSchema.partial();

// ===========================================
// CONTACT INFO SCHEMA
// ===========================================

// Phone number with separate country code
export const PhoneValueSchema = z.object({
  countryCode: z.string().nullable(), // e.g., "+91" or null
  number: z.string(), // The phone number without country code
  source: z.string().optional(),
});

export const ContactInfoSchema = z.object({
  email: z.string().email().optional().or(z.literal('')),
  emailPublic: z.boolean().optional(),
  phone: z.string().max(30).optional(),
  phoneCountryCode: z.string().max(10).nullable().optional(),
  phoneNumber: z.string().max(20).optional(),
  phonePublic: z.boolean().optional(),
  locationPublic: z.boolean().optional(),
  website: z.string().url().optional().or(z.literal('')),
  additionalEmails: z
    .array(
      z.object({
        email: z.string().email(),
        source: z.string(),
      })
    )
    .optional(),
  additionalPhones: z
    .array(
      z.object({
        countryCode: z.string().nullable().optional(),
        number: z.string().optional(),
        phone: z.string().optional(), // Legacy support
        source: z.string(),
      })
    )
    .optional(),
  /** Order of header contact fields: ["location","email","phone",linkId,...] */
  headerFieldsOrder: z.array(z.string()).max(50).optional(),
});

// ===========================================
// LINK SCHEMA
// ===========================================

export const LinkSchema = z.object({
  type: LinkTypeSchema,
  url: z.string().url('Must be a valid URL'),
  label: z.string().max(50).optional(),
  isVisible: z.boolean().optional(),
});

export const LinksArraySchema = z.array(LinkSchema);

// ===========================================
// WORK EXPERIENCE SCHEMA
// ===========================================

export const WorkExperienceSchema = z.object({
  company: z.string().min(1, 'Company name is required').max(100),
  companyUrl: z.string().url().optional().or(z.literal('')),
  role: z.string().min(1, 'Role is required').max(100),
  location: z.string().max(100).optional(),
  locationType: LocationTypeSchema.optional(),
  employmentType: EmploymentTypeSchema.optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional().nullable(),
  isCurrent: z.boolean().optional(),
  bullets: z.array(z.string().max(500)).max(20).optional(),
  bulletsHtml: z.string().max(15000).optional().nullable(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  isVisible: z.boolean().optional(),
});

// ===========================================
// EDUCATION SCHEMA
// ===========================================

export const EducationSchema = z.object({
  institution: z.string().min(1, 'Institution name is required').max(100),
  institutionUrl: z.string().url().optional().or(z.literal('')),
  degree: z.string().max(100).optional(),
  fieldOfStudy: z.string().max(100).optional(),
  location: z.string().max(100).optional(),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  isCurrent: z.boolean().optional(),
  gpa: z.string().max(10).optional(),
  description: z.string().max(2000).optional(),
  activities: z.array(z.string().max(100)).max(10).optional(),
  honors: z.array(z.string().max(100)).max(10).optional(),
  isVisible: z.boolean().optional(),
});

// ===========================================
// SKILL SCHEMA
// ===========================================

export const SkillSchema = z.object({
  name: z.string().min(1, 'Skill name is required').max(50),
  level: SkillLevelSchema.optional(),
  yearsOfExp: z.number().min(0).max(50).optional(),
  groupId: z.string().optional(),
  isVisible: z.boolean().optional(),
});

export const SkillGroupSchema = z.object({
  name: z.string().min(1, 'Group name is required').max(50),
});

// ===========================================
// PROJECT SCHEMA
// ===========================================

export const ProjectSchema = z.object({
  title: z.string().min(1, 'Project title is required').max(100),
  description: z.string().max(2000).optional(),
  shortDesc: z.string().max(200).optional(),
  url: z.string().url().optional().or(z.literal('')),
  repoUrl: z.string().url().optional().or(z.literal('')),
  imageUrl: z.string().url().optional().or(z.literal('')),
  images: z.array(z.string().url()).max(10).optional(),
  techStack: z.array(z.string().max(50)).max(20).optional(),
  highlights: z.array(z.string().max(200)).max(10).optional(),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  isCurrent: z.boolean().optional(),
  featured: z.boolean().optional(),
  // Visibility & display controls (must match Prisma model)
  isVisible: z.boolean().optional(),
  showOnPortfolio: z.boolean().optional(),
  showOnResume: z.boolean().optional(),
  showStats: z.boolean().optional(),
  showReadme: z.boolean().optional(),
  customDescription: z.string().max(2000).optional().nullable(),
});

// ===========================================
// AWARD & CERTIFICATION SCHEMAS
// ===========================================

export const AwardSchema = z.object({
  title: z.string().min(1, 'Award title is required').max(100),
  issuer: z.string().max(100).optional(),
  date: z.coerce.date().optional().nullable(),
  description: z.string().max(500).optional(),
  url: z.string().url().optional().or(z.literal('')),
  isVisible: z.boolean().optional(),
});

export const CertificationSchema = z.object({
  name: z.string().min(1, 'Certification name is required').max(100),
  issuer: z.string().min(1, 'Issuer is required').max(100),
  credentialId: z.string().max(100).optional(),
  credentialUrl: z.string().url().optional().or(z.literal('')),
  issueDate: z.coerce.date().optional().nullable(),
  expirationDate: z.coerce.date().optional().nullable(),
  isVisible: z.boolean().optional(),
});

// ===========================================
// API REQUEST/RESPONSE SCHEMAS
// ===========================================

export const ApiErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});

export const PaginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

// ===========================================
// IMPORT SCHEMAS
// ===========================================

export const ResumeUploadSchema = z.object({
  fileName: z.string(),
  fileType: z.enum([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]),
  fileSize: z.number().max(5 * 1024 * 1024, 'File must be less than 5MB'),
});

export const GitHubImportSchema = z.object({
  accessToken: z.string(),
  includePrivateRepos: z.boolean().optional(),
  maxRepos: z.number().min(1).max(100).optional(),
});

export const LinkedInImportSchema = z.object({
  jsonData: z.string(), // Raw JSON blob for manual paste
});

// ===========================================
// TYPE EXPORTS (inferred from schemas)
// ===========================================

export type ProfileBasicInfo = z.infer<typeof ProfileBasicInfoSchema>;
export type CreateProfile = z.infer<typeof CreateProfileSchema>;
export type UpdateProfile = z.infer<typeof UpdateProfileSchema>;
export type ContactInfo = z.infer<typeof ContactInfoSchema>;
export type Link = z.infer<typeof LinkSchema>;
export type WorkExperience = z.infer<typeof WorkExperienceSchema>;
export type Education = z.infer<typeof EducationSchema>;
export type Skill = z.infer<typeof SkillSchema>;
export type SkillGroup = z.infer<typeof SkillGroupSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Award = z.infer<typeof AwardSchema>;
export type Certification = z.infer<typeof CertificationSchema>;
