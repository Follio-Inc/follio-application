/**
 * AI-Powered Resume Parser Service
 *
 * A pure AI approach to resume parsing using OpenAI's GPT-4o-mini.
 * This service:
 * 1. Extracts text from PDF using pdf-parse
 * 2. Sends the text to OpenAI for intelligent parsing
 * 3. Returns structured, normalized data ready for database storage
 *
 * Why GPT-4o-mini?
 * - Cost effective (~$0.15 per 1M input tokens, ~$0.60 per 1M output tokens)
 * - Fast response times
 * - Excellent at structured extraction tasks
 * - Supports JSON mode for reliable output
 */

import { resolveActiveProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { parseDateFlexible } from '@/lib/utils';
import { DataSource, LinkType, Prisma } from '@prisma/client';
import OpenAI from 'openai';

// ============================================================================
// CONFIGURATION
// ============================================================================

const OPENAI_MODEL = 'gpt-4o-mini'; // Cost-effective, great for parsing
const MAX_TOKENS = 4096;
const TEMPERATURE = 0.1; // Low temperature for consistent, accurate extraction

// ============================================================================
// TYPES
// ============================================================================

export interface AIParserConfig {
  model?: string;
  maxRetries?: number;
  timeout?: number;
}

export interface ParsedResumeAI {
  basics: {
    firstName?: string;
    middleName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    location?: string;
    summary?: string;
    headline?: string;
  };
  workExperiences: WorkExperienceAI[];
  educations: EducationAI[];
  skills: string[];
  links: LinkAI[];
  certifications: CertificationAI[];
  projects: ProjectAI[];
}

interface WorkExperienceAI {
  title: string;
  company: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  bullets?: string[];
}

interface EducationAI {
  institution: string;
  degree: string;
  fieldOfStudy?: string;
  startDate?: string;
  endDate?: string;
  gpa?: string;
  location?: string;
}

interface LinkAI {
  type: string;
  url: string;
  label?: string;
}

interface CertificationAI {
  name: string;
  issuer?: string;
  date?: string;
  credentialId?: string;
}

interface ProjectAI {
  title: string;
  description?: string;
  url?: string;
  technologies?: string[];
  startDate?: string;
  endDate?: string;
}

export interface NormalizedResumeData {
  profile: {
    firstName?: string;
    middleName?: string;
    lastName?: string;
    headline?: string;
    summary?: string;
    location?: string;
  };
  contactInfo?: {
    email?: string;
    phone?: string;
  };
  experiences: Array<{
    company: string;
    role: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    isCurrent?: boolean;
    bullets?: string[];
  }>;
  educations: Array<{
    institution: string;
    degree?: string;
    fieldOfStudy?: string;
    startDate?: string;
    endDate?: string;
    gpa?: string;
  }>;
  projects: Array<{
    name: string;
    description?: string;
    url?: string;
    technologies?: string[];
    startDate?: string;
    endDate?: string;
  }>;
  skills: string[];
  links: Array<{
    type: string;
    url: string;
    label?: string;
  }>;
  certifications: Array<{
    name: string;
    issuer?: string;
    date?: string;
  }>;
  meta: {
    confidence: number;
    parseMethod: 'ai';
    model: string;
    importedAt: Date;
    processingTimeMs: number;
  };
}

export interface ImportResult {
  success: boolean;
  data?: NormalizedResumeData;
  error?: string;
  message?: string;
}

// ============================================================================
// OPENAI CLIENT
// ============================================================================

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not configured. Please add it to your environment variables.'
      );
    }

    openaiClient = new OpenAI({ apiKey });
  }

  return openaiClient;
}

/**
 * Check if AI parser is available (API key is configured)
 */
export function isAIParserAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

// ============================================================================
// AI PARSING PROMPT
// ============================================================================

const RESUME_PARSING_PROMPT = `You are an expert resume parser. Extract ALL structured information from the resume text below with maximum accuracy.

CRITICAL RULES:
1. Extract EVERY piece of information - do not skip any work experiences, education, projects, or skills
2. For dates, preserve the format as written (e.g., "Jan 2024", "2024", "January 2024", "01/2024")
3. "Present", "Current", "Now", or similar means the position is ongoing - set isCurrent: true and endDate: "Present"
4. Skills should be individual items, not categories (split "Python, Java, C++" into separate items)
5. For work experience bullets, include ALL bullet points/achievements
6. If a field is genuinely not present, omit it entirely (don't use null, empty strings, or "N/A")
7. The name is usually on the first line - split into firstName, middleName (optional), and lastName
8. Headline/title is the professional title (e.g., "Senior Software Engineer", "Product Manager")
9. Look for LinkedIn, GitHub, portfolio URLs in the contact/header section
10. Parse certifications with their issuing organization and date if available

IMPORTANT: Return ONLY valid JSON, no markdown code blocks, no explanations.

Return this EXACT JSON structure:
{
  "basics": {
    "firstName": "string",
    "middleName": "string (optional)",
    "lastName": "string", 
    "email": "string",
    "phone": "string",
    "location": "string (city, state/country)",
    "headline": "string (professional title)",
    "summary": "string (professional summary/objective paragraph)"
  },
  "workExperiences": [
    {
      "title": "string (job title)",
      "company": "string (company name)",
      "location": "string (city, state)",
      "startDate": "string",
      "endDate": "string or 'Present'",
      "isCurrent": boolean,
      "bullets": ["string (each responsibility, achievement, or role detail as a separate item)"]
    }
  ],
  "educations": [
    {
      "institution": "string (university/school name)",
      "degree": "string (e.g., 'Bachelor of Science', 'Master of Arts', 'PhD')",
      "fieldOfStudy": "string (e.g., 'Computer Science', 'Business')",
      "location": "string",
      "startDate": "string",
      "endDate": "string",
      "gpa": "string (if mentioned, e.g., '3.8/4.0')"
    }
  ],
  "skills": ["string (individual skill - split compound skills into separate items)"],
  "certifications": [
    {
      "name": "string (certification name)",
      "issuer": "string (issuing organization)",
      "date": "string",
      "credentialId": "string (if mentioned)"
    }
  ],
  "projects": [
    {
      "title": "string (project name)",
      "description": "string",
      "url": "string (if available)",
      "technologies": ["string"],
      "startDate": "string",
      "endDate": "string"
    }
  ],
  "links": [
    {
      "type": "string (linkedin/github/portfolio/website/twitter/other)",
      "url": "string (full URL)",
      "label": "string (display text if different from URL)"
    }
  ]
}

RESUME TEXT:
`;

// ============================================================================
// PDF TEXT EXTRACTION
// ============================================================================

/**
 * Extract text from PDF buffer using pdf-parse
 */
async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  console.log('[AI Parser] Extracting text from PDF...');

  try {
    // Try pdf-parse first (best quality)
    const pdfParse = await import('pdf-parse');
    const data = await pdfParse.default(buffer);

    if (data.text && data.text.trim().length > 50) {
      console.log(`[AI Parser] pdf-parse extracted ${data.text.length} characters`);
      return data.text;
    }
  } catch (error) {
    console.warn('[AI Parser] pdf-parse failed, trying fallback...', error);
  }

  // Fallback to unpdf
  try {
    const { extractText } = await import('unpdf');
    const uint8Array = new Uint8Array(buffer);
    const { text } = await extractText(uint8Array, { mergePages: true });

    if (text && text.trim().length > 50) {
      console.log(`[AI Parser] unpdf extracted ${text.length} characters`);
      return text;
    }
  } catch (error) {
    console.warn('[AI Parser] unpdf also failed', error);
  }

  throw new Error('Failed to extract text from PDF. The file may be corrupted or image-based.');
}

// ============================================================================
// AI PARSING
// ============================================================================

/**
 * Parse resume text using OpenAI
 */
async function parseResumeWithAI(text: string): Promise<ParsedResumeAI> {
  const client = getOpenAIClient();

  console.log('[AI Parser] Sending to OpenAI...');
  console.log(`[AI Parser] Text length: ${text.length} characters`);

  const response = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You are a precise resume parser. Extract structured data accurately. Always respond with valid JSON only, no markdown formatting or code blocks.',
      },
      {
        role: 'user',
        content: RESUME_PARSING_PROMPT + text,
      },
    ],
    temperature: TEMPERATURE,
    max_tokens: MAX_TOKENS,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;

  if (!content) {
    throw new Error('OpenAI returned an empty response');
  }

  // Parse the JSON response
  let parsed: ParsedResumeAI;
  try {
    parsed = JSON.parse(content);
  } catch {
    console.error('[AI Parser] Failed to parse JSON response:', content.substring(0, 500));
    throw new Error('OpenAI returned invalid JSON');
  }

  // Validate and clean the response
  return validateAndCleanResponse(parsed);
}

/**
 * Validate and clean the AI response
 */
function validateAndCleanResponse(parsed: unknown): ParsedResumeAI {
  const data = parsed as Record<string, unknown>;

  // Ensure required structure exists
  const result: ParsedResumeAI = {
    basics: {
      firstName: getString(data.basics, 'firstName'),
      middleName: getString(data.basics, 'middleName'),
      lastName: getString(data.basics, 'lastName'),
      email: getString(data.basics, 'email'),
      phone: getString(data.basics, 'phone'),
      location: getString(data.basics, 'location'),
      headline: getString(data.basics, 'headline'),
      summary: getString(data.basics, 'summary'),
    },
    workExperiences: getArray(data.workExperiences).map((exp) => ({
      title: getString(exp, 'title') || 'Unknown Role',
      company: getString(exp, 'company') || 'Unknown Company',
      location: getString(exp, 'location'),
      startDate: getString(exp, 'startDate'),
      endDate: getString(exp, 'endDate'),
      isCurrent:
        getBoolean(exp, 'isCurrent') || getString(exp, 'endDate')?.toLowerCase() === 'present',
      bullets: [
        ...(getString(exp, 'description') ? [getString(exp, 'description')!] : []),
        ...getStringArray(exp, 'bullets'),
      ].filter((b) => b.length > 0),
    })),
    educations: getArray(data.educations).map((edu) => ({
      institution: getString(edu, 'institution') || 'Unknown Institution',
      degree: getString(edu, 'degree') || 'Degree',
      fieldOfStudy: getString(edu, 'fieldOfStudy'),
      startDate: getString(edu, 'startDate'),
      endDate: getString(edu, 'endDate'),
      gpa: getString(edu, 'gpa'),
      location: getString(edu, 'location'),
    })),
    skills: getStringArray(data, 'skills'),
    links: getArray(data.links).map((link) => ({
      type: getString(link, 'type') || 'website',
      url: getString(link, 'url') || '',
      label: getString(link, 'label'),
    })),
    certifications: getArray(data.certifications).map((cert) => ({
      name: getString(cert, 'name') || 'Certification',
      issuer: getString(cert, 'issuer'),
      date: getString(cert, 'date'),
      credentialId: getString(cert, 'credentialId'),
    })),
    projects: getArray(data.projects).map((proj) => ({
      title: getString(proj, 'title') || 'Project',
      description: getString(proj, 'description'),
      url: getString(proj, 'url'),
      technologies: getStringArray(proj, 'technologies'),
      startDate: getString(proj, 'startDate'),
      endDate: getString(proj, 'endDate'),
    })),
  };

  return result;
}

// Helper functions for safe data extraction
function getString(obj: unknown, key: string): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const value = (obj as Record<string, unknown>)[key];
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return undefined;
}

function getBoolean(obj: unknown, key: string): boolean {
  if (!obj || typeof obj !== 'object') return false;
  return (obj as Record<string, unknown>)[key] === true;
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getStringArray(obj: unknown, key?: string): string[] {
  const arr = key ? (obj as Record<string, unknown>)?.[key] : obj;
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((s) => s.trim());
}

// ============================================================================
// NORMALIZATION
// ============================================================================

/**
 * Sanitize text - remove null bytes and control characters
 */
function sanitize(text: string | undefined): string | undefined {
  if (!text) return undefined;
  return (
    text
      .replace(/\0/g, '')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
      .trim() || undefined
  );
}

/**
 * Detect link type from URL
 */
function detectLinkType(url: string, providedType?: string): string {
  if (providedType && providedType !== 'other' && providedType !== 'website') {
    return providedType.toLowerCase();
  }

  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('linkedin.com')) return 'linkedin';
  if (lowerUrl.includes('github.com')) return 'github';
  if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) return 'twitter';
  if (lowerUrl.includes('dribbble.com')) return 'dribbble';
  if (lowerUrl.includes('behance.net')) return 'behance';
  if (lowerUrl.includes('medium.com')) return 'medium';
  if (lowerUrl.includes('dev.to')) return 'devto';
  if (lowerUrl.includes('stackoverflow.com')) return 'stackoverflow';
  if (lowerUrl.includes('youtube.com')) return 'youtube';
  return 'website';
}

/**
 * Normalize URL - ensure it starts with https://
 */
function normalizeUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `https://${url}`;
}

/**
 * Normalize parsed AI data into application format
 */
function normalizeAIData(parsed: ParsedResumeAI, processingTimeMs: number): NormalizedResumeData {
  const normalized: NormalizedResumeData = {
    profile: {},
    experiences: [],
    educations: [],
    projects: [],
    skills: [],
    links: [],
    certifications: [],
    meta: {
      confidence: calculateConfidence(parsed),
      parseMethod: 'ai',
      model: OPENAI_MODEL,
      importedAt: new Date(),
      processingTimeMs,
    },
  };

  // Profile
  if (parsed.basics) {
    normalized.profile = {
      firstName: sanitize(parsed.basics.firstName),
      middleName: sanitize(parsed.basics.middleName),
      lastName: sanitize(parsed.basics.lastName),
      headline: sanitize(parsed.basics.headline),
      summary: sanitize(parsed.basics.summary),
      location: sanitize(parsed.basics.location),
    };

    if (parsed.basics.email || parsed.basics.phone) {
      normalized.contactInfo = {
        email: sanitize(parsed.basics.email),
        phone: sanitize(parsed.basics.phone),
      };
    }
  }

  // Work experiences
  for (const exp of parsed.workExperiences || []) {
    if (!exp.company && !exp.title) continue;

    normalized.experiences.push({
      company: sanitize(exp.company) || 'Unknown Company',
      role: sanitize(exp.title) || 'Unknown Role',
      location: sanitize(exp.location),
      startDate: sanitize(exp.startDate),
      endDate: sanitize(exp.endDate),
      isCurrent: exp.isCurrent,
      bullets: exp.bullets?.map((b) => sanitize(b)).filter((b): b is string => !!b),
    });
  }

  // Education
  for (const edu of parsed.educations || []) {
    if (!edu.institution && !edu.degree) continue;

    normalized.educations.push({
      institution: sanitize(edu.institution) || 'Unknown Institution',
      degree: sanitize(edu.degree),
      fieldOfStudy: sanitize(edu.fieldOfStudy),
      startDate: sanitize(edu.startDate),
      endDate: sanitize(edu.endDate),
      gpa: sanitize(edu.gpa),
    });
  }

  // Projects
  for (const proj of parsed.projects || []) {
    if (!proj.title) continue;

    normalized.projects.push({
      name: sanitize(proj.title) || 'Untitled Project',
      description: sanitize(proj.description),
      url: proj.url ? normalizeUrl(proj.url) : undefined,
      technologies: proj.technologies?.map((t) => sanitize(t)).filter((t): t is string => !!t),
      startDate: sanitize(proj.startDate),
      endDate: sanitize(proj.endDate),
    });
  }

  // Skills
  normalized.skills = (parsed.skills || [])
    .map((s) => sanitize(s))
    .filter((s): s is string => !!s && s.length > 0);

  // Links
  for (const link of parsed.links || []) {
    if (!link.url) continue;
    const url = normalizeUrl(link.url);
    normalized.links.push({
      type: detectLinkType(url, link.type),
      url,
      label: sanitize(link.label) || detectLinkType(url, link.type),
    });
  }

  // Certifications
  for (const cert of parsed.certifications || []) {
    if (!cert.name) continue;
    normalized.certifications.push({
      name: sanitize(cert.name) || 'Unknown Certification',
      issuer: sanitize(cert.issuer),
      date: sanitize(cert.date),
    });
  }

  return normalized;
}

/**
 * Calculate confidence score based on extracted data completeness
 */
function calculateConfidence(parsed: ParsedResumeAI): number {
  let score = 0;
  let maxScore = 0;

  // Basic info (40 points max)
  maxScore += 40;
  if (parsed.basics?.firstName) score += 8;
  if (parsed.basics?.lastName) score += 8;
  if (parsed.basics?.email) score += 10;
  if (parsed.basics?.phone) score += 7;
  if (parsed.basics?.headline) score += 7;

  // Work experience (30 points max)
  maxScore += 30;
  const expCount = parsed.workExperiences?.length || 0;
  if (expCount > 0) score += Math.min(expCount * 10, 30);

  // Education (15 points max)
  maxScore += 15;
  const eduCount = parsed.educations?.length || 0;
  if (eduCount > 0) score += Math.min(eduCount * 7, 15);

  // Skills (15 points max)
  maxScore += 15;
  const skillCount = parsed.skills?.length || 0;
  if (skillCount > 0) score += Math.min(skillCount * 2, 15);

  return Math.round((score / maxScore) * 100) / 100;
}

// ============================================================================
// MAIN IMPORT FUNCTION
// ============================================================================

/**
 * Parse and import a resume PDF using AI
 */
export async function importResumeWithAI(buffer: Buffer, userId: string): Promise<ImportResult> {
  const startTime = Date.now();

  try {
    console.log('[AI Resume Import] Starting AI-powered parsing...');
    console.log(`[AI Resume Import] User: ${userId}`);
    console.log(`[AI Resume Import] Buffer size: ${buffer.length} bytes`);

    // Check if API key is available
    if (!isAIParserAvailable()) {
      return {
        success: false,
        error: 'AI parser is not configured. Please add OPENAI_API_KEY to your environment.',
      };
    }

    // Step 1: Extract text from PDF
    const text = await extractTextFromPDF(buffer);
    console.log(`[AI Resume Import] Extracted ${text.length} characters from PDF`);

    if (text.length < 50) {
      return {
        success: false,
        error:
          'Could not extract meaningful text from the PDF. It may be image-based or corrupted.',
      };
    }

    // Step 2: Parse with AI
    const parsed = await parseResumeWithAI(text);
    const processingTime = Date.now() - startTime;

    console.log('[AI Resume Import] AI parsing complete');
    console.log(`[AI Resume Import] Processing time: ${processingTime}ms`);

    // Step 3: Normalize data
    const normalized = normalizeAIData(parsed, processingTime);

    console.log('[AI Resume Import] === EXTRACTION SUMMARY ===');
    console.log(
      `  Name: ${[
        normalized.profile.firstName,
        normalized.profile.middleName,
        normalized.profile.lastName,
      ]
        .filter(Boolean)
        .join(' ')}`
    );
    console.log(`  Email: ${normalized.contactInfo?.email}`);
    console.log(`  Headline: ${normalized.profile.headline?.substring(0, 50)}`);
    console.log(`  Experiences: ${normalized.experiences.length}`);
    console.log(`  Education: ${normalized.educations.length}`);
    console.log(`  Skills: ${normalized.skills.length}`);
    console.log(`  Projects: ${normalized.projects.length}`);
    console.log(`  Certifications: ${normalized.certifications.length}`);
    console.log(`  Links: ${normalized.links.length}`);
    console.log(`  Confidence: ${normalized.meta.confidence}`);
    console.log(`  Model: ${normalized.meta.model}`);

    return {
      success: true,
      data: normalized,
      message: `Successfully parsed resume using AI (${processingTime}ms)`,
    };
  } catch (error) {
    const errorProcessingTime = Date.now() - startTime;
    console.error(`[AI Resume Import] Error after ${errorProcessingTime}ms:`, error);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse resume with AI',
    };
  }
}

// ============================================================================
// DATABASE SAVE FUNCTION
// ============================================================================

/**
 * Map string link type to Prisma LinkType enum
 */
function mapLinkType(type: string): LinkType {
  const typeUpper = type?.toUpperCase() || 'OTHER';
  const validTypes: LinkType[] = [
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
  return validTypes.includes(typeUpper as LinkType) ? (typeUpper as LinkType) : LinkType.OTHER;
}

/**
 * Safely parse a date string using the shared flexible parser.
 * Returns undefined for invalid dates (Prisma-compatible).
 */
function parseDateSafe(dateStr: string | undefined): Date | undefined {
  const result = parseDateFlexible(dateStr);
  return result ?? undefined;
}

/**
 * Save normalized resume data to user's profile
 */
export async function saveAIResumeToProfile(
  userId: string,
  data: NormalizedResumeData
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('[AI Resume Save] Saving to profile for user:', userId);

    // Get user by Clerk ID
    const user = await db.user.findUnique({
      where: { clerkId: userId },
      select: { id: true },
    });

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // Resolve active profile, or create one as fallback
    let profileId = (await resolveActiveProfileContext(userId).catch(() => null))?.profileId;
    if (!profileId) {
      const newProfile = await db.profile.create({
        data: {
          userId: user.id,
          resumeTitle: 'Imported Resume',
          handle: `user-${user.id.slice(0, 8)}`,
          firstName: data.profile.firstName,
          middleName: data.profile.middleName,
          lastName: data.profile.lastName,
        },
      });

      await db.user.update({
        where: { id: user.id },
        data: {
          profile: {
            connect: { id: newProfile.id },
          },
        },
      });

      profileId = newProfile.id;
    }

    // Update profile with available data
    const profileUpdate: Prisma.ProfileUpdateInput = {};
    if (data.profile.firstName) {
      profileUpdate.firstName = data.profile.firstName;
      profileUpdate.firstNameSource = DataSource.RESUME;
    }
    if (data.profile.middleName) {
      profileUpdate.middleName = data.profile.middleName;
      profileUpdate.middleNameSource = DataSource.RESUME;
    }
    if (data.profile.lastName) {
      profileUpdate.lastName = data.profile.lastName;
      profileUpdate.lastNameSource = DataSource.RESUME;
    }
    if (data.profile.headline) {
      profileUpdate.headline = data.profile.headline;
      profileUpdate.headlineSource = DataSource.RESUME;
    }
    if (data.profile.summary) {
      profileUpdate.summary = data.profile.summary;
      profileUpdate.summarySource = DataSource.RESUME;
    }
    if (data.profile.location) {
      profileUpdate.location = data.profile.location;
      profileUpdate.locationSource = DataSource.RESUME;
    }

    // Only update profile if we have something to update
    if (Object.keys(profileUpdate).length > 0) {
      await db.profile.update({
        where: { id: profileId },
        data: profileUpdate,
      });
    }

    // Update or create contact info with intelligent email handling
    if (data.contactInfo?.email || data.contactInfo?.phone) {
      // Get existing contact info to check if there's already a primary email
      const existingContact = await db.contactInfo.findUnique({
        where: { profileId },
      });

      const incomingEmail = data.contactInfo?.email?.toLowerCase();

      interface AdditionalEmail {
        email: string;
        source: string;
      }

      let emailToSet = existingContact?.email;
      let emailSourceToSet = existingContact?.emailSource || DataSource.MANUAL;
      let additionalEmails: AdditionalEmail[] = [];

      // Parse existing additional emails
      if (existingContact?.additionalEmails) {
        try {
          const parsed = existingContact.additionalEmails as unknown;
          if (Array.isArray(parsed)) {
            additionalEmails = parsed as AdditionalEmail[];
          }
        } catch {
          additionalEmails = [];
        }
      }

      if (incomingEmail) {
        // If no primary email set yet, set as primary
        if (!existingContact?.email) {
          emailToSet = incomingEmail;
          emailSourceToSet = DataSource.RESUME;
        } else if (existingContact.email.toLowerCase() !== incomingEmail) {
          // Different email - add to additional emails if not already there
          const alreadyExists = additionalEmails.some(
            (e) => e.email.toLowerCase() === incomingEmail
          );
          if (!alreadyExists) {
            additionalEmails.push({
              email: incomingEmail,
              source: 'RESUME',
            });
          }
        }
        // If same email, just update the source if needed
      }

      await db.contactInfo.upsert({
        where: { profileId },
        create: {
          profileId,
          email: emailToSet || incomingEmail,
          emailSource: emailSourceToSet,
          additionalEmails: JSON.parse(JSON.stringify(additionalEmails)),
          phone: data.contactInfo?.phone,
          phoneSource: DataSource.RESUME,
        },
        update: {
          ...(emailToSet && {
            email: emailToSet,
            emailSource: emailSourceToSet,
          }),
          additionalEmails: JSON.parse(JSON.stringify(additionalEmails)),
          ...(data.contactInfo?.phone && {
            phone: data.contactInfo.phone,
            phoneSource: DataSource.RESUME,
          }),
        },
      });
    }

    // Add work experiences (with deduplication)
    for (const exp of data.experiences) {
      // Check for existing experience by company + role (case-insensitive)
      const existingExp = await db.workExperience.findFirst({
        where: {
          profileId,
          company: { equals: exp.company, mode: 'insensitive' },
          role: { equals: exp.role, mode: 'insensitive' },
        },
      });

      if (existingExp) {
        // Update existing record if it came from resume source (don't overwrite manual edits)
        if (existingExp.source === DataSource.RESUME) {
          await db.workExperience.update({
            where: { id: existingExp.id },
            data: {
              location: exp.location || existingExp.location,
              startDate: parseDateSafe(exp.startDate) || existingExp.startDate,
              endDate: parseDateSafe(exp.endDate) || existingExp.endDate,
              isCurrent: exp.isCurrent ?? existingExp.isCurrent,
              bullets: exp.bullets?.length ? exp.bullets : existingExp.bullets,
            },
          });
        }
        // Skip if manually edited - don't overwrite
      } else {
        // Create new experience
        await db.workExperience.create({
          data: {
            profileId,
            company: exp.company,
            role: exp.role,
            location: exp.location,
            startDate: parseDateSafe(exp.startDate) || new Date(),
            endDate: parseDateSafe(exp.endDate),
            isCurrent: exp.isCurrent || false,
            bullets: exp.bullets || [],
            source: DataSource.RESUME,
          },
        });
      }
    }

    // Add education (with deduplication)
    for (const edu of data.educations) {
      // Check for existing education by institution + degree (case-insensitive)
      const existingEdu = await db.education.findFirst({
        where: {
          profileId,
          institution: { equals: edu.institution, mode: 'insensitive' },
          degree: { equals: edu.degree, mode: 'insensitive' },
        },
      });

      if (existingEdu) {
        // Update existing record if it came from resume source
        if (existingEdu.source === DataSource.RESUME) {
          await db.education.update({
            where: { id: existingEdu.id },
            data: {
              fieldOfStudy: edu.fieldOfStudy || existingEdu.fieldOfStudy,
              startDate: parseDateSafe(edu.startDate) || existingEdu.startDate,
              endDate: parseDateSafe(edu.endDate) || existingEdu.endDate,
              gpa: edu.gpa || existingEdu.gpa,
            },
          });
        }
        // Skip if manually edited
      } else {
        // Create new education
        await db.education.create({
          data: {
            profileId,
            institution: edu.institution,
            degree: edu.degree,
            fieldOfStudy: edu.fieldOfStudy,
            startDate: parseDateSafe(edu.startDate),
            endDate: parseDateSafe(edu.endDate),
            gpa: edu.gpa,
            source: DataSource.RESUME,
          },
        });
      }
    }

    // Add skills
    for (const skillName of data.skills) {
      // Check if skill already exists
      const existing = await db.skill.findFirst({
        where: { profileId, name: skillName },
      });
      if (!existing) {
        await db.skill.create({
          data: {
            profileId,
            name: skillName,
            source: DataSource.RESUME,
          },
        });
      }
    }

    // Add projects (with deduplication)
    for (const proj of data.projects) {
      // Check for existing project by title (case-insensitive)
      const existingProj = await db.project.findFirst({
        where: {
          profileId,
          title: { equals: proj.name, mode: 'insensitive' },
        },
      });

      if (existingProj) {
        // Update existing record if it came from resume source
        if (existingProj.source === DataSource.RESUME) {
          await db.project.update({
            where: { id: existingProj.id },
            data: {
              description: proj.description || existingProj.description,
              url: proj.url || existingProj.url,
              techStack: proj.technologies?.length ? proj.technologies : existingProj.techStack,
              startDate: parseDateSafe(proj.startDate) || existingProj.startDate,
              endDate: parseDateSafe(proj.endDate) || existingProj.endDate,
            },
          });
        }
        // Skip if manually edited
      } else {
        // Create new project
        await db.project.create({
          data: {
            profileId,
            title: proj.name,
            description: proj.description,
            url: proj.url,
            techStack: proj.technologies || [],
            startDate: parseDateSafe(proj.startDate),
            endDate: parseDateSafe(proj.endDate),
            source: DataSource.RESUME,
          },
        });
      }
    }

    // Add links
    for (const link of data.links) {
      // Check if link already exists
      const existing = await db.link.findFirst({
        where: { profileId, url: link.url },
      });
      if (!existing) {
        await db.link.create({
          data: {
            profileId,
            type: mapLinkType(link.type),
            url: link.url,
            label: link.label,
            source: DataSource.RESUME,
          },
        });
      }
    }

    // Add certifications (with deduplication)
    for (const cert of data.certifications) {
      // Check for existing certification by name + issuer (case-insensitive)
      const existingCert = await db.certification.findFirst({
        where: {
          profileId,
          name: { equals: cert.name, mode: 'insensitive' },
        },
      });

      if (existingCert) {
        // Update existing record if it came from resume source
        if (existingCert.source === DataSource.RESUME) {
          await db.certification.update({
            where: { id: existingCert.id },
            data: {
              issuer: cert.issuer || existingCert.issuer,
              issueDate: parseDateSafe(cert.date) || existingCert.issueDate,
            },
          });
        }
        // Skip if manually edited
      } else {
        // Create new certification
        await db.certification.create({
          data: {
            profileId,
            name: cert.name,
            issuer: cert.issuer || 'Unknown',
            issueDate: parseDateSafe(cert.date),
            source: DataSource.RESUME,
          },
        });
      }
    }

    // Store raw import data for debugging
    await db.rawImportPayload.upsert({
      where: {
        profileId_source: {
          profileId,
          source: DataSource.RESUME,
        },
      },
      create: {
        profileId,
        source: DataSource.RESUME,
        rawData: data as unknown as Prisma.InputJsonValue,
        status: 'COMPLETED',
        processedAt: new Date(),
      },
      update: {
        rawData: data as unknown as Prisma.InputJsonValue,
        status: 'COMPLETED',
        processedAt: new Date(),
      },
    });

    console.log('[AI Resume Save] Successfully saved to profile');

    return { success: true };
  } catch (error) {
    console.error('[AI Resume Save] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save to profile',
    };
  }
}
