/**
 * Shared helpers for resolving editable portfolio copy at render time.
 * Prefer owned/editor content over AI leftovers and never invent ghost text.
 */

import type { TemplateCopy, TemplateSectionType } from './types';

/**
 * Resolve eyebrow + title for a section from user edits, then template defaults.
 * Blank overrides fall back to defaults so a cleared field never renders empty
 * when a default exists.
 */
export function resolveSectionHeading(
  copy: TemplateCopy,
  type: TemplateSectionType,
  defaults: Partial<Record<TemplateSectionType, { eyebrow: string; title: string }>>
): { eyebrow: string; title: string } {
  const fallback = defaults[type] ?? { eyebrow: '', title: '' };
  const override = copy.sectionHeadings?.[type];
  return {
    eyebrow: override?.eyebrow?.trim() || fallback.eyebrow,
    title: override?.title?.trim() || fallback.title,
  };
}

/**
 * Project body text: prefer portfolio-owned description (editable in the editor).
 * Fall back to generation-time narratives only when description is empty (legacy).
 */
export function resolveProjectDescription(
  project: { title: string; description?: string | null },
  copy: TemplateCopy
): string | null {
  const owned = project.description?.trim();
  if (owned) return owned;
  const narrative = copy.projectNarratives?.[project.title]?.trim();
  return narrative || null;
}
