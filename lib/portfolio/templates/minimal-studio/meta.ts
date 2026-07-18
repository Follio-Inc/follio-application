/**
 * Minimal Studio Template — Metadata & Configuration
 *
 * Separated from the renderer/CSS so server-side code (generation service,
 * scripts) can read template metadata without pulling in React or CSS.
 *
 * Design intent: a light, editorial, image-forward portfolio built around a
 * large "selected work" showcase. Premium serif display type (Fraunces) paired
 * with a clean grotesque, generous whitespace, hairline rules, and restrained
 * motion. Aimed at designers, photographers, architects, and visual creatives.
 */

import type {
  TemplateKitMeta,
  TemplateNavbarTheme,
  TemplateSectionConfig,
  TemplateSectionType,
} from '../types';

// ============================================================================
// DEFAULT SECTION HEADINGS
// ============================================================================

/**
 * The editorial voice of Minimal Studio. These are the eyebrow labels and serif
 * titles each section shows by default. Users can override any of them in the
 * editor; blank overrides fall back to these.
 *
 * `about` and `contact` keep their dedicated title/subtext copy fields, so only
 * their eyebrow is defined here.
 */
export const SECTION_DEFAULT_HEADINGS: Partial<
  Record<TemplateSectionType, { eyebrow: string; title: string }>
> = {
  projects: { eyebrow: 'Selected Work', title: "Things I've made" },
  about: { eyebrow: 'About', title: '' },
  experience: { eyebrow: 'Experience', title: "Where I've worked" },
  skills: { eyebrow: 'Capabilities', title: 'What I work with' },
  education: { eyebrow: 'Education', title: 'Where I studied' },
  awards: { eyebrow: 'Recognition', title: 'Awards & honors' },
  certifications: { eyebrow: 'Credentials', title: 'Certifications' },
  github: { eyebrow: 'Open Source', title: 'Building in public' },
};

// ============================================================================
// DEFAULT SECTIONS
// ============================================================================

/**
 * Work (projects) is intentionally ordered right after the hero — this is an
 * image-forward template where the project showcase is the centrepiece.
 */
export const DEFAULT_SECTIONS: TemplateSectionConfig[] = [
  { id: 'nav', type: 'navigation', enabled: true, order: 0 },
  { id: 'hero', type: 'hero', enabled: true, order: 1 },
  { id: 'work', type: 'projects', enabled: true, order: 2 },
  { id: 'about', type: 'about', enabled: true, order: 3 },
  { id: 'exp', type: 'experience', enabled: true, order: 4 },
  { id: 'skill', type: 'skills', enabled: true, order: 5 },
  { id: 'edu', type: 'education', enabled: true, order: 6 },
  { id: 'awards', type: 'awards', enabled: false, order: 7 },
  { id: 'cert', type: 'certifications', enabled: false, order: 8 },
  { id: 'gh', type: 'github', enabled: false, order: 9 },
  { id: 'cta', type: 'contact', enabled: true, order: 10 },
  { id: 'foot', type: 'footer', enabled: true, order: 11 },
];

// ============================================================================
// METADATA
// ============================================================================

export const META: TemplateKitMeta = {
  id: 'minimal-studio',
  name: 'Minimal Studio',
  description:
    'A light, editorial portfolio built around a large image-forward work showcase. Elegant serif display type, generous whitespace, and quiet motion. Made for designers, photographers, architects, and visual creatives.',
  previewUrl: null,
  tags: ['light', 'minimal', 'editorial', 'creative', 'designer', 'photography', 'studio'],

  defaultAppearance: 'light',

  defaultSections: DEFAULT_SECTIONS,

  supportedSections: [
    'navigation',
    'hero',
    'projects',
    'about',
    'experience',
    'skills',
    'education',
    'awards',
    'certifications',
    'github',
    'contact',
    'footer',
  ],

  defaultSectionHeadings: SECTION_DEFAULT_HEADINGS,

  // A restrained, sophisticated palette. Index 0 is the default accent.
  // The accent is used sparingly — links, hover states, index numerals,
  // and small marks — so it reads as a signature rather than a fill.
  compatibleAccentColors: [
    { name: 'Clay', value: '#B85C38' },
    { name: 'Ink', value: '#1A1A1A' },
    { name: 'Forest', value: '#3F5B47' },
    { name: 'Cobalt', value: '#2F4DA0' },
    { name: 'Plum', value: '#6B3F69' },
    { name: 'Gold', value: '#A9824A' },
  ],

  // The display serif (Fraunces) is fixed in the template's CSS for headings.
  // This option controls the body / UI grotesque only.
  compatibleFonts: [
    {
      id: 'inter',
      name: 'Inter',
      css: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    },
    {
      id: 'archivo',
      name: 'Archivo',
      css: "'Archivo', -apple-system, BlinkMacSystemFont, sans-serif",
    },
    {
      id: 'space-grotesk',
      name: 'Space Grotesk',
      css: "'Space Grotesk', -apple-system, sans-serif",
    },
  ],

  navbarTheme: {
    mode: 'light',
    overrides: {
      // Match the template's warm paper background so the Follio top bar blends in.
      background: '40 30% 96%',
      foreground: '30 12% 8%',
    },
  } satisfies TemplateNavbarTheme,

  /**
   * The hero carries the primary identity statement and is the most
   * visually prominent area for thumbnail / link-preview rendering.
   */
  thumbnailFocusSection: 'hero',
};
