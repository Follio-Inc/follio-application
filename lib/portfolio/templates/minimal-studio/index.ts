/**
 * Minimal Studio Template Kit
 *
 * A light, editorial, image-forward portfolio centred on a large work
 * showcase. Fraunces display serif + a clean grotesque, warm paper canvas,
 * hairline rules, and quiet scroll-in motion.
 *
 * NOTE: This file imports the renderer (which imports CSS). For server-only
 * code that needs metadata without CSS/React, import from `./meta` instead.
 */

import type { TemplateKit } from '../types';

import { DEFAULT_SECTIONS, META } from './meta';
import { MinimalStudioTemplate } from './renderer';

export const minimalStudioKit: TemplateKit = {
  meta: META,
  Component: MinimalStudioTemplate,
};

export { DEFAULT_SECTIONS, META };
