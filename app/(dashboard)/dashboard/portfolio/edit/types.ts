import type { TemplateSectionType } from '@/lib/portfolio/templates/types';

/** Template capabilities the editor needs (bounded style + section options). */
export interface EditorTemplateInfo {
  id: string;
  name: string;
  accentColors: Array<{ name: string; value: string }>;
  fonts: Array<{ id: string; name: string; css: string }>;
  supportedSections: TemplateSectionType[];
  /**
   * Default eyebrow + title per section. Drives which sections expose editable
   * headings and the placeholder text shown when a field is left blank.
   */
  defaultHeadings: Partial<Record<TemplateSectionType, { eyebrow: string; title: string }>>;
}

/** Human-readable labels for each section type shown in the layout list. */
export const SECTION_LABELS: Record<TemplateSectionType, string> = {
  navigation: 'Navigation',
  hero: 'Intro',
  about: 'About',
  experience: 'Experience',
  projects: 'Projects',
  skills: 'Skills',
  education: 'Education',
  certifications: 'Certifications',
  awards: 'Awards',
  github: 'Open Source',
  blog: 'Writing',
  contact: 'Contact',
  footer: 'Footer',
};

/** Structural sections users can't reorder or hide. */
export const STRUCTURAL_SECTION_TYPES: TemplateSectionType[] = ['navigation', 'footer'];
