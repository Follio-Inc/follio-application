/**
 * Helpers for category + skill groups (plain CSV and rich HTML).
 */

import { escapeHtml, isHtmlEmpty, stripHtmlTags } from '@/lib/html-utils';

export interface SkillGroupInput {
  name: string;
  skills: string[];
  skillsHtml?: string | null;
}

/** Parse a comma-separated skills field into trimmed unique names. */
export function parseCommaSeparatedSkills(text: string): string[] {
  const seen = new Set<string>();
  const skills: string[] = [];

  for (const part of text.split(',')) {
    const name = part.trim();
    if (!name || name.length > 50) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    skills.push(name);
  }

  return skills;
}

/** Join skill names for the comma-separated editor field. */
export function formatSkillsList(skills: string[]): string {
  return skills.join(', ');
}

/**
 * Build justified rich-text HTML from a flat skill name list.
 * Used to seed the editor when `skillsHtml` is missing (legacy data).
 */
export function skillsToHtml(skills: string[]): string {
  const names = skills.map((s) => s.trim()).filter(Boolean);
  if (names.length === 0) return '';
  return `<p style="text-align: justify">${escapeHtml(names.join(', '))}</p>`;
}

/**
 * Extract skill names from rich-text HTML for Skill row sync.
 * Prefers list items; otherwise treats text as comma-separated.
 */
export function extractSkillNamesFromHtml(html: string | null | undefined): string[] {
  if (!html || isHtmlEmpty(html)) return [];

  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  const fromList: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = liRegex.exec(html)) !== null) {
    const name = stripHtmlTags(match[1] ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    if (name) fromList.push(name);
  }

  if (fromList.length > 0) {
    return parseCommaSeparatedSkills(fromList.join(', '));
  }

  const text = stripHtmlTags(html).replace(/\n+/g, ', ').replace(/\s+/g, ' ').trim();
  return parseCommaSeparatedSkills(text);
}

/**
 * Resolve editor HTML for a group: prefer stored skillsHtml, else seed from names.
 */
export function resolveSkillsHtml(
  skillsHtml: string | null | undefined,
  skillNames: string[]
): string {
  if (skillsHtml && !isHtmlEmpty(skillsHtml)) return skillsHtml;
  return skillsToHtml(skillNames);
}

/** Flatten groups to a deduped skill name list (first occurrence wins). */
export function flattenSkillGroups(groups: SkillGroupInput[]): string[] {
  const seen = new Set<string>();
  const skills: string[] = [];

  for (const group of groups) {
    for (const skill of group.skills) {
      const name = skill.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      skills.push(name);
    }
  }

  return skills;
}

/**
 * Normalize editor rows into persistable groups.
 * Skips rows with neither a category name nor skills.
 * Uses "Skills" when skills exist but the category is blank.
 */
export function normalizeSkillGroups(
  groups: Array<{ name: string; skills: string[] | string; skillsHtml?: string | null }>
): SkillGroupInput[] {
  const result: SkillGroupInput[] = [];
  const seenSkillKeys = new Set<string>();

  for (const group of groups) {
    const name = group.name.trim();
    const fromHtml = group.skillsHtml ? extractSkillNamesFromHtml(group.skillsHtml) : [];
    const fromField =
      typeof group.skills === 'string'
        ? parseCommaSeparatedSkills(group.skills)
        : group.skills.map((s) => s.trim()).filter(Boolean);
    const skills = (fromHtml.length > 0 ? fromHtml : fromField).filter((skill) => {
      const key = skill.toLowerCase();
      if (seenSkillKeys.has(key)) return false;
      seenSkillKeys.add(key);
      return skill.length <= 50;
    });

    if (!name && skills.length === 0 && isHtmlEmpty(group.skillsHtml)) continue;

    const skillsHtml =
      group.skillsHtml && !isHtmlEmpty(group.skillsHtml) ? group.skillsHtml : skillsToHtml(skills);

    result.push({
      name: name || 'Skills',
      skills,
      skillsHtml,
    });
  }

  return result;
}

/** Convert a flat skill list into a single category for the editor. */
export function skillGroupsFromFlatSkills(skills: string[]): SkillGroupInput[] {
  const parsed = skills.map((s) => s.trim()).filter(Boolean);
  if (parsed.length === 0) return [];
  return [{ name: 'Skills', skills: parsed, skillsHtml: skillsToHtml(parsed) }];
}

/**
 * Resolve the visible category label for a skill group on the resume.
 * Blank names and a sole generic "Skills" bucket (persistence fallback when
 * category is omitted) render without a label so the section stays a plain CSV.
 */
export function resolveSkillCategoryLabel(
  name: string | null | undefined,
  groupNames: Array<string | null | undefined>
): string | null {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return null;

  const normalizedNames = groupNames.map((n) => (n ?? '').trim()).filter(Boolean);
  const isSoleGeneric =
    normalizedNames.length === 1 &&
    normalizedNames[0]!.toLowerCase() === 'skills' &&
    trimmed.toLowerCase() === 'skills';

  if (isSoleGeneric) return null;
  return trimmed;
}

/** True when at least one group should show a bold "Category:" label. */
export function skillGroupsHaveCategoryLabels(
  groups: Array<{ name: string | null | undefined }>
): boolean {
  const names = groups.map((g) => g.name);
  return groups.some((g) => resolveSkillCategoryLabel(g.name, names) !== null);
}
