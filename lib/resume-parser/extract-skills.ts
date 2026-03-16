/**
 * Extract skills from resume sections
 * Based on OpenResume's extract-skills.ts
 */

import { getSectionLinesByKeywords } from './group-lines-into-sections';
import { getBulletPointsFromLines, getDescriptionsLineIdx } from './helpers';
import type { ResumeSectionToLines, ResumeSkills } from './types';

// Keywords for skills section
const SKILLS_KEYWORDS = [
  'skill',
  'technical',
  'competenc',
  'proficienc',
  'expertise',
  'technology',
  'tool',
];

// Default featured skills structure
const initialFeaturedSkills = [
  { skill: '', rating: 4 },
  { skill: '', rating: 4 },
  { skill: '', rating: 4 },
  { skill: '', rating: 4 },
  { skill: '', rating: 4 },
  { skill: '', rating: 4 },
];

/**
 * Extract skills from sections
 */
export function extractSkills(sections: ResumeSectionToLines): {
  skills: ResumeSkills;
} {
  // Get skills section lines
  const lines = getSectionLinesByKeywords(sections, SKILLS_KEYWORDS);

  if (lines.length === 0) {
    return {
      skills: {
        featuredSkills: [...initialFeaturedSkills],
        descriptions: [],
      },
    };
  }

  const descriptionsLineIdx = getDescriptionsLineIdx(lines) ?? 0;
  const descriptionsLines = lines.slice(descriptionsLineIdx);

  // Get all skill descriptions
  let descriptions = getBulletPointsFromLines(descriptionsLines);

  // If no bullet points found, just join all text
  if (descriptions.length === 0) {
    descriptions = lines
      .map((line) => line.map((item) => item.text).join(' '))
      .filter((text) => text.trim().length > 0);
  }

  // Try to extract featured skills from the first line if it contains categories
  const featuredSkills = [...initialFeaturedSkills];
  if (descriptionsLineIdx !== 0) {
    const featuredSkillsLine = lines.slice(0, descriptionsLineIdx).flat();
    const featuredTexts = featuredSkillsLine.map((item) => item.text.trim()).filter(Boolean);

    for (let i = 0; i < Math.min(featuredTexts.length, featuredSkills.length); i++) {
      featuredSkills[i] = { skill: featuredTexts[i], rating: 4 };
    }
  }

  return {
    skills: {
      featuredSkills,
      descriptions,
    },
  };
}

/**
 * Parse skills from a comma/semicolon separated string
 */
export function parseSkillsFromText(text: string): string[] {
  // Split by common delimiters
  const skills = text
    .split(/[,;|•·]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length < 50); // Filter out empty and overly long items

  return skills;
}

/**
 * Extract individual skills from skill descriptions
 */
export function extractIndividualSkills(descriptions: string[]): string[] {
  const allSkills: string[] = [];

  for (const desc of descriptions) {
    // Check if it looks like a category (e.g., "Languages: Python, Java")
    if (desc.includes(':')) {
      const [, skills] = desc.split(':');
      if (skills) {
        allSkills.push(...parseSkillsFromText(skills));
      }
    } else {
      // Just parse the whole line as skills
      allSkills.push(...parseSkillsFromText(desc));
    }
  }

  return [...new Set(allSkills)]; // Deduplicate
}
