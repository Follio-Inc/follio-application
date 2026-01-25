/**
 * Extract work experience from resume sections
 * Based on OpenResume's extract-work-experience.ts
 */

import {
  DATE_FEATURE_SETS,
  getHasText,
  getTextWithHighestFeatureScore,
  hasNumber,
  isBold,
} from './feature-scoring-system';
import { getSectionLinesByKeywords } from './group-lines-into-sections';
import {
  divideSectionIntoSubsections,
  getBulletPointsFromLines,
  getDescriptionsLineIdx,
} from './helpers';
import type { FeatureSet, ResumeSectionToLines, ResumeWorkExperience, TextItem } from './types';

// Keywords for work experience section
const WORK_EXPERIENCE_KEYWORDS = [
  'work',
  'experience',
  'employment',
  'history',
  'job',
  'career',
  'professional',
];

// Common job titles to help identify job title vs company
// prettier-ignore
const JOB_TITLES = [
  'engineer', 'developer', 'designer', 'manager', 'director', 'lead', 'head',
  'analyst', 'consultant', 'specialist', 'coordinator', 'administrator',
  'architect', 'scientist', 'researcher', 'associate', 'assistant', 'intern',
  'executive', 'officer', 'president', 'founder', 'partner', 'principal',
  'supervisor', 'technician', 'representative', 'agent', 'advisor', 'strategist',
  'planner', 'editor', 'writer', 'producer', 'accountant', 'auditor',
  'attorney', 'lawyer', 'paralegal', 'nurse', 'doctor', 'therapist',
  'teacher', 'professor', 'instructor', 'trainer', 'coach',
  'sales', 'marketing', 'product', 'project', 'program', 'software', 'data',
  'senior', 'junior', 'staff', 'chief', 'vice', 'ceo', 'cto', 'cfo', 'coo',
  'vp', 'svp', 'evp', 'gm', 'pm', 'tpm', 'sde', 'swe', 'ui', 'ux', 'qa', 'devops'
];

/**
 * Check if text contains a job title keyword
 */
const hasJobTitle = (item: TextItem) =>
  JOB_TITLES.some((title) =>
    item.text
      .toLowerCase()
      .split(/\s+/)
      .some((word) => word.includes(title))
  );

const hasMoreThan5Words = (item: TextItem) => item.text.split(/\s+/).length > 5;

const JOB_TITLE_FEATURE_SETS: FeatureSet[] = [
  [hasJobTitle, 4],
  [hasNumber, -4],
  [hasMoreThan5Words, -2],
];

/**
 * Extract work experiences from sections
 */
export function extractWorkExperience(sections: ResumeSectionToLines): {
  workExperiences: ResumeWorkExperience[];
  workExperiencesScores: unknown[];
} {
  const workExperiences: ResumeWorkExperience[] = [];
  const workExperiencesScores: unknown[] = [];

  // Get work experience section lines
  const lines = getSectionLinesByKeywords(sections, WORK_EXPERIENCE_KEYWORDS);

  if (lines.length === 0) {
    return { workExperiences, workExperiencesScores };
  }

  // Divide into subsections (one per job)
  const subsections = divideSectionIntoSubsections(lines);

  for (const subsectionLines of subsections) {
    // Find where descriptions start (usually after company/title/date info)
    const descriptionsLineIdx = getDescriptionsLineIdx(subsectionLines) ?? 2;

    // Get text items from the header portion (company, title, date)
    const headerTextItems = subsectionLines.slice(0, descriptionsLineIdx).flat();

    // Extract date
    const [date, dateScores] = getTextWithHighestFeatureScore(headerTextItems, DATE_FEATURE_SETS);

    // Extract job title (using job title keywords and excluding date)
    const JOB_TITLE_FEATURE_SETS_WITH_DATE: FeatureSet[] = [
      ...JOB_TITLE_FEATURE_SETS,
      [getHasText(date), -4],
    ];
    const [jobTitle, jobTitleScores] = getTextWithHighestFeatureScore(
      headerTextItems,
      JOB_TITLE_FEATURE_SETS_WITH_DATE
    );

    // Extract company (usually bold, and not the job title or date)
    const COMPANY_FEATURE_SETS: FeatureSet[] = [
      [isBold, 2],
      [getHasText(date), -4],
      [getHasText(jobTitle), -4],
      [hasMoreThan5Words, -2],
    ];
    const [company, companyScores] = getTextWithHighestFeatureScore(
      headerTextItems,
      COMPANY_FEATURE_SETS,
      false
    );

    // Get descriptions from bullet points
    const descriptionsLines = subsectionLines.slice(descriptionsLineIdx);
    const descriptions = getBulletPointsFromLines(descriptionsLines);

    // Only add if we have meaningful data
    if (company || jobTitle || descriptions.length > 0) {
      workExperiences.push({
        company: company.trim(),
        jobTitle: jobTitle.trim(),
        date: date.trim(),
        descriptions,
      });

      workExperiencesScores.push({
        companyScores,
        jobTitleScores,
        dateScores,
      });
    }
  }

  return { workExperiences, workExperiencesScores };
}
