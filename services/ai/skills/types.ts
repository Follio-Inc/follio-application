/**
 * The saved model read of a resume's skills. Safe to import in the browser.
 *
 * The model reads each line once, after an edit is saved, and names the
 * skills the work shows even when it never names them ("cut query time
 * with indexes" shows SQL). Each skill keeps the refs and the exact line
 * text it came from, so a skill drops out the moment its line changes.
 */

import type { ResumeSkillKind, SkillSource } from '@/services/ai/evaluate/types';

/** Bump when the stored shape or the prompt changes, so old reads are redone. */
export const SKILL_PROFILE_VERSION = 1;

export interface StoredSkill {
  label: string;
  kind: ResumeSkillKind;
  aliases: string[];
  /** Broader skills it belongs to, as skill-list names. */
  broader: string[];
  refs: string[];
}

export interface StoredSkillProfile {
  version: number;
  /** Hash of the lines below, to skip a model call when nothing changed. */
  sourceHash: string;
  generatedAt: string;
  /** The text of each line when it was read, by ref. */
  lines: Record<string, string>;
  skills: StoredSkill[];
}

/** One line of the resume that can name a skill. */
export interface SkillLine {
  /** "H", "S", "E1", "E1.2", "K3", "P1", "C1", "D1". */
  ref: string;
  source: SkillSource;
  text: string;
}

export const SKILL_PROFILE_LIMITS = {
  maxSkills: 80,
  maxAliases: 4,
  maxBroader: 3,
  maxRefs: 6,
  maxLabelChars: 60,
} as const;
