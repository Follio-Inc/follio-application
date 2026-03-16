/**
 * Extract projects from resume sections
 * Based on OpenResume's extract-project.ts
 */

import {
  DATE_FEATURE_SETS,
  getHasText,
  getTextWithHighestFeatureScore,
  isBold,
} from './feature-scoring-system';
import { getSectionLinesByKeywords } from './group-lines-into-sections';
import {
  divideSectionIntoSubsections,
  getBulletPointsFromLines,
  getDescriptionsLineIdx,
} from './helpers';
import type { FeatureSet, ResumeProject, ResumeSectionToLines } from './types';

// Keywords for projects section
const PROJECT_KEYWORDS = ['project', 'portfolio', 'work sample'];

/**
 * Extract projects from sections
 */
export function extractProject(sections: ResumeSectionToLines): {
  projects: ResumeProject[];
  projectsScores: unknown[];
} {
  const projects: ResumeProject[] = [];
  const projectsScores: unknown[] = [];

  // Get projects section lines
  const lines = getSectionLinesByKeywords(sections, PROJECT_KEYWORDS);

  if (lines.length === 0) {
    return { projects, projectsScores };
  }

  // Divide into subsections (one per project)
  const subsections = divideSectionIntoSubsections(lines);

  for (const subsectionLines of subsections) {
    const descriptionsLineIdx = getDescriptionsLineIdx(subsectionLines) ?? 1;

    // Get text items from the header portion
    const headerTextItems = subsectionLines.slice(0, descriptionsLineIdx).flat();

    // Extract date
    const [date, dateScores] = getTextWithHighestFeatureScore(headerTextItems, DATE_FEATURE_SETS);

    // Extract project name (usually bold, and not the date)
    const PROJECT_FEATURE_SETS: FeatureSet[] = [
      [isBold, 2],
      [getHasText(date), -4],
    ];
    const [project, projectScores] = getTextWithHighestFeatureScore(
      headerTextItems,
      PROJECT_FEATURE_SETS,
      false
    );

    // Get descriptions
    const descriptionsLines = subsectionLines.slice(descriptionsLineIdx);
    const descriptions = getBulletPointsFromLines(descriptionsLines);

    // Only add if we have meaningful data
    if (project || descriptions.length > 0) {
      projects.push({
        project: project.trim(),
        date: date.trim(),
        descriptions,
      });

      projectsScores.push({
        projectScores,
        dateScores,
      });
    }
  }

  return { projects, projectsScores };
}
