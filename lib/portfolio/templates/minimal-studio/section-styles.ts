/**
 * Minimal Studio — section layout presets.
 *
 * Like the hero portrait presets, each content section offers a small set of
 * complete layout compositions. Every preset shares the template's editorial
 * voice (serif display type, hairline rules, warm paper) so they stay coherent
 * with one another and with the portrait styles. The first option in each list
 * is the default — chosen so a freshly generated portfolio already looks good.
 */

interface StylePreset<Id extends string> {
  id: Id;
  label: string;
  description: string;
}

// ============================================================================
// WORK / PROJECTS
// ============================================================================

export const WORK_STYLES = [
  {
    id: 'editorial',
    label: 'Editorial',
    description: 'A large featured project leads a two-column grid.',
  },
  {
    id: 'grid',
    label: 'Grid',
    description: 'An even two-column grid — every project equal weight.',
  },
  {
    id: 'gallery',
    label: 'Gallery',
    description: 'A dense three-column gallery, image-forward.',
  },
] as const satisfies ReadonlyArray<StylePreset<string>>;

export type WorkStyleId = (typeof WORK_STYLES)[number]['id'];

const WORK_STYLE_IDS = new Set<string>(WORK_STYLES.map((s) => s.id));

export function isWorkStyleId(value: unknown): value is WorkStyleId {
  return typeof value === 'string' && WORK_STYLE_IDS.has(value);
}

export const DEFAULT_WORK_STYLE: WorkStyleId = 'editorial';

// ============================================================================
// ABOUT
// ============================================================================

export const ABOUT_STYLES = [
  {
    id: 'sidebar',
    label: 'Sidebar',
    description: 'Highlights sit in a side column beside your story.',
  },
  {
    id: 'centered',
    label: 'Centered',
    description: 'A single centered column — calm and focused.',
  },
  {
    id: 'statement',
    label: 'Statement',
    description: 'An oversized opening with highlights in a row below.',
  },
] as const satisfies ReadonlyArray<StylePreset<string>>;

export type AboutStyleId = (typeof ABOUT_STYLES)[number]['id'];

const ABOUT_STYLE_IDS = new Set<string>(ABOUT_STYLES.map((s) => s.id));

export function isAboutStyleId(value: unknown): value is AboutStyleId {
  return typeof value === 'string' && ABOUT_STYLE_IDS.has(value);
}

export const DEFAULT_ABOUT_STYLE: AboutStyleId = 'sidebar';

// ============================================================================
// SKILLS
// ============================================================================

export const SKILLS_STYLES = [
  {
    id: 'rows',
    label: 'Rows',
    description: 'Grouped rows — each category beside its skills.',
  },
  {
    id: 'inline',
    label: 'Inline',
    description: 'Each category sits above a flowing row of tags.',
  },
  {
    id: 'columns',
    label: 'Columns',
    description: 'A compact multi-column grid of groups.',
  },
] as const satisfies ReadonlyArray<StylePreset<string>>;

export type SkillsStyleId = (typeof SKILLS_STYLES)[number]['id'];

const SKILLS_STYLE_IDS = new Set<string>(SKILLS_STYLES.map((s) => s.id));

export function isSkillsStyleId(value: unknown): value is SkillsStyleId {
  return typeof value === 'string' && SKILLS_STYLE_IDS.has(value);
}

export const DEFAULT_SKILLS_STYLE: SkillsStyleId = 'rows';
