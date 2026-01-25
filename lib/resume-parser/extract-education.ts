/**
 * Extract education from resume sections
 * Based on OpenResume's extract-education.ts
 */

import {
  DATE_FEATURE_SETS,
  getTextWithHighestFeatureScore,
  hasComma,
  hasLetter,
  hasNumber,
} from './feature-scoring-system';
import { getSectionLinesByKeywords } from './group-lines-into-sections';
import {
  divideSectionIntoSubsections,
  getBulletPointsFromLines,
  getDescriptionsLineIdx,
} from './helpers';
import type { FeatureSet, ResumeEducation, ResumeSectionToLines, TextItem } from './types';

// Keywords for education section
const EDUCATION_KEYWORDS = ['education', 'academic', 'degree', 'university', 'college'];

// School keywords
const SCHOOLS = [
  'university',
  'college',
  'institute',
  'school',
  'academy',
  'polytechnic',
  'community college',
  'tech',
  'conservatory',
];

// Degree keywords
const DEGREES = [
  'bachelor',
  'master',
  'doctor',
  'phd',
  'ph.d',
  'associate',
  'diploma',
  'bs',
  'ba',
  'ms',
  'ma',
  'mba',
  'md',
  'jd',
  'llb',
  'llm',
  'bsc',
  'msc',
  'beng',
  'meng',
  'btech',
  'mtech',
  'b.s.',
  'b.a.',
  'm.s.',
  'm.a.',
  'm.b.a.',
  'degree',
  'certificate',
  'certification',
  'graduate',
  'undergraduate',
];

/**
 * Check if text contains a school keyword
 */
const hasSchool = (item: TextItem) =>
  SCHOOLS.some((school) => item.text.toLowerCase().includes(school));

/**
 * Check if text contains a degree keyword
 */
const hasDegree = (item: TextItem) =>
  DEGREES.some((degree) => item.text.toLowerCase().includes(degree));

/**
 * Match GPA format (x.xx or x.x)
 */
const matchGPA = (item: TextItem) => item.text.match(/[0-4]\.\d{1,2}/);

/**
 * Match grade format (percentage or letter grade)
 */
const matchGrade = (item: TextItem) => {
  // Match percentage like "85%" or "85"
  const percentMatch = item.text.match(/(\d{1,3})%?/);
  if (percentMatch) {
    const grade = parseInt(percentMatch[1]);
    if (grade >= 0 && grade <= 100) {
      return percentMatch;
    }
  }
  return null;
};

const SCHOOL_FEATURE_SETS: FeatureSet[] = [
  [hasSchool, 4],
  [hasDegree, -4],
  [hasNumber, -4],
];

const DEGREE_FEATURE_SETS: FeatureSet[] = [
  [hasDegree, 4],
  [hasSchool, -4],
  [hasNumber, -3],
];

const GPA_FEATURE_SETS: FeatureSet[] = [
  [matchGPA, 4, true],
  [matchGrade, 3, true],
  [hasComma, -3],
  [hasLetter, -4],
];

/**
 * Extract education from sections
 */
export function extractEducation(sections: ResumeSectionToLines): {
  educations: ResumeEducation[];
  educationsScores: unknown[];
} {
  const educations: ResumeEducation[] = [];
  const educationsScores: unknown[] = [];

  // Get education section lines
  const lines = getSectionLinesByKeywords(sections, EDUCATION_KEYWORDS);

  if (lines.length === 0) {
    return { educations, educationsScores };
  }

  // Divide into subsections (one per school)
  const subsections = divideSectionIntoSubsections(lines);

  for (const subsectionLines of subsections) {
    const descriptionsLineIdx = getDescriptionsLineIdx(subsectionLines) ?? 2;

    // Get text items from the header portion
    const headerTextItems = subsectionLines.slice(0, descriptionsLineIdx).flat();

    // Extract school
    const [school, schoolScores] = getTextWithHighestFeatureScore(
      headerTextItems,
      SCHOOL_FEATURE_SETS
    );

    // Extract degree
    const [degree, degreeScores] = getTextWithHighestFeatureScore(
      headerTextItems,
      DEGREE_FEATURE_SETS
    );

    // Extract GPA
    const [gpa, gpaScores] = getTextWithHighestFeatureScore(headerTextItems, GPA_FEATURE_SETS);

    // Extract date
    const [date, dateScores] = getTextWithHighestFeatureScore(headerTextItems, DATE_FEATURE_SETS);

    // Get descriptions
    const descriptionsLines = subsectionLines.slice(descriptionsLineIdx);
    const descriptions = getBulletPointsFromLines(descriptionsLines);

    // Only add if we have meaningful data
    if (school || degree || gpa) {
      educations.push({
        school: school.trim(),
        degree: degree.trim(),
        gpa: gpa.trim(),
        date: date.trim(),
        descriptions,
      });

      educationsScores.push({
        schoolScores,
        degreeScores,
        gpaScores,
        dateScores,
      });
    }
  }

  // Also check for courses section and add to first education
  if (educations.length > 0) {
    const coursesLines = getSectionLinesByKeywords(sections, ['course']);
    if (coursesLines.length > 0) {
      const coursesText =
        'Courses: ' +
        coursesLines
          .flat()
          .map((item) => item.text)
          .join(' ');
      educations[0].descriptions.push(coursesText);
    }
  }

  return { educations, educationsScores };
}
