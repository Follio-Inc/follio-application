/**
 * Capsule tags shown beside resume entry headings (role, degree, project title).
 *
 * Stored as JSON on experience / education / project rows, and as JSON inside
 * custom-section items. Older custom-section data may still be a string[].
 */

export const HEADING_TAG_COLOR_IDS = [
  'slate',
  'stone',
  'zinc',
  'blue',
  'teal',
  'olive',
  'amber',
  'rose',
] as const;

export type HeadingTagColorId = (typeof HEADING_TAG_COLOR_IDS)[number];

export const DEFAULT_HEADING_TAG_COLOR: HeadingTagColorId = 'slate';

export const MAX_HEADING_TAGS = 8;
export const MAX_HEADING_TAG_LABEL = 32;

export interface HeadingTag {
  label: string;
  color?: HeadingTagColorId;
}

export interface HeadingTagSwatch {
  id: HeadingTagColorId;
  label: string;
  fg: string;
  bg: string;
  border: string;
  fgDark: string;
  bgDark: string;
  borderDark: string;
}

/** Muted, paper-friendly palette — default is slate (neutral). */
export const HEADING_TAG_SWATCHES: Record<HeadingTagColorId, HeadingTagSwatch> = {
  slate: {
    id: 'slate',
    label: 'Slate',
    fg: '#475569',
    bg: '#f1f5f9',
    border: '#cbd5e1',
    fgDark: '#cbd5e1',
    bgDark: '#1e293b',
    borderDark: '#475569',
  },
  stone: {
    id: 'stone',
    label: 'Stone',
    fg: '#57534e',
    bg: '#f5f5f4',
    border: '#d6d3d1',
    fgDark: '#d6d3d1',
    bgDark: '#292524',
    borderDark: '#57534e',
  },
  zinc: {
    id: 'zinc',
    label: 'Zinc',
    fg: '#3f3f46',
    bg: '#f4f4f5',
    border: '#d4d4d8',
    fgDark: '#d4d4d8',
    bgDark: '#27272a',
    borderDark: '#52525b',
  },
  blue: {
    id: 'blue',
    label: 'Blue',
    fg: '#3b6ea5',
    bg: '#eef4fa',
    border: '#c5d7ea',
    fgDark: '#93c5fd',
    bgDark: '#1e3a5f',
    borderDark: '#3b6ea5',
  },
  teal: {
    id: 'teal',
    label: 'Teal',
    fg: '#3d7a73',
    bg: '#eef6f4',
    border: '#c5ddd8',
    fgDark: '#99f6e4',
    bgDark: '#134e4a',
    borderDark: '#3d7a73',
  },
  olive: {
    id: 'olive',
    label: 'Olive',
    fg: '#6b7340',
    bg: '#f4f5ee',
    border: '#d5d8c4',
    fgDark: '#d9e0a8',
    bgDark: '#3f451f',
    borderDark: '#6b7340',
  },
  amber: {
    id: 'amber',
    label: 'Amber',
    fg: '#8a6a3a',
    bg: '#f7f3eb',
    border: '#e4d4b8',
    fgDark: '#f5d0a0',
    bgDark: '#44403c',
    borderDark: '#8a6a3a',
  },
  rose: {
    id: 'rose',
    label: 'Rose',
    fg: '#8a5a62',
    bg: '#f7eef0',
    border: '#e4c9ce',
    fgDark: '#f5c2c7',
    bgDark: '#4c1d24',
    borderDark: '#8a5a62',
  },
};

export type EmploymentTypeValue =
  | 'FULL_TIME'
  | 'PART_TIME'
  | 'CONTRACT'
  | 'FREELANCE'
  | 'INTERNSHIP';

const EMPLOYMENT_LABEL: Record<EmploymentTypeValue, string> = {
  FULL_TIME: 'Full Time',
  PART_TIME: 'Part Time',
  CONTRACT: 'Contract',
  FREELANCE: 'Freelance',
  INTERNSHIP: 'Internship',
};

const LABEL_TO_EMPLOYMENT: Record<string, EmploymentTypeValue> = {
  'full time': 'FULL_TIME',
  'full-time': 'FULL_TIME',
  fulltime: 'FULL_TIME',
  'part time': 'PART_TIME',
  'part-time': 'PART_TIME',
  parttime: 'PART_TIME',
  contract: 'CONTRACT',
  freelance: 'FREELANCE',
  internship: 'INTERNSHIP',
};

const LABEL_ALIASES: Record<string, string> = {
  'full-time': 'Full Time',
  fulltime: 'Full Time',
  'part-time': 'Part Time',
  parttime: 'Part Time',
  'on-site': 'On-site',
  onsite: 'On-site',
  'in-person': 'In Person',
  inperson: 'In Person',
  'open-source': 'Open Source',
  'open source': 'Open Source',
  opensource: 'Open Source',
  'pro-bono': 'Pro bono',
  'pro bono': 'Pro bono',
  probono: 'Pro bono',
};

export interface HeadingTagPreset {
  label: string;
  color?: HeadingTagColorId;
}

export const EXPERIENCE_HEADING_TAG_PRESETS: HeadingTagPreset[] = [
  { label: 'Full Time', color: 'slate' },
  { label: 'Contract', color: 'blue' },
  { label: 'Internship', color: 'teal' },
  { label: 'Part Time', color: 'stone' },
  { label: 'Freelance', color: 'olive' },
  { label: 'Remote', color: 'zinc' },
  { label: 'Hybrid', color: 'amber' },
];

export const EXPERIENCE_HEADING_TAG_GROUPS: string[][] = [
  ['Full Time', 'Part Time', 'Contract', 'Freelance', 'Internship'],
];

export const EDUCATION_HEADING_TAG_PRESETS: HeadingTagPreset[] = [
  { label: 'Online', color: 'blue' },
  { label: 'Pursuing', color: 'teal' },
  { label: 'In Person', color: 'stone' },
  { label: 'Hybrid', color: 'zinc' },
  { label: 'Honors', color: 'amber' },
  { label: 'Thesis', color: 'olive' },
  { label: 'Exchange', color: 'rose' },
];

export const EDUCATION_HEADING_TAG_GROUPS: string[][] = [
  ['Online', 'In Person', 'Hybrid'],
  ['Pursuing', 'Completed'],
];

export const PROJECT_HEADING_TAG_PRESETS: HeadingTagPreset[] = [
  { label: 'Open Source', color: 'teal' },
  { label: 'Personal', color: 'stone' },
  { label: 'Team', color: 'blue' },
  { label: 'Client', color: 'olive' },
  { label: 'Featured', color: 'amber' },
];

export const CUSTOM_HEADING_TAG_PRESETS: HeadingTagPreset[] = [
  { label: 'Featured', color: 'amber' },
  { label: 'Ongoing', color: 'teal' },
  { label: 'Award', color: 'rose' },
];

export const VOLUNTEERING_HEADING_TAG_PRESETS: HeadingTagPreset[] = [
  { label: 'Ongoing', color: 'teal' },
  { label: 'Remote', color: 'zinc' },
  { label: 'Pro bono', color: 'olive' },
];

const COLOR_ID_SET = new Set<string>(HEADING_TAG_COLOR_IDS);

export function isHeadingTagColorId(value: unknown): value is HeadingTagColorId {
  return typeof value === 'string' && COLOR_ID_SET.has(value);
}

export function headingTagSwatch(color?: string | null): HeadingTagSwatch {
  if (isHeadingTagColorId(color)) return HEADING_TAG_SWATCHES[color];
  return HEADING_TAG_SWATCHES[DEFAULT_HEADING_TAG_COLOR];
}

function normalizeKey(label: string): string {
  return label.trim().toLowerCase().replace(/[_]+/g, ' ').replace(/\s+/g, ' ');
}

export function canonicalHeadingTagLabel(label: string): string {
  const key = normalizeKey(label);
  if (!key) return '';
  if (LABEL_ALIASES[key]) return LABEL_ALIASES[key];
  if (LABEL_TO_EMPLOYMENT[key]) return EMPLOYMENT_LABEL[LABEL_TO_EMPLOYMENT[key]];
  return label.trim().replace(/\s+/g, ' ');
}

function sameLabel(a: string, b: string): boolean {
  return normalizeKey(canonicalHeadingTagLabel(a)) === normalizeKey(canonicalHeadingTagLabel(b));
}

function clampLabel(label: string): string {
  const canonical = canonicalHeadingTagLabel(label);
  if (canonical.length <= MAX_HEADING_TAG_LABEL) return canonical;
  return canonical.slice(0, MAX_HEADING_TAG_LABEL).trimEnd();
}

function asTag(raw: unknown): HeadingTag | null {
  if (typeof raw === 'string') {
    const label = clampLabel(raw);
    return label ? { label, color: DEFAULT_HEADING_TAG_COLOR } : null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as { label?: unknown; color?: unknown };
  if (typeof record.label !== 'string') return null;
  const label = clampLabel(record.label);
  if (!label) return null;
  return {
    label,
    color: isHeadingTagColorId(record.color) ? record.color : DEFAULT_HEADING_TAG_COLOR,
  };
}

export function headingTagsToJson(
  tags: HeadingTag[]
): Array<{ label: string; color: HeadingTagColorId }> {
  return tags.map((tag) => ({
    label: tag.label,
    color: tag.color ?? DEFAULT_HEADING_TAG_COLOR,
  }));
}

/** Accept JSON, string[], or {label,color}[] from Prisma / custom sections. */
export function parseHeadingTags(raw: unknown): HeadingTag[] {
  if (raw == null || raw === '') return [];
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      const tag = asTag(raw);
      return tag ? [tag] : [];
    }
  }
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tags: HeadingTag[] = [];
  for (const item of value) {
    if (tags.length >= MAX_HEADING_TAGS) break;
    const tag = asTag(item);
    if (!tag) continue;
    const key = normalizeKey(tag.label);
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

export function mergeHeadingTags(
  ...groups: Array<HeadingTag | HeadingTag[] | null | undefined>
): HeadingTag[] {
  const merged: HeadingTag[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    const list = !group ? [] : Array.isArray(group) ? group : [group];
    for (const tag of list) {
      const parsed = asTag(tag);
      if (!parsed) continue;
      const key = normalizeKey(parsed.label);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(parsed);
      if (merged.length >= MAX_HEADING_TAGS) return merged;
    }
  }
  return merged;
}

export function tagFromEmploymentType(
  employmentType: string | null | undefined
): HeadingTag | null {
  if (!employmentType) return null;
  const label = EMPLOYMENT_LABEL[employmentType as EmploymentTypeValue];
  if (!label) return null;
  const preset = EXPERIENCE_HEADING_TAG_PRESETS.find((item) => item.label === label);
  return { label, color: preset?.color ?? DEFAULT_HEADING_TAG_COLOR };
}

export function employmentTypeFromTags(tags: HeadingTag[]): EmploymentTypeValue | null {
  for (const tag of tags) {
    const mapped = LABEL_TO_EMPLOYMENT[normalizeKey(tag.label)];
    if (mapped) return mapped;
  }
  return null;
}

export function resolveExperienceHeadingTags(entry: {
  headingTags?: unknown;
  employmentType?: string | null;
}): HeadingTag[] {
  return mergeHeadingTags(
    parseHeadingTags(entry.headingTags),
    tagFromEmploymentType(entry.employmentType)
  );
}

export function toggleHeadingTag(
  tags: HeadingTag[],
  next: HeadingTagPreset | string,
  exclusiveGroups: string[][] = []
): HeadingTag[] {
  const incoming = typeof next === 'string' ? { label: next } : next;
  const label = clampLabel(incoming.label);
  if (!label) return tags;
  const exists = tags.some((tag) => sameLabel(tag.label, label));
  if (exists) {
    return tags.filter((tag) => !sameLabel(tag.label, label));
  }
  const group = exclusiveGroups.find((labels) => labels.some((item) => sameLabel(item, label)));
  const withoutGroup = group
    ? tags.filter((tag) => !group.some((item) => sameLabel(item, tag.label)))
    : tags;
  if (withoutGroup.length >= MAX_HEADING_TAGS) return tags;
  return [...withoutGroup, { label, color: incoming.color ?? DEFAULT_HEADING_TAG_COLOR }];
}

export function setHeadingTagColor(
  tags: HeadingTag[],
  label: string,
  color: HeadingTagColorId
): HeadingTag[] {
  return tags.map((tag) => (sameLabel(tag.label, label) ? { ...tag, color } : tag));
}

export function headingTagStyle(tag: HeadingTag): {
  '--tag-fg': string;
  '--tag-bg': string;
  '--tag-border': string;
  '--tag-fg-dark': string;
  '--tag-bg-dark': string;
  '--tag-border-dark': string;
} {
  const swatch = headingTagSwatch(tag.color);
  return {
    '--tag-fg': swatch.fg,
    '--tag-bg': swatch.bg,
    '--tag-border': swatch.border,
    '--tag-fg-dark': swatch.fgDark,
    '--tag-bg-dark': swatch.bgDark,
    '--tag-border-dark': swatch.borderDark,
  };
}

export function headingTagsHtml(tags: HeadingTag[], escape: (value: string) => string): string {
  if (tags.length === 0) return '';
  const chips = tags
    .map((tag) => {
      const swatch = headingTagSwatch(tag.color);
      return `<span class="resume-heading-tag" style="--tag-fg:${swatch.fg};--tag-bg:${swatch.bg};--tag-border:${swatch.border};--tag-fg-dark:${swatch.fgDark};--tag-bg-dark:${swatch.bgDark};--tag-border-dark:${swatch.borderDark}">${escape(tag.label)}</span>`;
    })
    .join('');
  return `<span class="resume-heading-tags">${chips}</span>`;
}

export function wrapHeadingTitleHtml(titleHtml: string, tagsHtml: string): string {
  if (!tagsHtml) return titleHtml;
  return `<div class="resume-entry-title-row">${titleHtml}${tagsHtml}</div>`;
}
