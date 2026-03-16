/**
 * Developer Dark Template — Metadata & Configuration
 *
 * This file is deliberately separated from the renderer/CSS so that
 * server-side code (generation service, scripts) can import template
 * metadata without pulling in React components or CSS files.
 */

import type { TemplateKitMeta, TemplateNavbarTheme, TemplateSectionConfig } from '../types';

// ============================================================================
// DEFAULT SECTIONS
// ============================================================================

export const DEFAULT_SECTIONS: TemplateSectionConfig[] = [
  { id: 'nav', type: 'navigation', enabled: true, order: 0 },
  { id: 'hero', type: 'hero', enabled: true, order: 1 },
  { id: 'about', type: 'about', enabled: true, order: 2 },
  { id: 'exp', type: 'experience', enabled: true, order: 3 },
  { id: 'proj', type: 'projects', enabled: true, order: 4 },
  { id: 'skill', type: 'skills', enabled: true, order: 5 },
  { id: 'edu', type: 'education', enabled: true, order: 6 },
  { id: 'cert', type: 'certifications', enabled: false, order: 7 },
  { id: 'gh', type: 'github', enabled: false, order: 8 },
  { id: 'blog', type: 'blog', enabled: false, order: 9 },
  { id: 'cta', type: 'contact', enabled: true, order: 10 },
  { id: 'foot', type: 'footer', enabled: true, order: 11 },
];

// ============================================================================
// METADATA
// ============================================================================

export const META: TemplateKitMeta = {
  id: 'developer-dark',
  name: 'Developer Dark',
  description:
    'A sleek, modern dark-themed portfolio. Deep navy background, clean typography, accent dash headings. Perfect for developers and engineers.',
  previewUrl: null,
  tags: ['dark', 'developer', 'modern', 'professional', 'tech'],

  defaultSections: DEFAULT_SECTIONS,

  supportedSections: [
    'navigation',
    'hero',
    'about',
    'experience',
    'projects',
    'skills',
    'education',
    'certifications',
    'github',
    'contact',
    'footer',
  ],

  compatibleAccentColors: [
    { name: 'Blue', value: '#3b82f6' },
    { name: 'Emerald', value: '#10b981' },
    { name: 'Violet', value: '#8b5cf6' },
    { name: 'Rose', value: '#f43f5e' },
    { name: 'Amber', value: '#f59e0b' },
    { name: 'Cyan', value: '#06b6d4' },
    { name: 'White', value: '#ffffff' },
  ],

  compatibleFonts: [
    {
      id: 'inter',
      name: 'Inter',
      css: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    },
    {
      id: 'dm-sans',
      name: 'DM Sans',
      css: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    },
    {
      id: 'space-grotesk',
      name: 'Space Grotesk',
      css: "'Space Grotesk', -apple-system, sans-serif",
    },
    {
      id: 'jetbrains-mono',
      name: 'JetBrains Mono',
      css: "'JetBrains Mono', 'Fira Code', monospace",
    },
  ],

  navbarTheme: {
    mode: 'dark',
    overrides: {
      // Match the template's deep navy background (#0b0f19) instead of the default dark palette
      background: '223 39% 7%',
    },
  } satisfies TemplateNavbarTheme,
};
