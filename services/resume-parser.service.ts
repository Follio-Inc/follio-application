/**
 * Resume Parser Service - Production Grade Universal Parser
 *
 * A robust, rule-based resume parser designed to handle ANY resume format.
 *
 * Design Principles:
 * 1. NEVER assume a specific format - always try multiple strategies
 * 2. Use pattern matching with extensive fallbacks
 * 3. Handle messy PDF text extraction (single-line, no breaks, merged words)
 * 4. Recognize 100+ variations of section headers
 * 5. Parse dates in ANY format (15+ variations)
 * 6. Handle all bullet styles (10+ types)
 * 7. Smart education parsing (degree-first, uni-first, inline, multi-line)
 * 8. Confidence scoring to indicate parse quality
 */

// ============================================================================
// TYPES
// ============================================================================

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
  workExperiences?: WorkExperience[];
  educations?: Education[];
  skills?: string[];
  links?: Link[];
  certifications?: Certification[];
  confidence: number;
  rawText: string;
}

interface WorkExperience {
  title: string;
  company: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  description?: string;
  bullets?: string[];
}

interface Education {
  institution: string;
  degree: string;
  fieldOfStudy?: string;
  startDate?: string;
  endDate?: string;
  gpa?: string;
  location?: string;
}

interface Link {
  type: string;
  url: string;
  label?: string;
}

interface Certification {
  name: string;
  issuer: string;
  date?: string;
}

interface Section {
  name: string;
  content: string;
  startIndex: number;
  endIndex: number;
}

// ============================================================================
// COMPREHENSIVE KNOWLEDGE BASE
// ============================================================================

/**
 * Section header variations - EXHAUSTIVE list covering all possible formats
 * Each section has 20+ variations to handle different resume styles
 */
const SECTION_HEADERS: Record<string, string[]> = {
  experience: [
    // Standard
    'experience',
    'work experience',
    'professional experience',
    'employment',
    'employment history',
    'work history',
    'career history',
    'professional background',
    'professional history',
    // Variations
    'experiences',
    'work experiences',
    'relevant experience',
    'related experience',
    'industry experience',
    'job history',
    'positions held',
    'career',
    'career experience',
    'employment record',
    'job experience',
    'working experience',
    'professional employment',
    // International
    'arbeitserfahrung', // German
    'expérience professionnelle', // French
    'experiencia laboral', // Spanish
  ],
  education: [
    // Standard
    'education',
    'educational background',
    'academic background',
    'academic history',
    'qualifications',
    'academic qualifications',
    'educational qualifications',
    // Variations
    'education & training',
    'education and training',
    'education/training',
    'academic credentials',
    'academic record',
    'scholastic record',
    'degrees',
    'degree',
    'schooling',
    'studies',
    'academic',
    'academics',
    'educational history',
    'training & education',
    'credentials',
  ],
  skills: [
    // Standard
    'skills',
    'technical skills',
    'professional skills',
    'core competencies',
    'competencies',
    'key skills',
    'skill set',
    'skillset',
    // Variations
    'areas of expertise',
    'expertise',
    'specializations',
    'proficiencies',
    'technical proficiencies',
    'technical expertise',
    'technologies',
    'tech stack',
    'tools',
    'tools & technologies',
    'tools and technologies',
    'technical abilities',
    'abilities',
    'capabilities',
    'strengths',
    'core skills',
    'relevant skills',
    'programming skills',
    'software skills',
    'computer skills',
    'it skills',
    'language skills',
    'languages & tools',
    'technical competencies',
    'skill summary',
    'skills summary',
    'summary of skills',
    'key competencies',
    'knowledge',
    'technical knowledge',
  ],
  summary: [
    // Standard
    'summary',
    'professional summary',
    'executive summary',
    'career summary',
    'profile',
    'professional profile',
    // Variations
    'about',
    'about me',
    'objective',
    'career objective',
    'professional objective',
    'personal statement',
    'career statement',
    'overview',
    'professional overview',
    'introduction',
    'bio',
    'biography',
    'snapshot',
    'career snapshot',
    'highlights',
    'career highlights',
    'qualifications summary',
    'summary of qualifications',
    'key highlights',
    'personal profile',
    'self summary',
  ],
  certifications: [
    'certifications',
    'certification',
    'certificates',
    'certificate',
    'licenses',
    'license',
    'credentials',
    'professional certifications',
    'professional credentials',
    'accreditations',
    'accreditation',
    'licenses & certifications',
    'licenses and certifications',
    'certifications & licenses',
    'training & certifications',
    'certificates & licenses',
    'certified',
  ],
  projects: [
    'projects',
    'project',
    'personal projects',
    'side projects',
    'portfolio',
    'key projects',
    'major projects',
    'notable projects',
    'selected projects',
    'project experience',
    'academic projects',
    'professional projects',
    'project work',
    'work samples',
  ],
  awards: [
    'awards',
    'award',
    'honors',
    'honor',
    'achievements',
    'achievement',
    'accomplishments',
    'accomplishment',
    'recognition',
    'recognitions',
    'accolades',
    'distinctions',
    'awards & honors',
    'honors & awards',
    'achievements & awards',
  ],
  publications: [
    'publications',
    'publication',
    'papers',
    'paper',
    'research',
    'research papers',
    'published work',
    'articles',
    'journal articles',
    'conference papers',
    'scholarly work',
  ],
  volunteer: [
    'volunteer',
    'volunteer experience',
    'volunteering',
    'community service',
    'community involvement',
    'volunteer work',
    'civic activities',
    'social work',
  ],
  languages: [
    'languages',
    'language',
    'language skills',
    'spoken languages',
    'language proficiency',
    'linguistic skills',
  ],
  interests: [
    'interests',
    'hobbies',
    'hobbies & interests',
    'personal interests',
    'extracurricular',
    'extracurricular activities',
    'activities',
  ],
  references: [
    'references',
    'reference',
    'referees',
    'professional references',
    'references available',
  ],
};

/**
 * Job titles database - used to detect where name ends and headline begins
 * Organized by category for maintainability
 */
const JOB_TITLE_KEYWORDS = [
  // Engineering
  'engineer',
  'developer',
  'programmer',
  'architect',
  'devops',
  'sre',
  'qa',
  'tester',
  'technical',
  'software',
  'senior',
  'junior',
  'staff',
  'principal',
  // Management
  'manager',
  'director',
  'lead',
  'head',
  'chief',
  'vp',
  'president',
  'ceo',
  'cto',
  'cfo',
  'coo',
  'founder',
  'program',
  'project',
  'product',
  // Design
  'designer',
  'ux',
  'ui',
  'creative',
  'artist',
  // Data
  'analyst',
  'scientist',
  'data',
  'ml',
  'ai',
  'machine learning',
  // Product
  'product',
  'project',
  'program',
  'scrum',
  'agile',
  // Other
  'consultant',
  'specialist',
  'coordinator',
  'administrator',
  'executive',
  'associate',
  'assistant',
  'intern',
  'trainee',
  'officer',
  'representative',
  // Specific titles
  'accountant',
  'attorney',
  'lawyer',
  'nurse',
  'doctor',
  'teacher',
  'professor',
  'researcher',
  'sales',
  'marketing',
  'hr',
  'recruiter',
  'writer',
  'editor',
  'journalist',
];

/**
 * Company suffixes to identify company names
 */
const COMPANY_SUFFIXES = [
  'inc',
  'inc.',
  'incorporated',
  'llc',
  'llp',
  'ltd',
  'ltd.',
  'limited',
  'corp',
  'corp.',
  'corporation',
  'co',
  'co.',
  'company',
  'group',
  'holdings',
  'enterprises',
  'solutions',
  'technologies',
  'tech',
  'software',
  'systems',
  'services',
  'consulting',
  'partners',
  'associates',
  'gmbh',
  'ag',
  'plc',
  'pvt',
  'private',
];

/**
 * Degree patterns - from most specific to least
 */
const DEGREE_PATTERNS = [
  // Doctoral
  {
    pattern: /\b(?:ph\.?d\.?|doctor(?:ate)?|d\.?b\.?a\.?|j\.?d\.?|m\.?d\.?|ed\.?d\.?)\b/gi,
    type: 'doctoral',
    label: 'Doctorate',
  },

  // Masters - Full names first
  {
    pattern:
      /\bmaster(?:'?s?)?\s+of\s+(?:science|arts|business|engineering|technology|fine\s+arts|education|law|public\s+administration|social\s+work)/gi,
    type: 'masters',
    label: 'Master',
  },
  { pattern: /\bm\.s\.?\b(?!\s*,\s*[a-z]{2}\s)/gi, type: 'masters', label: 'M.S.' }, // M.S. but not ", MS, " (state)
  { pattern: /\bm\.a\.?\b(?!\s*,|\s+usa|\s+us\b)/gi, type: 'masters', label: 'M.A.' }, // M.A. but not ", MA" (state)
  { pattern: /\bm\.?b\.?a\.?\b/gi, type: 'masters', label: 'M.B.A.' },
  { pattern: /\bm\.?eng\.?\b/gi, type: 'masters', label: 'M.Eng' },
  { pattern: /\bm\.?tech\.?\b/gi, type: 'masters', label: 'M.Tech' },
  { pattern: /\bmsc\b/gi, type: 'masters', label: 'MSc' },
  { pattern: /\bmaster(?:'?s?)?\b/gi, type: 'masters', label: 'Master' },

  // Bachelors - Full names first
  {
    pattern:
      /\bbachelor(?:'?s?)?\s+of\s+(?:science|arts|engineering|technology|fine\s+arts|business|commerce|education)/gi,
    type: 'bachelors',
    label: 'Bachelor',
  },
  { pattern: /\bb\.s\.?\b(?!\s*,\s*[a-z]{2}\s)/gi, type: 'bachelors', label: 'B.S.' },
  { pattern: /\bb\.a\.?\b(?!\s*,|\s+usa|\s+us\b)/gi, type: 'bachelors', label: 'B.A.' },
  { pattern: /\bb\.?eng\.?\b/gi, type: 'bachelors', label: 'B.Eng' },
  { pattern: /\bb\.?tech\.?\b/gi, type: 'bachelors', label: 'B.Tech' },
  { pattern: /\bbsc\b/gi, type: 'bachelors', label: 'BSc' },
  { pattern: /\bbachelor(?:'?s?)?\b/gi, type: 'bachelors', label: 'Bachelor' },

  // Associates
  {
    pattern: /\bassociate(?:'?s?)?\s+(?:of\s+)?(?:science|arts|applied\s+science)/gi,
    type: 'associate',
    label: 'Associate',
  },
  { pattern: /\ba\.s\.?\b/gi, type: 'associate', label: 'A.S.' },
  { pattern: /\ba\.a\.?\b/gi, type: 'associate', label: 'A.A.' },
  { pattern: /\bassociate(?:'?s?)?\b/gi, type: 'associate', label: 'Associate' },

  // Other
  { pattern: /\bdiploma\b/gi, type: 'other', label: 'Diploma' },
  { pattern: /\bcertificate\b/gi, type: 'other', label: 'Certificate' },
  { pattern: /\bhigh\s+school\s+diploma\b/gi, type: 'highschool', label: 'High School' },
  { pattern: /\bged\b/gi, type: 'highschool', label: 'GED' },
];

/**
 * University/Institution patterns
 */
const INSTITUTION_PATTERNS = [
  /([A-Z][A-Za-z\s&'-]+(?:University|College|Institute|School|Academy|Polytechnic))/gi,
  /(?:University|College|Institute)\s+of\s+([A-Z][A-Za-z\s&'-]+)/gi,
  /(MIT|IIT|NIT|BITS|Stanford|Harvard|Berkeley|Yale|Princeton|Cornell|CMU|Carnegie\s+Mellon|UCLA|USC|NYU|Columbia|Oxford|Cambridge|ETH|Imperial|Caltech|Georgia\s+Tech|Northeastern|Boston\s+University)/gi,
];

/**
 * Date patterns - comprehensive list covering ALL formats
 */
const DATE_PATTERNS = {
  // Month name patterns (most common in resumes)
  monthYearRange:
    /(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[.,]?\s*['']?\d{2,4}\s*[-–—~to]+\s*(?:Present|Current|Now|Ongoing|Today|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[.,]?\s*['']?\d{2,4})/gi,

  // Year-only range (2020 - 2023, 2020-Present)
  yearRange: /\b(19|20)\d{2}\s*[-–—~to]+\s*(?:Present|Current|Now|Ongoing|Today|(19|20)\d{2})\b/gi,

  // Numeric date ranges (01/2020 - 12/2023, 2020/01 - 2023/12)
  numericDateRange:
    /\b(?:\d{1,2}[-\/]\d{2,4}|\d{4}[-\/]\d{1,2})\s*[-–—~to]+\s*(?:Present|Current|Now|(?:\d{1,2}[-\/]\d{2,4}|\d{4}[-\/]\d{1,2}))\b/gi,

  // Single month/year (January 2020, Jan 2020, 01/2020)
  monthYear:
    /(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[.,]?\s*['']?\d{2,4}/gi,

  // Year only
  yearOnly: /\b(19|20)\d{2}\b/g,

  // Present/Current indicators
  current: /\b(?:Present|Current|Now|Ongoing|Today|Till\s+Date|To\s+Date)\b/gi,
};

/**
 * Bullet point patterns - all variations
 */
const BULLET_PATTERNS = [
  /^[\s]*[•●○◦▪▸►◆★☆✦✧✓✔→⁃■□▶]\s*/, // Unicode bullets
  /^[\s]*[-–—]\s+/, // Dashes
  /^[\s]*\*\s+/, // Asterisks
  /^[\s]*>\s+/, // Arrows
  /^[\s]*\d+[.)]\s+/, // Numbers: 1. or 1)
  /^[\s]*[a-zA-Z][.)]\s+/, // Letters: a. or a)
  /^[\s]*\[\s*\]\s+/, // Checkboxes
  /^[\s]*\(\s*\)\s+/, // Empty parens
];

/**
 * Contact patterns
 */
const CONTACT_PATTERNS = {
  email: /[a-zA-Z0-9._%+'-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,

  // Phone - international formats
  phone: [
    /\+?1?\s*[-.(]?\s*\d{3}\s*[-.)]\s*\d{3}\s*[-.]?\s*\d{4}/g, // US format
    /\+?\d{1,4}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g, // International
    /\b\d{10,12}\b/g, // Plain 10-12 digits
  ],

  // URLs
  linkedin: /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+\/?/gi,
  github: /(?:https?:\/\/)?(?:www\.)?github\.com\/[\w-]+\/?/gi,
  twitter: /(?:https?:\/\/)?(?:www\.)?(?:twitter|x)\.com\/[\w-]+\/?/gi,
  portfolio: /(?:https?:\/\/)?(?:www\.)?[\w-]+\.(?:dev|io|com|org|net|me|co)(?:\/[\w-]*)*\/?/gi,

  // Location
  location: [
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2}),?\s*(USA?|United\s+States)?/gi, // City, ST, USA
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})\b/g, // City, ST
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*(India|UK|Canada|Australia|Germany|France|Singapore|Japan|China|Brazil|Mexico|Spain|Italy|Netherlands|Ireland|Switzerland)/gi,
  ],
};

// ============================================================================
// PDF EXTRACTION
// ============================================================================

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    console.log('[PDF] Starting extraction, buffer size:', buffer.length);
    const { extractText } = await import('unpdf');
    const uint8Array = new Uint8Array(buffer);
    const { text } = await extractText(uint8Array, { mergePages: true });
    console.log('[PDF] Extracted text length:', text?.length);
    return text || '';
  } catch (error) {
    console.error('[PDF] Extraction error:', error);
    throw new Error('Failed to extract text from PDF.');
  }
}

// ============================================================================
// TEXT PREPROCESSING - Handle messy PDF output
// ============================================================================

function preprocessText(rawText: string): string {
  let text = rawText;

  // Normalize unicode
  text = text.normalize('NFKC');

  // Normalize various bullet characters to standard bullet
  text = text.replace(/[○◦▪▸►◆★☆✦✧✓✔→⁃■□▶]/g, '•');

  // Normalize whitespace
  text = text.replace(/\r\n/g, '\n');
  text = text.replace(/\r/g, '\n');
  text = text.replace(/\t/g, ' ');
  text = text.replace(/[ ]{2,}/g, ' ');

  // CRITICAL: Insert line breaks before KNOWN section headers
  // These are the most common exact patterns that should ALWAYS start on new line
  const criticalHeaders = [
    'Professional Experience',
    'Work Experience',
    'Experience',
    'Employment History',
    'Employment',
    'Education',
    'Educational Background',
    'Academic Background',
    'Skills',
    'Technical Skills',
    'Core Competencies',
    'Key Skills',
    'Summary',
    'Professional Summary',
    'Profile',
    'About',
    'Objective',
    'Certifications',
    'Certificates',
    'Projects',
    'Awards',
    'Honors',
    'Publications',
    'Volunteer',
    'Languages',
    'References',
    // ALL CAPS versions
    'PROFESSIONAL EXPERIENCE',
    'WORK EXPERIENCE',
    'EXPERIENCE',
    'EDUCATION',
    'SKILLS',
    'TECHNICAL SKILLS',
    'SUMMARY',
    'CERTIFICATIONS',
    'PROJECTS',
  ];

  for (const header of criticalHeaders) {
    // Match header preceded by any character (not newline) - add newline before
    const escapedHeader = header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Use word boundary to avoid partial matches
    const regex = new RegExp(`([^\\n])(\\b${escapedHeader}\\b)`, 'g');
    text = text.replace(regex, '$1\n$2');
  }

  // Insert line breaks before bullet points (• or - followed by capital letter)
  text = text.replace(/([^\n])([•●])\s*([A-Z])/g, '$1\n$2 $3');
  text = text.replace(/([^\n])\s+-\s+([A-Z])/g, '$1\n- $2');

  // Insert line breaks before date ranges (they often start new entries)
  // Match "Month Year" or "Month 'YY" patterns
  text = text.replace(
    /([^\n\d])((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*['']?\d{2,4})/gi,
    '$1\n$2'
  );

  // Insert line breaks before company names with common suffixes
  text = text.replace(
    /([^\n])(\b[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*\s+(?:Inc|LLC|Ltd|Corp|Co)\b)/g,
    '$1\n$2'
  );

  // Clean up multiple newlines
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/^\n+/, '');

  console.log('[Preprocess] Sample after preprocessing:', text.substring(0, 500));

  return text.trim();
}

// ============================================================================
// SECTION IDENTIFICATION - Fuzzy matching with confidence
// ============================================================================

function identifySections(text: string): Section[] {
  const sections: Section[] = [];
  const lines = text.split('\n');

  let currentSection: Section | null = null;
  let charIndex = 0;

  for (const line of lines) {
    const trimmedLine = line.trim().toLowerCase();
    const originalLine = line.trim();

    // Check if this line matches any section header
    let matchedSection: string | null = null;

    // Only consider SHORT lines as potential headers
    // Headers are typically standalone - "SKILLS" or "Work Experience:"
    // NOT embedded in sentences like "...technical skills and..."
    if (originalLine.length > 0 && originalLine.length < 50) {
      for (const [sectionType, headers] of Object.entries(SECTION_HEADERS)) {
        for (const header of headers) {
          const headerLower = header.toLowerCase();
          // STRICT matching - must be exact or with colon only (case-insensitive)
          // This prevents matching "technical skills" in middle of text
          if (
            trimmedLine === headerLower ||
            trimmedLine === headerLower + ':' ||
            trimmedLine === headerLower + ' :'
          ) {
            matchedSection = sectionType;
            console.log(`[Sections] Matched header "${originalLine}" as ${sectionType}`);
            break;
          }
        }
        if (matchedSection) break;
      }
    }

    if (matchedSection) {
      // Save previous section
      if (currentSection) {
        currentSection.endIndex = charIndex - 1;
        sections.push(currentSection);
      }

      currentSection = {
        name: matchedSection,
        content: '',
        startIndex: charIndex,
        endIndex: -1,
      };
    } else if (currentSection) {
      currentSection.content += (currentSection.content ? '\n' : '') + line;
    }

    charIndex += line.length + 1;
  }

  // Close last section
  if (currentSection) {
    currentSection.endIndex = text.length;
    sections.push(currentSection);
  }

  console.log(
    '[Sections] Identified:',
    sections.map((s) => s.name)
  );
  return sections;
}

function getSectionContent(sections: Section[], name: string): string | undefined {
  const section = sections.find((s) => s.name === name);
  return section?.content;
}

// ============================================================================
// CONTACT EXTRACTION
// ============================================================================

function extractEmail(text: string): string | undefined {
  const match = text.match(CONTACT_PATTERNS.email);
  return match?.[0];
}

function extractPhone(text: string): string | undefined {
  for (const pattern of CONTACT_PATTERNS.phone) {
    const match = text.match(pattern);
    if (match) {
      // Return the first valid-looking phone number
      const phone = match[0].replace(/[^0-9+]/g, '');
      if (phone.length >= 10) return phone;
    }
  }
  return undefined;
}

function extractLinks(text: string): Link[] {
  const links: Link[] = [];

  const linkedin = text.match(CONTACT_PATTERNS.linkedin);
  if (linkedin) {
    links.push({ type: 'linkedin', url: linkedin[0] });
  }

  const github = text.match(CONTACT_PATTERNS.github);
  if (github) {
    links.push({ type: 'github', url: github[0] });
  }

  const twitter = text.match(CONTACT_PATTERNS.twitter);
  if (twitter) {
    links.push({ type: 'twitter', url: twitter[0] });
  }

  // Portfolio/website (but not linkedin/github)
  const portfolioMatches = text.match(CONTACT_PATTERNS.portfolio) || [];
  for (const url of portfolioMatches) {
    if (!url.includes('linkedin') && !url.includes('github') && !url.includes('twitter')) {
      links.push({ type: 'portfolio', url });
      break;
    }
  }

  return links;
}

function extractLocation(text: string): string | undefined {
  for (const pattern of CONTACT_PATTERNS.location) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return undefined;
}

// ============================================================================
// NAME & HEADLINE EXTRACTION
// ============================================================================

function containsJobTitle(text: string): boolean {
  const lower = text.toLowerCase();
  return JOB_TITLE_KEYWORDS.some((keyword) => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    return regex.test(lower);
  });
}

function extractNameAndHeadline(text: string): {
  firstName?: string;
  lastName?: string;
  headline?: string;
} {
  // Get the first 500 characters (header area)
  const headerArea = text.substring(0, 500);
  const lines = headerArea.split('\n').filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return {};
  }

  const firstLine = lines[0].trim();

  // Remove email, phone, location from first line
  const cleanedFirstLine = firstLine
    .replace(CONTACT_PATTERNS.email, '')
    .replace(/\+?[\d\s()-]{10,}/g, '')
    .trim();

  let nameStr = cleanedFirstLine;
  let headline: string | undefined;

  // STRATEGY 1: Look for job title keywords in the text first
  // This handles cases like "John Doe Technical Program Manager | PMP..."
  // where we need to split at "Technical", not at "|"
  const words = cleanedFirstLine.split(/\s+/);

  // Find the FIRST word that looks like start of a job title
  for (let i = 1; i < words.length; i++) {
    const word = words[i].toLowerCase();
    // Check if this word is a job title keyword
    if (JOB_TITLE_KEYWORDS.includes(word)) {
      // Found job title start - everything before is name
      nameStr = words.slice(0, i).join(' ');
      headline = words.slice(i).join(' ');
      console.log(`[Name] Split at job title keyword "${word}" at position ${i}`);
      break;
    }
  }

  // STRATEGY 2: If no job title found, try separators
  if (!headline) {
    const pipeIndex = cleanedFirstLine.indexOf('|');
    const dashIndex = cleanedFirstLine.indexOf(' - ');
    const commaIndex = cleanedFirstLine.indexOf(',');

    if (pipeIndex > 0 && pipeIndex < 50) {
      nameStr = cleanedFirstLine.substring(0, pipeIndex).trim();
      headline = cleanedFirstLine.substring(pipeIndex + 1).trim();
    } else if (dashIndex > 0 && dashIndex < 50) {
      nameStr = cleanedFirstLine.substring(0, dashIndex).trim();
      headline = cleanedFirstLine.substring(dashIndex + 3).trim();
    } else if (commaIndex > 0 && commaIndex < 40) {
      // Only use comma if it's very close to start (likely separating name from title)
      const afterComma = cleanedFirstLine.substring(commaIndex + 1).trim();
      if (containsJobTitle(afterComma)) {
        nameStr = cleanedFirstLine.substring(0, commaIndex).trim();
        headline = afterComma;
      }
    }
  }

  // Clean headline - remove separator characters from start
  if (headline) {
    headline = headline.replace(/^[|\-,]+\s*/, '').trim();
  }

  // If no headline found from first line, check second line
  if (!headline && lines.length > 1 && containsJobTitle(lines[1])) {
    headline = lines[1].trim();
  }

  // Parse name into first/last
  const nameParts = nameStr.split(/\s+/).filter((p) => p.length > 0);

  // Remove common prefixes/suffixes
  const prefixes = ['mr', 'mrs', 'ms', 'dr', 'prof'];
  const suffixes = ['jr', 'sr', 'ii', 'iii', 'iv', 'phd', 'md', 'esq'];

  const filtered = nameParts.filter((p) => {
    const lower = p.toLowerCase().replace(/[.,]/g, '');
    return !prefixes.includes(lower) && !suffixes.includes(lower);
  });

  const firstName = filtered[0];
  const lastName = filtered.length > 1 ? filtered.slice(1).join(' ') : undefined;

  console.log('[Name] Extracted:', firstName, lastName);
  console.log('[Headline] Extracted:', headline);

  return { firstName, lastName, headline };
}

// ============================================================================
// SUMMARY EXTRACTION
// ============================================================================

function extractSummary(text: string, sections: Section[]): string | undefined {
  const summaryContent = getSectionContent(sections, 'summary');
  if (summaryContent) {
    return summaryContent.trim().substring(0, 2000);
  }

  // Fallback: Look for summary-like content at the top
  const lines = text.split('\n');
  const summaryLines: string[] = [];

  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const line = lines[i].trim();

    // Skip short lines and contact info
    if (line.length < 20) continue;
    if (line.match(CONTACT_PATTERNS.email)) continue;
    if (line.match(/\d{10}/)) continue;

    // Look for paragraph-like text
    if (line.length > 50 && !containsJobTitle(line)) {
      summaryLines.push(line);
      if (summaryLines.length >= 3) break;
    }
  }

  return summaryLines.length > 0 ? summaryLines.join(' ') : undefined;
}

// ============================================================================
// SKILLS EXTRACTION
// ============================================================================

function extractSkills(text: string, sections: Section[]): string[] {
  const skillsContent = getSectionContent(sections, 'skills');
  if (!skillsContent) {
    console.log('[Skills] No skills section found');
    return [];
  }

  console.log('[Skills] Section content:', skillsContent.substring(0, 200));

  const skills: string[] = [];

  // Split by common delimiters
  const parts = skillsContent.split(/[,•|·;\n]+/);

  for (const part of parts) {
    let skill = part.trim();

    // Remove bullet patterns
    skill = skill.replace(/^[-*>●○◦▪]\s*/, '');
    skill = skill.replace(/^\d+[.)]\s*/, '');

    // Remove category labels (e.g., "Languages:", "Tools:")
    skill = skill.replace(/^[A-Za-z\s]+:\s*/, '');

    // Skip if too short or too long
    if (skill.length < 2 || skill.length > 50) continue;

    // Skip if it's a sentence (has too many words)
    if (skill.split(/\s+/).length > 5) continue;

    // Skip if it looks like a header
    const lowerSkill = skill.toLowerCase();
    if (Object.values(SECTION_HEADERS).flat().includes(lowerSkill)) continue;

    skills.push(skill);
  }

  // Deduplicate
  const uniqueSkills = [...new Set(skills)];
  console.log('[Skills] Extracted:', uniqueSkills.length, 'skills');

  return uniqueSkills;
}

// ============================================================================
// DATE PARSING
// ============================================================================

function parseDateRange(dateStr: string): { start?: string; end?: string; isCurrent: boolean } {
  const isCurrent = DATE_PATTERNS.current.test(dateStr);

  // Try to extract start and end dates
  const dates = dateStr.split(/\s*[-–—~to]+\s*/i);

  return {
    start: dates[0]?.trim(),
    end: isCurrent ? 'Present' : dates[1]?.trim(),
    isCurrent,
  };
}

function findAllDateRanges(text: string): { match: string; index: number }[] {
  const ranges: { match: string; index: number }[] = [];

  // Try each date pattern
  for (const [patternName, pattern] of Object.entries(DATE_PATTERNS)) {
    if (patternName === 'current' || patternName === 'yearOnly' || patternName === 'monthYear')
      continue;

    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      // Avoid duplicates
      if (!ranges.some((r) => Math.abs(r.index - match!.index) < 10)) {
        ranges.push({ match: match[0], index: match.index });
      }
    }
  }

  return ranges.sort((a, b) => a.index - b.index);
}

// ============================================================================
// EXPERIENCE EXTRACTION
// ============================================================================

function extractBullets(text: string): string[] {
  const bullets: string[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Check if line starts with a bullet pattern
    const isBullet = BULLET_PATTERNS.some((pattern) => pattern.test(trimmed));

    if (isBullet || (trimmed.length > 20 && /^[A-Z]/.test(trimmed) && !containsJobTitle(trimmed))) {
      // Clean the bullet
      let bullet = trimmed;
      for (const pattern of BULLET_PATTERNS) {
        bullet = bullet.replace(pattern, '');
      }
      bullet = bullet.trim();

      if (bullet.length > 10 && bullet.length < 500) {
        bullets.push(bullet);
      }
    }
  }

  return bullets;
}

function parseExperienceEntry(text: string, dateRange: string): WorkExperience {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);

  let title = '';
  let company = '';

  // Parse dates
  const dates = parseDateRange(dateRange);

  // Try to identify company and title from text before the date
  const dateIndex = text.indexOf(dateRange);
  const beforeDate = dateIndex > 0 ? text.substring(0, dateIndex) : text.substring(0, 200);

  // Look for company suffix
  const companyMatch = beforeDate.match(
    new RegExp(`([A-Z][A-Za-z\\s&.'-]+(?:${COMPANY_SUFFIXES.join('|')})[.,]?)`, 'i')
  );
  if (companyMatch) {
    company = companyMatch[1].trim();
  }

  // Look for job title keywords
  for (const line of lines.slice(0, 5)) {
    if (containsJobTitle(line) && !title) {
      title = line.replace(/[|,]/g, ' ').trim();
      // Clean up title
      title = title.replace(new RegExp(`(${COMPANY_SUFFIXES.join('|')})`, 'gi'), '').trim();
      break;
    }
  }

  // If no title found, use first line
  if (!title && lines.length > 0) {
    title = lines[0].substring(0, 100);
  }

  // If no company found, try second line
  if (!company && lines.length > 1) {
    company = lines[1].substring(0, 100);
  }

  // Extract location
  const location = extractLocation(beforeDate);

  // Extract bullets
  const bullets = extractBullets(text);

  return {
    title: title || 'Position',
    company: company || 'Company',
    location,
    startDate: dates.start,
    endDate: dates.end,
    isCurrent: dates.isCurrent,
    bullets,
  };
}

function extractExperiences(text: string, sections: Section[]): WorkExperience[] {
  const experiences: WorkExperience[] = [];
  let expContent = getSectionContent(sections, 'experience');

  // Fallback: If no experience section, try to find dates in the text
  if (!expContent) {
    console.log('[Experience] No dedicated section found, trying fallback...');

    // Find date ranges in full text
    const dateRanges = findAllDateRanges(text);

    // Filter out dates that are likely in education section
    const educationStart = text.toLowerCase().indexOf('education');
    const filteredRanges = dateRanges.filter((d) => {
      if (educationStart === -1) return true;
      return d.index < educationStart || d.index > educationStart + 500;
    });

    if (filteredRanges.length > 0) {
      // Use text from first date to education section
      const startIndex = Math.max(0, filteredRanges[0].index - 300);
      const endIndex = educationStart > 0 ? educationStart : text.length;
      expContent = text.substring(startIndex, endIndex);
    }
  }

  if (!expContent) {
    console.log('[Experience] No experience content found');
    return experiences;
  }

  console.log('[Experience] Section content:', expContent.substring(0, 200));

  // Find all date ranges in experience content
  const dateRanges = findAllDateRanges(expContent);
  console.log(
    '[Experience] Date ranges found:',
    dateRanges.map((d) => d.match)
  );

  if (dateRanges.length === 0) {
    return experiences;
  }

  // Parse each experience entry based on date ranges
  for (let i = 0; i < dateRanges.length; i++) {
    const current = dateRanges[i];
    const next = dateRanges[i + 1];

    // Get text for this entry
    const entryStart = i === 0 ? 0 : dateRanges[i - 1].index + dateRanges[i - 1].match.length;
    const entryEnd = next ? next.index : expContent.length;
    const entryText = expContent.substring(entryStart, entryEnd);

    const exp = parseExperienceEntry(entryText, current.match);
    experiences.push(exp);
  }

  console.log('[Experience] Extracted:', experiences.length, 'experiences');
  return experiences;
}

// ============================================================================
// EDUCATION EXTRACTION
// ============================================================================

function findInstitution(text: string): string | undefined {
  for (const pattern of INSTITUTION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return match[1] || match[0];
    }
  }
  return undefined;
}

function findFieldOfStudy(text: string): string | undefined {
  // Look for "in [Field]", "of [Field]", "- [Field]", ": [Field]"
  const patterns = [
    /(?:in|of)\s+([A-Z][A-Za-z\s&]+?)(?:\s*[-–—,|]|\s*\d|\s*$)/i,
    /[-:]\s*([A-Z][A-Za-z\s&]+?)(?:\s*[-–—,|]|\s*\d|\s*$)/,
    /Major:?\s*([A-Z][A-Za-z\s&]+?)(?:\s*[-–—,|]|\s*\d|\s*$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const field = match[1].trim();
      // Validate it's not a location or institution
      if (!field.match(/University|College|School|Boston|York|Angeles/i) && field.length > 2) {
        return field;
      }
    }
  }
  return undefined;
}

function extractEducation(text: string, sections: Section[]): Education[] {
  const educations: Education[] = [];
  const eduContent = getSectionContent(sections, 'education');

  if (!eduContent) {
    console.log('[Education] No education section found');
    return educations;
  }

  console.log('[Education] Section content:', eduContent.substring(0, 300));

  // Find all degree mentions
  const degreePositions: { label: string; type: string; index: number }[] = [];

  for (const { pattern, type, label } of DEGREE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(eduContent)) !== null) {
      // Context check: Avoid matching state abbreviations
      const before = eduContent.substring(Math.max(0, match.index - 10), match.index);
      const after = eduContent.substring(
        match.index + match[0].length,
        match.index + match[0].length + 10
      );

      // Skip if preceded by comma (likely "City, MA")
      if (before.match(/,\s*$/)) continue;
      // Skip if followed by comma or USA (likely state)
      if (after.match(/^\s*,/) || after.match(/^\s+usa/i)) continue;

      // Avoid duplicates
      if (!degreePositions.some((d) => Math.abs(d.index - match!.index) < 30)) {
        console.log(`[Education] Found degree "${label}" at index ${match.index}`);
        degreePositions.push({ label, type, index: match.index });
      }
    }
  }

  // Sort by position
  degreePositions.sort((a, b) => a.index - b.index);
  console.log(
    '[Education] Degrees found:',
    degreePositions.map((d) => d.label)
  );

  if (degreePositions.length === 0) {
    // No degrees found - try to find just institutions
    const institution = findInstitution(eduContent);
    if (institution) {
      educations.push({ institution, degree: 'Degree' });
    }
    return educations;
  }

  // Parse each education entry
  for (let i = 0; i < degreePositions.length; i++) {
    const current = degreePositions[i];
    const next = degreePositions[i + 1];

    // Get text for this entry
    const entryStart = Math.max(0, current.index - 100);
    const entryEnd = next ? Math.min(next.index + 100, eduContent.length) : eduContent.length;
    const entryText = eduContent.substring(entryStart, entryEnd);

    const education: Education = {
      institution: findInstitution(entryText) || 'University',
      degree: current.label,
      fieldOfStudy: findFieldOfStudy(entryText),
    };

    // Find dates
    const dateRanges = findAllDateRanges(entryText);
    if (dateRanges.length > 0) {
      const dates = parseDateRange(dateRanges[0].match);
      education.startDate = dates.start;
      education.endDate = dates.end;
    }

    // Find location
    education.location = extractLocation(entryText);

    // Find GPA
    const gpaMatch = entryText.match(/GPA:?\s*([\d.]+)/i);
    if (gpaMatch) {
      education.gpa = gpaMatch[1];
    }

    educations.push(education);
  }

  console.log('[Education] Extracted:', educations.length, 'entries');
  return educations;
}

// ============================================================================
// CERTIFICATIONS EXTRACTION
// ============================================================================

function extractCertifications(text: string, sections: Section[]): Certification[] {
  const certifications: Certification[] = [];
  const certContent = getSectionContent(sections, 'certifications');

  if (!certContent) return certifications;

  const lines = certContent.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 5 && trimmed.length < 200) {
      // Clean bullet points
      let cert = trimmed;
      for (const pattern of BULLET_PATTERNS) {
        cert = cert.replace(pattern, '');
      }

      certifications.push({
        name: cert.trim(),
        issuer: '',
      });
    }
  }

  return certifications;
}

// ============================================================================
// CONFIDENCE SCORING
// ============================================================================

function calculateConfidence(result: ParsedResume): number {
  let score = 0;
  let maxScore = 0;

  // Name (20 points)
  maxScore += 20;
  if (result.basics?.firstName) score += 10;
  if (result.basics?.lastName) score += 10;

  // Contact (20 points)
  maxScore += 20;
  if (result.basics?.email) score += 10;
  if (result.basics?.phone) score += 5;
  if (result.links && result.links.length > 0) score += 5;

  // Experience (30 points)
  maxScore += 30;
  if (result.workExperiences && result.workExperiences.length > 0) {
    score += 15;
    if (result.workExperiences.length >= 2) score += 10;
    if (result.workExperiences.some((e) => e.bullets && e.bullets.length > 0)) score += 5;
  }

  // Education (20 points)
  maxScore += 20;
  if (result.educations && result.educations.length > 0) {
    score += 15;
    if (result.educations.some((e) => e.institution !== 'University')) score += 5;
  }

  // Skills (10 points)
  maxScore += 10;
  if (result.skills && result.skills.length > 0) {
    score += 5;
    if (result.skills.length >= 5) score += 5;
  }

  return Math.round((score / maxScore) * 100) / 100;
}

// ============================================================================
// MAIN PARSING FUNCTIONS
// ============================================================================

export function parseResumeText(rawText: string): ParsedResume {
  console.log('[Parser] Starting, raw text length:', rawText.length);

  // Preprocess
  const text = preprocessText(rawText);
  console.log('[Parser] Preprocessed text length:', text.length);

  // Identify sections
  const sections = identifySections(text);

  // Initialize result
  const result: ParsedResume = {
    basics: {},
    workExperiences: [],
    educations: [],
    skills: [],
    links: [],
    certifications: [],
    confidence: 0,
    rawText: rawText,
  };

  // Extract contact info
  result.basics!.email = extractEmail(text);
  result.basics!.phone = extractPhone(text);
  result.links = extractLinks(text);
  result.basics!.location = extractLocation(text);

  // Extract name and headline
  const nameHeadline = extractNameAndHeadline(text);
  result.basics!.firstName = nameHeadline.firstName;
  result.basics!.lastName = nameHeadline.lastName;
  result.basics!.headline = nameHeadline.headline;

  // Extract summary
  result.basics!.summary = extractSummary(text, sections);

  // Extract skills
  result.skills = extractSkills(text, sections);

  // Extract experiences
  result.workExperiences = extractExperiences(text, sections);

  // Extract education
  result.educations = extractEducation(text, sections);

  // Extract certifications
  result.certifications = extractCertifications(text, sections);

  // Calculate confidence
  result.confidence = calculateConfidence(result);

  // Log final result
  console.log('[Parser] === FINAL RESULT ===');
  console.log('[Parser] Name:', result.basics?.firstName, result.basics?.lastName);
  console.log('[Parser] Headline:', result.basics?.headline?.substring(0, 50));
  console.log('[Parser] Email:', result.basics?.email);
  console.log('[Parser] Phone:', result.basics?.phone);
  console.log('[Parser] Location:', result.basics?.location);
  console.log('[Parser] Summary:', result.basics?.summary?.substring(0, 50));
  console.log('[Parser] Skills:', result.skills?.length);
  console.log('[Parser] Experiences:', result.workExperiences?.length);
  console.log('[Parser] Education:', result.educations?.length);
  console.log('[Parser] Certifications:', result.certifications?.length);
  console.log('[Parser] Links:', result.links?.length);
  console.log('[Parser] Confidence:', result.confidence);

  return result;
}

export async function parseResume(buffer: Buffer, mimeType: string): Promise<ParsedResume> {
  console.log('[parseResume] Called with mimeType:', mimeType);

  let text: string;

  if (mimeType === 'application/pdf') {
    text = await extractTextFromPDF(buffer);
  } else if (mimeType === 'text/plain') {
    text = buffer.toString('utf-8');
  } else {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  return parseResumeText(text);
}

// ============================================================================
// NORMALIZE FOR DATABASE
// ============================================================================

export interface NormalizedResumeData {
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
    description?: string;
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
    source: 'RESUME_IMPORT';
  }>;
  certifications?: Array<{
    name: string;
    issuer: string;
    date?: string;
    source: 'RESUME_IMPORT';
  }>;
  _meta: {
    source: string;
    confidence: number;
    rawText: string;
  };
}

export function normalizeResumeData(parsed: ParsedResume): NormalizedResumeData {
  const normalized: NormalizedResumeData = {
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
    _meta: {
      source: 'RESUME_IMPORT',
      confidence: parsed.confidence,
      rawText: parsed.rawText,
    },
  };

  console.log('[Normalize] Output:');
  console.log('  firstName:', normalized.firstName);
  console.log('  lastName:', normalized.lastName);
  console.log('  headline:', normalized.headline?.substring(0, 30));
  console.log('  skills:', normalized.skills?.length);
  console.log('  experiences:', normalized.workExperiences?.length);
  console.log('  education:', normalized.educations?.length);

  return normalized;
}
