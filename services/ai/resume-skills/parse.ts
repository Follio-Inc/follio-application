/**
 * Keep only what the model's skill read can back up: every skill needs at
 * least one real line ref, and each line's text is saved with it so the
 * skill drops out when that line changes.
 */

import { z } from 'zod';

import { foldPhrase } from '@/services/ai/evaluate/keywords';
import type { ResumeSkillKind } from '@/services/ai/evaluate/types';
import {
  SKILL_PROFILE_LIMITS,
  SKILL_PROFILE_VERSION,
  type SkillLine,
  type StoredSkill,
  type StoredSkillProfile,
} from '@/services/ai/skills/types';

const skillsSchema = z.object({
  skills: z.array(
    z.object({
      label: z.string(),
      kind: z.string().optional(),
      aliases: z.array(z.string()).optional(),
      broader: z.array(z.string()).optional(),
      refs: z.array(z.string()),
    })
  ),
});

const KINDS: readonly ResumeSkillKind[] = ['tool', 'practice', 'domain'];

function clean(value: string): string | null {
  const text = value.replace(/\s+/g, ' ').trim();
  return text && text.length <= SKILL_PROFILE_LIMITS.maxLabelChars ? text : null;
}

function cleanList(values: readonly string[] | undefined, max: number): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const value of values ?? []) {
    const text = clean(value);
    const key = text ? foldPhrase(text) : '';
    if (!text || !key || seen.has(key)) continue;
    seen.add(key);
    list.push(text);
    if (list.length >= max) break;
  }
  return list;
}

/** A profile for these lines, or null when the model output is unusable. */
export function parseResumeSkills(
  model: unknown,
  lines: readonly SkillLine[],
  sourceHash: string,
  now: Date = new Date()
): StoredSkillProfile | null {
  const parsed = skillsSchema.safeParse(model);
  if (!parsed.success) return null;

  const { maxSkills, maxAliases, maxBroader, maxRefs } = SKILL_PROFILE_LIMITS;
  const known = new Map(lines.map((line) => [line.ref, line.text]));
  const byKey = new Map<string, StoredSkill>();

  for (const item of parsed.data.skills) {
    const label = clean(item.label);
    const key = label ? foldPhrase(label) : '';
    const refs = [...new Set(item.refs.map((ref) => ref.trim()))].filter((ref) => known.has(ref));
    if (!label || !key || refs.length === 0) continue;

    const existing = byKey.get(key);
    if (existing) {
      for (const ref of refs) {
        if (existing.refs.length < maxRefs && !existing.refs.includes(ref)) existing.refs.push(ref);
      }
      continue;
    }
    if (byKey.size >= maxSkills) continue;
    const kind = KINDS.find((value) => value === item.kind?.trim().toLowerCase()) ?? 'other';
    byKey.set(key, {
      label,
      kind,
      aliases: cleanList(item.aliases, maxAliases).filter((alias) => foldPhrase(alias) !== key),
      broader: cleanList(item.broader, maxBroader),
      refs: refs.slice(0, maxRefs),
    });
  }

  const skills = [...byKey.values()];
  const used = new Set(skills.flatMap((skill) => skill.refs));
  return {
    version: SKILL_PROFILE_VERSION,
    sourceHash,
    generatedAt: now.toISOString(),
    lines: Object.fromEntries([...known].filter(([ref]) => used.has(ref))),
    skills,
  };
}

/** A stored profile, or null when it is missing or from an older version. */
export function readStoredSkillProfile(value: unknown): StoredSkillProfile | null {
  if (!value || typeof value !== 'object') return null;
  const profile = value as Partial<StoredSkillProfile>;
  if (
    profile.version !== SKILL_PROFILE_VERSION ||
    typeof profile.sourceHash !== 'string' ||
    !Array.isArray(profile.skills) ||
    !profile.lines ||
    typeof profile.lines !== 'object'
  ) {
    return null;
  }
  return profile as StoredSkillProfile;
}
