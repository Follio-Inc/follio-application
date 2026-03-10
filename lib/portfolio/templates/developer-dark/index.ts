/**
 * Developer Dark Template Kit
 *
 * A sleek, modern, dark-themed portfolio template inspired by the Developer X design.
 * Deep navy background, white text, accent dash headings, clean sans-serif typography.
 *
 * NOTE: This file imports the renderer (which imports CSS). For server-only code
 * that needs metadata without CSS/React, import from `./meta` instead.
 */

import type { TemplateKit } from '../types';

import { DEFAULT_SECTIONS, META } from './meta';
import { DeveloperDarkTemplate } from './renderer';

// ============================================================================
// KIT EXPORT
// ============================================================================

export const developerDarkKit: TemplateKit = {
  meta: META,
  Component: DeveloperDarkTemplate,
};

export { DEFAULT_SECTIONS, META };
