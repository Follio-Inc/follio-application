/**
 * Zod Validation Schemas
 * Centralized validation schemas for API boundaries and forms
 */

import { z } from 'zod';

// ===========================================
// SHARED FIELD HELPERS
// ===========================================

/**
 * A URL restricted to the `http`/`https` schemes.
 *
 * Zod's built-in `.url()` accepts *any* valid URL, including dangerous schemes
 * such as `javascript:` and `data:`, which become XSS vectors when the value is
 * later rendered into an `href`/`src`. Every user-supplied URL field in the app
 * should use this helper instead of `z.string().url()` so the trust boundary is
 * enforced at validation time.
 */
export const httpUrl = (message = 'Must be a valid http(s) URL') =>
  z
    .string()
    .url(message)
    .refine((value) => /^https?:\/\//i.test(value), { message });

const UNSAFE_URL_SCHEME = /^(javascript|data|vbscript):/i;
const HAS_URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const OPTIONAL_URL_MESSAGE = 'Use a link like https://example.com, or leave it blank';

/**
 * Optional project link. Blank, null, and missing values clear the field.
 * A host without a scheme (`github.com/me/repo`) is saved as https.
 * `javascript:` and `data:` URLs are rejected.
 */
function normalizeOptionalUrl(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (UNSAFE_URL_SCHEME.test(trimmed) || HAS_URL_SCHEME.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export const optionalHttpUrl = z.preprocess(
  normalizeOptionalUrl,
  z
    .string()
    .url(OPTIONAL_URL_MESSAGE)
    .refine((value) => /^https?:\/\//i.test(value), { message: OPTIONAL_URL_MESSAGE })
    .nullable()
    .optional()
);

/** Blank list items are dropped. A missing list is left unchanged on update. */
const optionalStringList = (maxItem: number, maxItems: number) =>
  z.preprocess(
    (value) => {
      if (value === undefined || value === null) return undefined;
      if (!Array.isArray(value)) return value;
      return value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    },
    z.array(z.string().max(maxItem)).max(maxItems).optional()
  );

/** Empty dates are treated as "not set" instead of failing the save. */
const optionalDate = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
}, z.coerce.date().nullable().optional());

/** First field message from a Zod error, for the builder's save alert. */
export function firstValidationError(
  error: z.ZodError,
  labels?: Record<string, string>,
  fallback = 'Could not save this project'
): string {
  const flattened = error.flatten();
  for (const [field, messages] of Object.entries(flattened.fieldErrors)) {
    const message = messages?.[0];
    if (!message) continue;
    const label = labels?.[field] ?? field;
    if (message.toLowerCase().includes(label.toLowerCase())) return message;
    return `${label}: ${message}`;
  }
  return flattened.formErrors[0] || fallback;
}

/**
 * Optional text a PATCH can clear. Missing stays undefined (leave unchanged);
 * empty / whitespace / null becomes null so Prisma actually unsets the field.
 */
export const clearableString = (max: number) =>
  z.preprocess((value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    return value;
  }, z.string().max(max).nullable().optional());

/** Client helper: send null so the API can clear a previously saved field. */
export function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  return value.trim() === '' ? null : value;
}

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
  'MEDIUM',
  'SUBSTACK',
  'HASHNODE',
  'DEVTO',
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

export const HeadingTagColorSchema = z.enum([
  'slate',
  'stone',
  'zinc',
  'blue',
  'teal',
  'olive',
  'amber',
  'rose',
]);

export const HeadingTagSchema = z.object({
  label: z.string().trim().min(1).max(32),
  color: HeadingTagColorSchema.optional(),
});

export const HeadingTagsSchema = z.array(HeadingTagSchema).max(8);

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
  middleName: z.string().max(50).optional(),
  lastName: z.string().max(50).optional(),
  headline: z.string().max(200).optional(),
  summary: z.string().max(5000).optional(),
  totalExperience: clearableString(60),
  totalExperienceVisible: z.boolean().optional(),
  totalExperienceShowYears: z.boolean().optional(),
  totalExperienceShowMonths: z.boolean().optional(),
  location: z.string().max(100).optional(),
  avatarUrl: httpUrl().optional().or(z.literal('')),
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
  website: httpUrl().optional().or(z.literal('')),
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
  /** Order of header contact fields: ["email","phone","location",linkId,...] */
  headerFieldsOrder: z.array(z.string()).max(50).optional(),
});

// ===========================================
// LINK SCHEMA
// ===========================================

export const LinkSchema = z.object({
  type: LinkTypeSchema,
  // Empty is allowed so the builder can create a header row before the URL is typed.
  url: httpUrl('Must be a valid URL').or(z.literal('')),
  label: z.string().max(50).optional(),
  isVisible: z.boolean().optional(),
});

export const LinksArraySchema = z.array(LinkSchema);

// ===========================================
// WORK EXPERIENCE SCHEMA
// ===========================================

export const WorkExperienceSchema = z.object({
  company: z.string().min(1, 'Company name is required').max(100),
  companyUrl: httpUrl().optional().or(z.literal('')),
  role: z.string().min(1, 'Role is required').max(100),
  location: z.string().max(100).optional(),
  locationType: LocationTypeSchema.optional().nullable(),
  employmentType: EmploymentTypeSchema.optional().nullable(),
  headingTags: HeadingTagsSchema.optional(),
  durationVisible: z.boolean().optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional().nullable(),
  isCurrent: z.boolean().optional(),
  bullets: z.array(z.string().max(500)).max(20).optional(),
  bulletsHtml: z.string().max(15000).optional().nullable(),
  isVisible: z.boolean().optional(),
});

// ===========================================
// EDUCATION SCHEMA
// ===========================================

export const EducationSchema = z.object({
  institution: z.string().min(1, 'Institution name is required').max(100),
  institutionUrl: httpUrl().optional().or(z.literal('')),
  degree: clearableString(100),
  fieldOfStudy: clearableString(100),
  location: clearableString(100),
  headingTags: HeadingTagsSchema.optional(),
  durationVisible: z.boolean().optional(),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  isCurrent: z.boolean().optional(),
  gpa: clearableString(10),
  description: clearableString(15000),
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

/**
 * Manual projects are often saved with only a title. Every other field is
 * optional: blank and null values clear that field instead of failing the save.
 */
export const ProjectSchema = z.object({
  title: z
    .string({
      required_error: 'Project title is required',
      invalid_type_error: 'Project title is required',
    })
    .trim()
    .min(1, 'Project title is required')
    .max(200, 'Project title must be 200 characters or less'),
  description: clearableString(15000),
  shortDesc: clearableString(1000),
  url: optionalHttpUrl,
  repoUrl: optionalHttpUrl,
  imageUrl: optionalHttpUrl,
  images: z.preprocess(
    (value) => {
      if (value === undefined || value === null) return undefined;
      if (!Array.isArray(value)) return value;
      return value
        .map((item) => normalizeOptionalUrl(item))
        .filter((item): item is string => typeof item === 'string');
    },
    z
      .array(
        z
          .string()
          .url(OPTIONAL_URL_MESSAGE)
          .refine((value) => /^https?:\/\//i.test(value), { message: OPTIONAL_URL_MESSAGE })
      )
      .max(20)
      .optional()
  ),
  techStack: optionalStringList(80, 40),
  highlights: optionalStringList(2000, 20),
  headingTags: z.preprocess(
    (value) => (value == null ? undefined : value),
    HeadingTagsSchema.optional()
  ),
  startDate: optionalDate,
  endDate: optionalDate,
  isCurrent: z.boolean().optional(),
  featured: z.boolean().optional(),
  // Visibility & display controls (must match Prisma model)
  isVisible: z.boolean().optional(),
  showOnPortfolio: z.boolean().optional(),
  showOnResume: z.boolean().optional(),
  showStats: z.boolean().optional(),
  showReadme: z.boolean().optional(),
  customDescription: clearableString(15000),
});

export const PROJECT_FIELD_LABELS: Record<string, string> = {
  title: 'Project title',
  description: 'Description',
  shortDesc: 'Short description',
  url: 'Live URL',
  repoUrl: 'Repository URL',
  imageUrl: 'Cover image URL',
  images: 'Images',
  techStack: 'Tech stack',
  highlights: 'Highlights',
  headingTags: 'Tags',
  startDate: 'Start date',
  endDate: 'End date',
  customDescription: 'Description',
};

// ===========================================
// AWARD & CERTIFICATION SCHEMAS
// ===========================================

export const AwardSchema = z.object({
  title: z.string().min(1, 'Award title is required').max(100),
  issuer: z.string().max(100).optional(),
  date: z.coerce.date().optional().nullable(),
  description: z.string().max(500).optional(),
  url: httpUrl().optional().or(z.literal('')),
  isVisible: z.boolean().optional(),
});

export const CertificationSchema = z.object({
  name: z.string().min(1, 'Certification name is required').max(100),
  issuer: z.string().min(1, 'Issuer is required').max(100),
  credentialId: z.string().max(100).optional(),
  credentialUrl: httpUrl().optional().or(z.literal('')),
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
// FIELD NORMALIZATION HELPERS
// ===========================================

/**
 * Enforce the invariant that a "current" role/education/project has no end
 * date. The UI hides the end-date field when `isCurrent` is checked, but the
 * server must enforce it too — otherwise a client (or a malformed request)
 * could persist both `isCurrent: true` and an `endDate`, leaving the record
 * internally inconsistent.
 *
 * Returns a shallow copy with `endDate` forced to `null` when `isCurrent` is
 * `true`; otherwise returns the input unchanged.
 */
export function normalizeCurrentDates<T extends { isCurrent?: boolean | null; endDate?: unknown }>(
  data: T
): T {
  if (data.isCurrent === true) {
    return { ...data, endDate: null };
  }
  return data;
}

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
