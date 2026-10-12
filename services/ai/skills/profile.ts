/**
 * The resume's own skill list. Code reads every skill the resume names,
 * through the shared skill list, on every change. The saved model read
 * adds the skills the work shows without naming, for lines that have not
 * changed since it was made.
 */

import type { ResumeSkill, ResumeSkillKind, SkillSource } from '@/services/ai/evaluate/types';
import type { EditFacts } from '@/services/ai/resume-edit/facts';

import { catalogEntry, customSkillId, resolveSkill, scanSkills } from './catalog';
import type { SkillLine, StoredSkillProfile } from './types';

/** Reading order for each skill's sources. */
export const SKILL_SOURCES: readonly SkillSource[] = [
  'experience',
  'summary',
  'projects',
  'certifications',
  'skills',
  'education',
];

/** Skill entries are sometimes typed as "Python, Go"; each is its own skill. */
function splitEntries(skills: readonly string[]): string[] {
  return skills.flatMap((entry) =>
    entry
      .split(/[,;|•]/)
      .map((part) => part.trim())
      .filter(Boolean)
  );
}

/** Every line that can name a skill, with a short ref for each. */
export function readSkillLines(facts: EditFacts): SkillLine[] {
  const lines: SkillLine[] = [];
  if (facts.headline) lines.push({ ref: 'H', source: 'summary', text: facts.headline });
  if (facts.summary) lines.push({ ref: 'S', source: 'summary', text: facts.summary });
  for (const experience of facts.experiences) {
    if (experience.label) {
      lines.push({ ref: experience.ref, source: 'experience', text: experience.label });
    }
    for (const bullet of experience.bullets) {
      lines.push({ ref: bullet.ref, source: 'experience', text: bullet.text });
    }
  }
  for (const project of facts.projects) {
    lines.push({ ref: project.ref, source: 'projects', text: project.text });
  }
  for (const certification of facts.certifications) {
    lines.push({ ref: certification.ref, source: 'certifications', text: certification.text });
  }
  splitEntries(facts.skills).forEach((text, index) => {
    lines.push({ ref: `K${index + 1}`, source: 'skills', text });
  });
  for (const degree of facts.degrees) {
    const text = [degree.degree, degree.field].filter(Boolean).join(', ');
    if (text) lines.push({ ref: degree.ref, source: 'education', text });
  }
  return lines;
}

interface Found {
  id: string;
  label: string;
  kind: ResumeSkillKind;
  aliases?: readonly string[];
  broader?: readonly string[];
}

function fromCatalog(id: string, fallback: string): Found {
  const entry = catalogEntry(id);
  return { id, label: entry?.label ?? fallback, kind: entry?.kind ?? 'other' };
}

/** A skill entry is its own name, even one the list keeps out of running text ("Go", "R"). */
function readEntry(text: string): Found[] {
  const id = resolveSkill(text);
  if (id) return [fromCatalog(id, text)];
  const found = scanSkills(text).map((item) => fromCatalog(item.id, item.label));
  return found.length > 0 ? found : [{ id: customSkillId(text), label: text, kind: 'other' }];
}

/** Stored skills whose lines still read as they did when the model saw them. */
function storedSkills(stored: StoredSkillProfile, lines: ReadonlyMap<string, SkillLine>) {
  return stored.skills.flatMap((skill) => {
    const refs = skill.refs.filter((ref) => {
      const line = lines.get(ref);
      return line !== undefined && stored.lines[ref] === line.text;
    });
    if (refs.length === 0) return [];
    const id =
      resolveSkill(skill.label) ??
      skill.aliases.map(resolveSkill).find((value): value is string => value !== null) ??
      customSkillId(skill.label);
    const base = id.startsWith('x:')
      ? { id, label: skill.label, kind: skill.kind }
      : fromCatalog(id, skill.label);
    const broader = skill.broader
      .map(resolveSkill)
      .filter((value): value is string => value !== null && value !== id);
    return [{ found: { ...base, aliases: skill.aliases, broader }, refs }];
  });
}

/** Every skill the resume names or shows, with the lines and sections behind each. */
export function readResumeSkills(
  facts: EditFacts,
  stored: StoredSkillProfile | null = null
): ResumeSkill[] {
  const lines = readSkillLines(facts);
  const byRef = new Map(lines.map((line) => [line.ref, line]));
  const skills = new Map<string, ResumeSkill>();

  const add = (found: Found, line: SkillLine, inferred: boolean) => {
    const existing = skills.get(found.id);
    const skill = existing ?? {
      id: found.id,
      label: found.label,
      kind: found.kind,
      where: [],
      refs: [],
      inferred,
      aliases: [],
      broader: [],
    };
    if (!existing) skills.set(found.id, skill);
    skill.inferred = skill.inferred && inferred;
    if (!skill.where.includes(line.source)) skill.where.push(line.source);
    if (!skill.refs.includes(line.ref)) skill.refs.push(line.ref);
    for (const alias of found.aliases ?? []) {
      if (!skill.aliases.includes(alias)) skill.aliases.push(alias);
    }
    for (const id of found.broader ?? []) {
      if (!skill.broader.includes(id)) skill.broader.push(id);
    }
  };

  for (const line of lines) {
    const found =
      line.source === 'skills'
        ? readEntry(line.text)
        : scanSkills(line.text).map((item) => fromCatalog(item.id, item.label));
    for (const item of found) add(item, line, false);
  }
  if (stored) {
    for (const { found, refs } of storedSkills(stored, byRef)) {
      for (const ref of refs) {
        const line = byRef.get(ref);
        if (line) add(found, line, true);
      }
    }
  }

  const list = [...skills.values()];
  for (const skill of list) {
    skill.where.sort((a, b) => SKILL_SOURCES.indexOf(a) - SKILL_SOURCES.indexOf(b));
  }
  return list;
}
