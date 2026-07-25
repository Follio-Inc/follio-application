/**
 * Resume template system — presentation-only kits over shared profile content.
 * Switching templates never rewrites experience, education, skills, etc.
 */

import type { ResumeDesign, ResumeTemplateId } from '@/types';

export type { ResumeTemplateId };

export interface ResumeTemplateMeta {
  id: ResumeTemplateId;
  name: string;
  description: string;
  /** Visual cue for the picker (plain | accent) */
  tone: 'plain' | 'accent';
  /**
   * Whether this template’s default look includes a resume photo.
   * Restore Defaults / applying the template syncs `resumeShowPhoto` to this value.
   */
  defaultShowPhoto: boolean;
  /** Recommended design defaults applied when the user selects this template */
  designDefaults: Partial<ResumeDesign>;
}

/** Section types that render in the left column for sidebar layouts */
export const RESUME_SIDEBAR_SECTION_TYPES = [
  'SKILLS',
  'LANGUAGES',
  'INTERESTS',
  'CERTIFICATIONS',
] as const;

export type ResumeSidebarSectionType = (typeof RESUME_SIDEBAR_SECTION_TYPES)[number];

export function isResumeSidebarSectionType(type: string): type is ResumeSidebarSectionType {
  return (RESUME_SIDEBAR_SECTION_TYPES as readonly string[]).includes(type);
}

/**
 * Right-rail sections for the Atelier template.
 * Main column keeps profile/experience/projects; rail holds education + meta skills.
 */
export const RESUME_ATELIER_RAIL_SECTION_TYPES = [
  'EDUCATION',
  'SKILLS',
  'LANGUAGES',
  'AWARDS',
  'CERTIFICATIONS',
  'INTERESTS',
] as const;

export type ResumeAtelierRailSectionType = (typeof RESUME_ATELIER_RAIL_SECTION_TYPES)[number];

export function isResumeAtelierRailSectionType(type: string): type is ResumeAtelierRailSectionType {
  return (RESUME_ATELIER_RAIL_SECTION_TYPES as readonly string[]).includes(type);
}
