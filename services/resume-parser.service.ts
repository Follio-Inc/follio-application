/**
 * Resume Parser Service
 *
 * Parses PDF and text resumes into normalized profile data.
 * Uses pdf-parse for PDF extraction and rule-based parsing for structured data.
 */

// import pdfParse from 'pdf-parse'; // Uncomment when pdf-parse is installed

export interface ParsedResume {
  basics?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    location?: string;
    summary?: string;
    headline?: string;
  };
  workExperiences?: {
    title: string;
    company: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    isCurrent?: boolean;
    description?: string;
    bullets?: string[];
  }[];
  educations?: {
    institution: string;
    degree: string;
    fieldOfStudy?: string;
    startDate?: string;
    endDate?: string;
    gpa?: string;
  }[];
  skills?: string[];
  links?: {
    type: string;
    url: string;
    label?: string;
  }[];
  certifications?: {
    name: string;
    issuer: string;
    date?: string;
  }[];
  confidence: number; // 0-1 score indicating parsing confidence
  rawText: string;
}

// Common patterns for resume parsing
const PATTERNS = {
  email: /[\w.-]+@[\w.-]+\.\w+/i,
  phone: /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/,
  linkedin: /linkedin\.com\/in\/[\w-]+/i,
  github: /github\.com\/[\w-]+/i,
  url: /https?:\/\/[^\s]+/gi,
  date: /(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}|\d{1,2}\/\d{4}|\d{4}/gi,
  dateRange:
    /(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}\s*[-–—]\s*(?:Present|Current|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4})/gi,
};

// Section headers to identify resume sections
const SECTION_HEADERS = {
  experience:
    /^(?:work\s+)?experience|employment(?:\s+history)?|professional\s+experience|work\s+history/i,
  education: /^education(?:al)?(?:\s+background)?|academic/i,
  skills: /^(?:technical\s+)?skills|competenc(?:y|ies)|expertise|technologies/i,
  summary: /^(?:professional\s+)?summary|profile|objective|about(?:\s+me)?/i,
  certifications: /^certifications?|licenses?|credentials?/i,
  projects: /^projects?|portfolio/i,
  awards: /^awards?|honors?|achievements?/i,
};

/**
 * Extract text from a PDF buffer
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    // Dynamic import for pdf-parse (only available server-side)
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer);
    return data.text;
  } catch (error) {
    console.error('PDF parsing error:', error);
    throw new Error('Failed to extract text from PDF');
  }
}

/**
 * Parse plain text resume content
 */
export function parseResumeText(text: string): ParsedResume {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  let confidence = 0.5;

  const result: ParsedResume = {
    basics: {},
    workExperiences: [],
    educations: [],
    skills: [],
    links: [],
    certifications: [],
    rawText: text,
    confidence,
  };

  // Extract email
  const emailMatch = text.match(PATTERNS.email);
  if (emailMatch) {
    result.basics!.email = emailMatch[0];
    confidence += 0.1;
  }

  // Extract phone
  const phoneMatch = text.match(PATTERNS.phone);
  if (phoneMatch) {
    result.basics!.phone = phoneMatch[0];
    confidence += 0.05;
  }

  // Extract LinkedIn
  const linkedinMatch = text.match(PATTERNS.linkedin);
  if (linkedinMatch) {
    result.links!.push({
      type: 'LINKEDIN',
      url: `https://${linkedinMatch[0]}`,
      label: 'LinkedIn',
    });
    confidence += 0.05;
  }

  // Extract GitHub
  const githubMatch = text.match(PATTERNS.github);
  if (githubMatch) {
    result.links!.push({
      type: 'GITHUB',
      url: `https://${githubMatch[0]}`,
      label: 'GitHub',
    });
    confidence += 0.05;
  }

  // Try to extract name from first few lines
  const firstLine = lines[0];
  if (firstLine && firstLine.length < 50 && !firstLine.match(PATTERNS.email)) {
    const nameParts = firstLine.split(/\s+/).filter((p) => p.length > 1);
    if (nameParts.length >= 2 && nameParts.length <= 4) {
      result.basics!.firstName = nameParts[0];
      result.basics!.lastName = nameParts.slice(1).join(' ');
      confidence += 0.1;
    }
  }

  // Identify sections
  let currentSection: string | null = null;
  let sectionContent: string[] = [];
  const sections: Record<string, string[]> = {};

  for (const line of lines) {
    // Check if this line is a section header
    let isHeader = false;
    for (const [sectionName, pattern] of Object.entries(SECTION_HEADERS)) {
      if (pattern.test(line)) {
        // Save previous section
        if (currentSection && sectionContent.length > 0) {
          sections[currentSection] = sectionContent;
        }
        currentSection = sectionName;
        sectionContent = [];
        isHeader = true;
        break;
      }
    }

    if (!isHeader && currentSection) {
      sectionContent.push(line);
    }
  }

  // Save last section
  if (currentSection && sectionContent.length > 0) {
    sections[currentSection] = sectionContent;
  }

  // Parse summary section
  if (sections.summary) {
    result.basics!.summary = sections.summary.join(' ');
    confidence += 0.1;
  }

  // Parse skills section
  if (sections.skills) {
    const skillText = sections.skills.join(' ');
    // Split by common delimiters
    const skills = skillText
      .split(/[,;•|]|\s{2,}/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length < 30);
    result.skills = skills;
    if (skills.length > 0) confidence += 0.1;
  }

  // Parse experience section (simplified)
  if (sections.experience) {
    const expText = sections.experience.join('\n');
    // Look for date ranges to identify job entries
    const dateRanges = expText.match(PATTERNS.dateRange) || [];
    if (dateRanges.length > 0) {
      confidence += 0.15;
      // Basic parsing - this would need to be more sophisticated in production
      result.workExperiences = dateRanges.map((dateRange) => ({
        title: 'Position', // Would need better parsing
        company: 'Company', // Would need better parsing
        startDate: dateRange.split(/[-–—]/)[0].trim(),
        endDate: dateRange.includes('Present') ? undefined : dateRange.split(/[-–—]/)[1]?.trim(),
        isCurrent: dateRange.includes('Present'),
      }));
    }
  }

  // Parse education section (simplified)
  if (sections.education) {
    const eduText = sections.education.join('\n');
    const degrees = ['Bachelor', 'Master', 'PhD', 'Ph.D.', 'MBA', 'B.S.', 'M.S.', 'B.A.', 'M.A.'];
    const foundDegree = degrees.find((d) => eduText.includes(d));
    if (foundDegree) {
      result.educations = [
        {
          institution: 'University', // Would need better parsing
          degree: foundDegree,
        },
      ];
      confidence += 0.1;
    }
  }

  result.confidence = Math.min(confidence, 1);
  return result;
}

/**
 * Main entry point for resume parsing
 */
export async function parseResume(input: Buffer | string, mimeType: string): Promise<ParsedResume> {
  let text: string;

  if (typeof input === 'string') {
    text = input;
  } else if (mimeType === 'application/pdf') {
    text = await extractTextFromPDF(input);
  } else if (mimeType === 'text/plain') {
    text = input.toString('utf-8');
  } else {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  return parseResumeText(text);
}

/**
 * Convert parsed resume to normalized profile data
 */
export function normalizeResumeData(parsed: ParsedResume) {
  return {
    firstName: parsed.basics?.firstName || '',
    lastName: parsed.basics?.lastName || '',
    headline: parsed.basics?.headline,
    summary: parsed.basics?.summary,
    location: parsed.basics?.location,
    contactInfo: {
      email: parsed.basics?.email,
      phone: parsed.basics?.phone,
    },
    workExperiences: parsed.workExperiences?.map((exp, index) => ({
      ...exp,
      sortOrder: index,
      source: 'RESUME_IMPORT' as const,
    })),
    educations: parsed.educations?.map((edu, index) => ({
      ...edu,
      sortOrder: index,
      source: 'RESUME_IMPORT' as const,
    })),
    skills: parsed.skills?.map((name, index) => ({
      name,
      sortOrder: index,
      source: 'RESUME_IMPORT' as const,
    })),
    links: parsed.links?.map((link, index) => ({
      ...link,
      sortOrder: index,
      source: 'RESUME_IMPORT' as const,
    })),
    certifications: parsed.certifications?.map((cert, index) => ({
      ...cert,
      sortOrder: index,
      source: 'RESUME_IMPORT' as const,
    })),
    _meta: {
      source: 'RESUME_IMPORT',
      confidence: parsed.confidence,
      rawText: parsed.rawText,
    },
  };
}
