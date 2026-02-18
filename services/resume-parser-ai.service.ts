/**
 * AI-Powered Resume Parser Service (Hybrid Approach)
 *
 * This service uses a hybrid approach for maximum reliability:
 * 1. Primary: OpenAI GPT-4 for intelligent parsing (when API key available)
 * 2. Fallback: Rule-based parser for when AI is unavailable
 *
 * The AI approach is superior because:
 * - Understands context and semantic meaning
 * - Handles ANY resume format without regex patterns
 * - Correctly identifies sections regardless of headers used
 * - Extracts structured data from unstructured text
 */

import { logger } from '@/lib/logger';
import OpenAI from 'openai';

const aiParseLogger = logger.child({ source: 'resume-parser-ai' });

// ============================================================================
// TYPES
// ============================================================================

export interface ParsedResumeAI {
  basics: {
    firstName?: string;
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
  confidence: number;
  parseMethod: 'ai' | 'rule-based';
  rawText: string;
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

// ============================================================================
// OPENAI CLIENT
// ============================================================================

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    aiParseLogger.info('No OPENAI_API_KEY found, will use rule-based fallback');
    return null;
  }
  return new OpenAI({ apiKey });
}

// ============================================================================
// AI PARSING PROMPT
// ============================================================================

const RESUME_PARSING_PROMPT = `You are an expert resume parser. Extract structured information from the resume text below.

IMPORTANT RULES:
1. Extract ALL information accurately - do not make up or assume data
2. For dates, use the format as written (e.g., "Jan 2024", "2024", "January 2024")
3. "Present", "Current", or similar means the position/education is ongoing (isCurrent: true)
4. Skills should be individual items, not categories
5. For work experience, extract bullet points as an array
6. If information is not present, omit the field (don't use null or empty strings)
7. For name, the first line usually contains the full name
8. Headline/title usually appears right after or with the name
9. Parse ALL work experiences, education entries, and certifications - don't skip any

Return a JSON object with this EXACT structure (no markdown, just JSON):
{
  "basics": {
    "firstName": "string",
    "lastName": "string",
    "email": "string",
    "phone": "string",
    "location": "string",
    "headline": "string (job title/professional title)",
    "summary": "string (professional summary/objective if present)"
  },
  "workExperiences": [
    {
      "title": "string (job title)",
      "company": "string",
      "location": "string",
      "startDate": "string",
      "endDate": "string (or 'Present')",
      "isCurrent": boolean,
      "bullets": ["string (each responsibility, achievement, or role detail as a separate item)"]
    }
  ],
  "educations": [
    {
      "institution": "string (university/school name)",
      "degree": "string (e.g., 'Bachelor of Science', 'MBA', 'Master of Science')",
      "fieldOfStudy": "string (e.g., 'Computer Science', 'Business Administration')",
      "location": "string",
      "startDate": "string",
      "endDate": "string",
      "gpa": "string (if mentioned)"
    }
  ],
  "skills": ["string (individual skill)"],
  "certifications": [
    {
      "name": "string (certification name)",
      "issuer": "string (issuing organization)",
      "date": "string (date obtained)",
      "credentialId": "string (if mentioned)"
    }
  ],
  "projects": [
    {
      "title": "string",
      "description": "string",
      "url": "string",
      "technologies": ["string"],
      "startDate": "string",
      "endDate": "string"
    }
  ],
  "links": [
    {
      "type": "string (linkedin/github/portfolio/website/twitter)",
      "url": "string",
      "label": "string"
    }
  ]
}

RESUME TEXT:
`;

// ============================================================================
// AI PARSING FUNCTION
// ============================================================================

async function parseWithAI(text: string): Promise<ParsedResumeAI | null> {
  const client = getOpenAIClient();
  if (!client) return null;

  try {
    aiParseLogger.info('Sending resume to OpenAI');
    const startTime = Date.now();

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini', // Fast and cost-effective, good for structured extraction
      messages: [
        {
          role: 'system',
          content:
            'You are a resume parsing assistant. Extract structured data from resumes accurately. Always respond with valid JSON only, no markdown formatting.',
        },
        {
          role: 'user',
          content: RESUME_PARSING_PROMPT + text,
        },
      ],
      temperature: 0.1, // Low temperature for consistent, accurate extraction
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    });

    const elapsed = Date.now() - startTime;
    aiParseLogger.info('OpenAI response received', { duration: elapsed });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      aiParseLogger.error('Empty response from OpenAI');
      return null;
    }

    // Parse the JSON response safely
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      aiParseLogger.error('Failed to parse OpenAI JSON response', parseError);
      return null;
    }
    aiParseLogger.debug('AI response parsed successfully');

    // Transform to our format
    const result: ParsedResumeAI = {
      basics: {
        firstName: parsed.basics?.firstName,
        lastName: parsed.basics?.lastName,
        email: parsed.basics?.email,
        phone: parsed.basics?.phone,
        location: parsed.basics?.location,
        headline: parsed.basics?.headline,
        summary: parsed.basics?.summary,
      },
      workExperiences: (parsed.workExperiences || []).map((exp: WorkExperienceAI) => ({
        title: exp.title || '',
        company: exp.company || '',
        location: exp.location,
        startDate: exp.startDate,
        endDate: exp.endDate,
        isCurrent: exp.isCurrent || exp.endDate?.toLowerCase() === 'present',
        bullets: exp.bullets || [],
      })),
      educations: (parsed.educations || []).map((edu: EducationAI) => ({
        institution: edu.institution || '',
        degree: edu.degree || '',
        fieldOfStudy: edu.fieldOfStudy,
        startDate: edu.startDate,
        endDate: edu.endDate,
        gpa: edu.gpa,
        location: edu.location,
      })),
      skills: parsed.skills || [],
      certifications: (parsed.certifications || []).map((cert: CertificationAI) => ({
        name: cert.name || '',
        issuer: cert.issuer,
        date: cert.date,
        credentialId: cert.credentialId,
      })),
      projects: (parsed.projects || []).map((proj: ProjectAI) => ({
        title: proj.title || '',
        description: proj.description,
        url: proj.url,
        technologies: proj.technologies || [],
        startDate: proj.startDate,
        endDate: proj.endDate,
      })),
      links: (parsed.links || []).map((link: LinkAI) => ({
        type: link.type || 'website',
        url: link.url || '',
        label: link.label,
      })),
      confidence: 0.95, // AI parsing is highly reliable
      parseMethod: 'ai',
      rawText: text,
    };

    // Log summary (no PII)
    aiParseLogger.info('AI extraction complete', {
      experienceCount: result.workExperiences.length,
      educationCount: result.educations.length,
      skillCount: result.skills.length,
      certificationCount: result.certifications.length,
      projectCount: result.projects.length,
      linkCount: result.links.length,
    });

    return result;
  } catch (error) {
    aiParseLogger.error('OpenAI parsing failed', error);
    return null;
  }
}

// ============================================================================
// PDF TEXT EXTRACTION (using pdf-parse for better quality)
// ============================================================================

export async function extractTextFromPDFEnhanced(buffer: Buffer): Promise<string> {
  try {
    aiParseLogger.debug('Starting PDF extraction with pdf-parse');

    // pdf-parse uses CommonJS-style default export
    const pdfParse = (await import('pdf-parse')).default;

    // Parse the PDF buffer
    const result = await pdfParse(buffer);

    aiParseLogger.debug('PDF text extracted', { textLength: result.text?.length });
    return result.text || '';
  } catch (error) {
    aiParseLogger.warn('pdf-parse extraction failed, trying fallback', {
      error: error instanceof Error ? error.message : String(error),
    });

    // Fallback to unpdf if pdf-parse fails
    try {
      const { extractText } = await import('unpdf');
      const uint8Array = new Uint8Array(buffer);
      const { text } = await extractText(uint8Array, { mergePages: true });
      return text || '';
    } catch (fallbackError) {
      aiParseLogger.error('PDF extraction fallback also failed', fallbackError);
      throw new Error('Failed to extract text from PDF');
    }
  }
}

// ============================================================================
// MAIN HYBRID PARSING FUNCTION
// ============================================================================

export async function parseResumeHybrid(buffer: Buffer, mimeType: string): Promise<ParsedResumeAI> {
  aiParseLogger.info('Starting hybrid parse', { mimeType });

  // Step 1: Extract text from PDF
  let text: string;
  if (mimeType === 'application/pdf') {
    text = await extractTextFromPDFEnhanced(buffer);
  } else if (mimeType === 'text/plain') {
    text = buffer.toString('utf-8');
  } else {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  if (!text || text.trim().length < 50) {
    throw new Error('Could not extract meaningful text from the document');
  }

  aiParseLogger.debug('Text extracted', { textLength: text.length });

  // Step 2: Try AI parsing first
  const aiResult = await parseWithAI(text);
  if (aiResult) {
    aiParseLogger.info('AI parsing succeeded');
    return aiResult;
  }

  // Step 3: Fall back to rule-based parsing
  aiParseLogger.info('Falling back to rule-based parser');
  const { parseResumeText } = await import('./resume-parser.service');
  const ruleBasedResult = parseResumeText(text);

  // Convert rule-based result to our AI format
  return {
    basics: {
      firstName: ruleBasedResult.basics?.firstName,
      lastName: ruleBasedResult.basics?.lastName,
      email: ruleBasedResult.basics?.email,
      phone: ruleBasedResult.basics?.phone,
      location: ruleBasedResult.basics?.location,
      headline: ruleBasedResult.basics?.headline,
      summary: ruleBasedResult.basics?.summary,
    },
    workExperiences: ruleBasedResult.workExperiences || [],
    educations: ruleBasedResult.educations || [],
    skills: ruleBasedResult.skills || [],
    certifications:
      ruleBasedResult.certifications?.map((c) => ({
        name: c.name,
        issuer: c.issuer,
        date: c.date,
      })) || [],
    projects: [],
    links:
      ruleBasedResult.links?.map((l) => ({
        type: l.type,
        url: l.url,
        label: l.label,
      })) || [],
    confidence: ruleBasedResult.confidence,
    parseMethod: 'rule-based',
    rawText: text,
  };
}

// ============================================================================
// NORMALIZE FOR DATABASE
// ============================================================================

export interface NormalizedResumeDataAI {
  firstName?: string;
  lastName?: string;
  headline?: string;
  bio?: string;
  email?: string;
  phone?: string;
  location?: string;
  skills?: Array<{ name: string; source: 'RESUME_IMPORT' }>;
  workExperiences?: Array<{
    title: string;
    company: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    isCurrent?: boolean;
    bullets?: string[];
    source: 'RESUME_IMPORT';
  }>;
  educations?: Array<{
    institution: string;
    degree: string;
    fieldOfStudy?: string;
    startDate?: string;
    endDate?: string;
    gpa?: string;
    location?: string;
    source: 'RESUME_IMPORT';
  }>;
  links?: Array<{
    type: string;
    url: string;
    label?: string;
    source: 'RESUME_IMPORT';
  }>;
  certifications?: Array<{
    name: string;
    issuer?: string;
    date?: string;
    source: 'RESUME_IMPORT';
  }>;
  projects?: Array<{
    title: string;
    description?: string;
    url?: string;
    technologies?: string[];
    source: 'RESUME_IMPORT';
  }>;
  _meta: {
    source: string;
    confidence: number;
    parseMethod: 'ai' | 'rule-based';
    rawText: string;
  };
}

export function normalizeResumeDataAI(parsed: ParsedResumeAI): NormalizedResumeDataAI {
  const normalized: NormalizedResumeDataAI = {
    firstName: parsed.basics?.firstName,
    lastName: parsed.basics?.lastName,
    headline: parsed.basics?.headline,
    bio: parsed.basics?.summary,
    email: parsed.basics?.email,
    phone: parsed.basics?.phone,
    location: parsed.basics?.location,
    skills: parsed.skills?.map((name) => ({
      name,
      source: 'RESUME_IMPORT' as const,
    })),
    workExperiences: parsed.workExperiences?.map((exp) => ({
      ...exp,
      source: 'RESUME_IMPORT' as const,
    })),
    educations: parsed.educations?.map((edu) => ({
      ...edu,
      source: 'RESUME_IMPORT' as const,
    })),
    links: parsed.links?.map((link) => ({
      ...link,
      source: 'RESUME_IMPORT' as const,
    })),
    certifications: parsed.certifications?.map((cert) => ({
      ...cert,
      source: 'RESUME_IMPORT' as const,
    })),
    projects: parsed.projects?.map((proj) => ({
      ...proj,
      source: 'RESUME_IMPORT' as const,
    })),
    _meta: {
      source: 'RESUME_IMPORT',
      confidence: parsed.confidence,
      parseMethod: parsed.parseMethod,
      rawText: parsed.rawText,
    },
  };

  aiParseLogger.debug('Normalize AI output', {
    hasFirstName: !!normalized.firstName,
    hasLastName: !!normalized.lastName,
    skillCount: normalized.skills?.length ?? 0,
    experienceCount: normalized.workExperiences?.length ?? 0,
    educationCount: normalized.educations?.length ?? 0,
    certificationCount: normalized.certifications?.length ?? 0,
    parseMethod: normalized._meta.parseMethod,
  });

  return normalized;
}

// ============================================================================
// QUICK CHECK IF AI IS AVAILABLE
// ============================================================================

export function isAIParserAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY;
}
