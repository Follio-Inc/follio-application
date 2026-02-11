/**
 * OpenResume-style Resume Parser
 *
 * A robust, feature-scoring based resume parser ported from OpenResume
 * https://github.com/xitanggg/open-resume
 *
 * This parser:
 * 1. Uses pdf.js to extract text with position metadata (x, y, bold, etc.)
 * 2. Groups text items into lines based on y-position
 * 3. Groups lines into sections based on section title detection
 * 4. Uses feature scoring to extract attributes from each section
 */

import { extractEducation } from './extract-education';
import { extractProfile } from './extract-profile';
import { extractProject } from './extract-project';
import { extractIndividualSkills, extractSkills } from './extract-skills';
import { extractWorkExperience } from './extract-work-experience';
import { groupLinesIntoSections, PROFILE_SECTION } from './group-lines-into-sections';
import { groupTextItemsIntoLines } from './group-text-items-into-lines';
import { readPdfFromBuffer } from './read-pdf';
import type { Lines, ParsedResume, Resume, ResumeSectionToLines, TextItems } from './types';

export * from './types';

/**
 * Parse a resume PDF from a buffer
 * This is the main entry point for server-side parsing
 */
export async function parseResumeFromPdfBuffer(buffer: Buffer): Promise<ParsedResume> {
  console.log('[OpenResume Parser] Starting PDF parsing...');

  // Step 1: Extract text items with position metadata
  const textItems = await readPdfFromBuffer(buffer);
  console.log(`[OpenResume Parser] Extracted ${textItems.length} text items`);

  // Step 2: Group text items into lines
  const lines = groupTextItemsIntoLines(textItems);
  console.log(`[OpenResume Parser] Grouped into ${lines.length} lines`);

  // Step 3: Group lines into sections
  const sections = groupLinesIntoSections(lines);
  const sectionNames = Object.keys(sections);
  console.log(`[OpenResume Parser] Identified sections: ${sectionNames.join(', ')}`);

  // Step 4: Extract resume from sections
  const resume = extractResumeFromSections(sections);

  // Convert to our ParsedResume format
  return convertToAppFormat(resume, textItems, lines, sections);
}

/**
 * Extract all resume data from sections
 */
function extractResumeFromSections(sections: ResumeSectionToLines): Resume {
  const { profile } = extractProfile(sections);
  const { educations } = extractEducation(sections);
  const { workExperiences } = extractWorkExperience(sections);
  const { projects } = extractProject(sections);
  const { skills } = extractSkills(sections);

  return {
    profile,
    educations,
    workExperiences,
    projects,
    skills,
    custom: { descriptions: [] },
  };
}

/**
 * Convert OpenResume format to our app's ParsedResume format
 */
function convertToAppFormat(
  resume: Resume,
  textItems: TextItems,
  lines: Lines,
  sections: ResumeSectionToLines
): ParsedResume {
  // Split name into first and last
  const nameParts = resume.profile.name.split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  // Extract URLs from profile section
  const links: string[] = [];
  const profileLines = sections[PROFILE_SECTION] || [];
  const profileText = profileLines
    .flat()
    .map((item) => item.text)
    .join(' ');

  // Find URLs in profile
  const urlPatterns = [
    /linkedin\.com\/in\/[\w-]+/gi,
    /github\.com\/[\w-]+/gi,
    /https?:\/\/\S+/gi,
    /www\.\S+/gi,
  ];

  for (const pattern of urlPatterns) {
    const matches = profileText.match(pattern);
    if (matches) {
      for (const match of matches) {
        const url = match.startsWith('http') ? match : `https://${match}`;
        if (!links.includes(url)) {
          links.push(url);
        }
      }
    }
  }

  // Extract individual skills from skill descriptions
  const skillDescriptions = resume.skills.descriptions;
  const individualSkills = extractIndividualSkills(skillDescriptions);

  // Convert work experiences
  const workExperiences = resume.workExperiences.map((exp) => {
    const { startDate, endDate, isCurrent } = parseDateRange(exp.date);
    return {
      company: exp.company,
      title: exp.jobTitle,
      location: undefined,
      startDate,
      endDate,
      bullets: exp.descriptions.map((d: string) => d.trim()).filter((d: string) => d.length > 0),
      isCurrent,
    };
  });

  // Convert educations
  const educations = resume.educations.map((edu) => {
    const { startDate, endDate } = parseDateRange(edu.date);
    return {
      institution: edu.school,
      degree: edu.degree,
      field: undefined,
      startDate,
      endDate,
      gpa: edu.gpa || undefined,
    };
  });

  // Convert projects
  const projects = resume.projects.map((proj) => {
    const { startDate, endDate } = parseDateRange(proj.date);
    return {
      name: proj.project,
      description: proj.descriptions.join('\n'),
      url: undefined,
      startDate,
      endDate,
    };
  });

  // Calculate confidence based on how much data we extracted
  const confidence = calculateConfidence(resume, textItems.length);

  // Try to extract headline from profile section
  let headline = '';
  if (profileLines.length > 1) {
    // Headline is usually on the second line after name
    const potentialHeadline = profileLines
      .slice(1, 3)
      .flat()
      .map((item) => item.text)
      .join(' ')
      .trim();

    // Check if it looks like a headline (not an email, phone, or URL)
    if (
      potentialHeadline &&
      !potentialHeadline.includes('@') &&
      !/\d{3}.*\d{4}/.test(potentialHeadline) &&
      !potentialHeadline.includes('http') &&
      !potentialHeadline.includes('www.') &&
      potentialHeadline.length < 200
    ) {
      headline = potentialHeadline;
    }
  }

  console.log('[OpenResume Parser] Conversion complete');
  console.log(`  - Name: ${firstName} ${lastName}`);
  console.log(`  - Email: ${resume.profile.email}`);
  console.log(`  - Skills: ${individualSkills.length}`);
  console.log(`  - Work Experiences: ${workExperiences.length}`);
  console.log(`  - Educations: ${educations.length}`);
  console.log(`  - Projects: ${projects.length}`);
  console.log(`  - Links: ${links.length}`);
  console.log(`  - Confidence: ${confidence}`);

  return {
    firstName,
    lastName,
    headline,
    email: resume.profile.email,
    phone: resume.profile.phone,
    location: resume.profile.location,
    summary: resume.profile.summary,
    links,
    skills: individualSkills,
    workExperiences,
    educations,
    projects,
    certifications: [],
    confidence,
    parseMethod: 'open-resume',
  };
}

/**
 * Parse a date range string into start and end dates
 */
function parseDateRange(dateStr: string): {
  startDate?: string;
  endDate?: string;
  isCurrent: boolean;
} {
  if (!dateStr) {
    return { startDate: undefined, endDate: undefined, isCurrent: false };
  }

  const isCurrent = /present|current|now/i.test(dateStr);

  // Match patterns like "Jan 2020 - Present", "2020-2023", "Jan 2020 – Dec 2023"
  const parts = dateStr.split(/\s*[-–—]\s*/);

  const startDate = parts[0]?.trim() || undefined;
  const endDate = isCurrent ? undefined : parts[1]?.trim() || undefined;

  return { startDate, endDate, isCurrent };
}

/**
 * Calculate confidence score based on extraction completeness
 */
function calculateConfidence(resume: Resume, textItemCount: number): number {
  let score = 0;
  let maxScore = 0;

  // Profile fields (weight: 2 each)
  const profileFields = ['name', 'email', 'phone', 'location'] as const;
  for (const field of profileFields) {
    maxScore += 2;
    if (resume.profile[field]) score += 2;
  }

  // Summary (weight: 1)
  maxScore += 1;
  if (resume.profile.summary) score += 1;

  // Work experience (weight: 3)
  maxScore += 3;
  if (resume.workExperiences.length > 0) score += 3;

  // Education (weight: 2)
  maxScore += 2;
  if (resume.educations.length > 0) score += 2;

  // Skills (weight: 2)
  maxScore += 2;
  if (resume.skills.descriptions.length > 0) score += 2;

  // Bonus for having multiple items
  if (resume.workExperiences.length > 2) score += 0.5;
  if (resume.educations.length > 1) score += 0.5;
  maxScore += 1;

  // Penalty if we extracted very little relative to text items
  if (textItemCount > 50 && score < maxScore * 0.3) {
    score *= 0.8;
  }

  return Math.min(1, Math.round((score / maxScore) * 100) / 100);
}

/**
 * For debugging: get raw extraction results
 */
export async function parseResumeWithDebug(buffer: Buffer): Promise<{
  parsed: ParsedResume;
  debug: {
    textItems: TextItems;
    lines: Lines;
    sections: ResumeSectionToLines;
    rawResume: Resume;
  };
}> {
  const textItems = await readPdfFromBuffer(buffer);
  const lines = groupTextItemsIntoLines(textItems);
  const sections = groupLinesIntoSections(lines);
  const rawResume = extractResumeFromSections(sections);
  const parsed = convertToAppFormat(rawResume, textItems, lines, sections);

  return {
    parsed,
    debug: {
      textItems,
      lines,
      sections,
      rawResume,
    },
  };
}
