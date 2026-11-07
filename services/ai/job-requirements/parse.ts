/**
 * Turn the model's requirement list into one the scores can trust. A term
 * the posting never writes is dropped, so a model cannot invent a
 * requirement; duplicates merge, and "required" wins over "preferred".
 */

import { z } from 'zod';

import { hasTerm, indexText, termForms, termId } from '@/services/ai/evaluate/keywords';
import { isDegreeText } from '@/services/ai/skills/education';

import {
  JOB_REQUIREMENT_LIMITS,
  REQUIREMENT_KINDS,
  type DegreeHint,
  type JobRequirement,
  type RequirementKind,
} from './types';

const requirementsSchema = z.object({
  requirements: z.array(
    z.object({
      term: z.string(),
      kind: z.string().optional(),
      importance: z.string().optional(),
      aliases: z.array(z.string()).optional(),
      broader: z.array(z.string()).optional(),
      degree: z
        .object({
          level: z.string().nullable().optional(),
          fields: z.array(z.string()).optional(),
          orRelated: z.boolean().optional(),
        })
        .nullable()
        .optional(),
    })
  ),
});

type ModelDegree = z.infer<typeof requirementsSchema>['requirements'][number]['degree'];

function cleanList(values: readonly string[] | undefined, max: number, chars: number): string[] {
  const list = (values ?? [])
    .map((value) => cleanTerm(value, chars))
    .filter((value): value is string => value !== null);
  return [...new Set(list)].slice(0, max);
}

function readDegree(value: ModelDegree): DegreeHint | null {
  if (!value) return null;
  const { maxFields, maxAliasChars } = JOB_REQUIREMENT_LIMITS;
  return {
    level: value.level?.trim().toLowerCase() || null,
    fields: cleanList(value.fields, maxFields, maxAliasChars),
    orRelated: value.orRelated === true,
  };
}

/**
 * Degree wording varies too much to check letter for letter ("BS/MS in CS"
 * against "Bachelor's degree in Computer Science"), so a degree counts when
 * the posting asks for a degree at all.
 */
function isGrounded(
  term: string,
  kind: RequirementKind,
  degree: DegreeHint | null,
  posting: ReturnType<typeof indexText>,
  postingAsksForDegree: boolean
): boolean {
  if (hasTerm(posting, termForms(term))) return true;
  return kind === 'credential' && (degree !== null || isDegreeText(term)) && postingAsksForDegree;
}

function cleanTerm(value: string, max: number): string | null {
  const clean = value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s\-•*·:;,.]+|[\s:;,.]+$/g, '');
  return clean && clean.length <= max ? clean : null;
}

function readKind(value: string | undefined): RequirementKind {
  const kind = value?.trim().toLowerCase();
  return REQUIREMENT_KINDS.find((item) => item === kind) ?? 'practice';
}

/** Requirements the posting really states, or null when the model output is unusable. */
export function parseJobRequirements(
  model: unknown,
  jobDescription: string
): JobRequirement[] | null {
  const parsed = requirementsSchema.safeParse(model);
  if (!parsed.success) return null;

  const { maxItems, maxAliases, maxBroader, maxTermChars, maxAliasChars } = JOB_REQUIREMENT_LIMITS;
  const posting = indexText(jobDescription);
  const postingAsksForDegree = isDegreeText(jobDescription);
  const byId = new Map<string, JobRequirement>();

  for (const item of parsed.data.requirements) {
    const term = cleanTerm(item.term, maxTermChars);
    if (!term) continue;
    const id = termId(term);
    const kind = readKind(item.kind);
    const degree = kind === 'credential' ? readDegree(item.degree) : null;
    if (!id || !isGrounded(term, kind, degree, posting, postingAsksForDegree)) continue;

    const importance =
      item.importance?.trim().toLowerCase() === 'preferred' ? 'preferred' : 'required';
    const aliases = (item.aliases ?? [])
      .map((alias) => cleanTerm(alias, maxAliasChars))
      .filter((alias): alias is string => alias !== null && termId(alias) !== id);

    const existing = byId.get(id);
    if (existing) {
      if (importance === 'required') existing.importance = 'required';
      for (const alias of aliases) {
        if (existing.aliases.length < maxAliases && !existing.aliases.includes(alias)) {
          existing.aliases.push(alias);
        }
      }
      continue;
    }
    if (byId.size >= maxItems) continue;
    const broader = cleanList(item.broader, maxBroader, maxAliasChars);
    byId.set(id, {
      term,
      kind,
      importance,
      aliases: [...new Set(aliases)].slice(0, maxAliases),
      ...(broader.length > 0 ? { broader } : {}),
      ...(degree ? { degree } : {}),
    });
  }

  const list = [...byId.values()];
  return [
    ...list.filter((item) => item.importance === 'required'),
    ...list.filter((item) => item.importance === 'preferred'),
  ];
}
