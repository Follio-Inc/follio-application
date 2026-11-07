/**
 * Look skills up in the shared vocabulary: resolve a written name to its
 * id, find every skill named in a line of text, and walk the broader
 * skills each one belongs to.
 */

import {
  foldPhrase,
  indexText,
  otherNumber,
  type TextIndex,
} from '@/services/ai/evaluate/keywords';

import { SKILL_CATALOG, type CatalogEntry } from './catalog-data';

type FormMode = 'any' | 'case' | 'entry';

interface FormHit {
  id: string;
  mode: FormMode;
  /** For `case` forms: the raw tokens that must appear, e.g. "Excel". */
  raw: string;
}

const byId = new Map<string, CatalogEntry>();
const forms = new Map<string, FormHit[]>();
const children = new Map<string, string[]>();
let longestForm = 1;

function rawTokens(written: string): string {
  return indexText(written)
    .map((token) => token.raw)
    .join(' ');
}

function addForm(written: string, id: string, mode: FormMode, fold = foldPhrase(written)) {
  if (!fold) return;
  const hits = forms.get(fold) ?? [];
  if (hits.some((hit) => hit.id === id)) return;
  hits.push({ id, mode, raw: rawTokens(written) });
  forms.set(fold, hits);
  longestForm = Math.max(longestForm, fold.split(' ').length);
}

for (const entry of SKILL_CATALOG) {
  byId.set(entry.id, entry);
  for (const parent of entry.under ?? []) {
    children.set(parent, [...(children.get(parent) ?? []), entry.id]);
  }
}
for (const entry of SKILL_CATALOG) {
  const special = new Set([...(entry.strict ?? []), ...(entry.entryOnly ?? [])].map(foldPhrase));
  if (!special.has(foldPhrase(entry.label))) addForm(entry.label, entry.id, 'any');
  for (const name of entry.aka ?? []) addForm(name, entry.id, 'any');
  for (const name of entry.strict ?? []) addForm(name, entry.id, 'case');
  for (const name of entry.entryOnly ?? []) addForm(name, entry.id, 'entry');
}
// Plural and singular of every free form, unless that spelling already names something.
for (const [fold, hits] of [...forms]) {
  const other = otherNumber(fold);
  if (!other || forms.has(other)) continue;
  const free = hits.filter((hit) => hit.mode === 'any');
  if (free.length > 0) forms.set(other, free);
}

export function catalogEntry(id: string): CatalogEntry | undefined {
  return byId.get(id);
}

/** The catalog id for a whole name, e.g. "DBMS" or "Postgres". Null when the name is not in the catalog. */
export function resolveSkill(name: string): string | null {
  const fold = foldPhrase(name);
  if (!fold) return null;
  return forms.get(fold)?.[0]?.id ?? null;
}

/** An id for a skill the catalog does not know, stable across spellings of the same words. */
export function customSkillId(name: string): string {
  return `x:${foldPhrase(name)}`;
}

export interface FoundSkill {
  id: string;
  /** As the text writes it. */
  label: string;
}

/**
 * Every catalog skill named in one line, longest name first, so "Spark SQL"
 * is Spark and not also SQL. Names that are ordinary words in prose only
 * count under their `strict` or `entryOnly` rules.
 */
export function scanSkills(text: string, index: TextIndex = indexText(text)): FoundSkill[] {
  const found: FoundSkill[] = [];
  let i = 0;
  while (i < index.length) {
    let step = 1;
    for (let size = Math.min(longestForm, index.length - i); size >= 1; size -= 1) {
      const slice = index.slice(i, i + size);
      const hits = forms.get(slice.map((token) => token.fold).join(' '));
      if (!hits) continue;
      const raw = slice.map((token) => token.raw).join(' ');
      const hit = hits.find(
        (item) => item.mode === 'any' || (item.mode === 'case' && item.raw === raw)
      );
      if (!hit) continue;
      const start = slice[0]?.index ?? 0;
      const last = slice[slice.length - 1];
      const end = last ? last.index + last.raw.length : start;
      found.push({ id: hit.id, label: text.slice(start, end) });
      step = size;
      break;
    }
    i += step;
  }
  return found;
}

/** The skills `id` belongs to directly. */
export function parentsOf(id: string): readonly string[] {
  return byId.get(id)?.under ?? [];
}

const ancestorCache = new Map<string, ReadonlySet<string>>();

/** Every broader skill `id` belongs to, at any depth. PostgreSQL: SQL, relational databases, DBMS, databases. */
export function ancestorsOf(id: string): ReadonlySet<string> {
  const cached = ancestorCache.get(id);
  if (cached) return cached;
  const seen = new Set<string>();
  const stack = [...parentsOf(id)];
  while (stack.length > 0) {
    const next = stack.pop();
    if (!next || seen.has(next) || next === id) continue;
    seen.add(next);
    stack.push(...parentsOf(next));
  }
  ancestorCache.set(id, seen);
  return seen;
}

export function isGeneric(id: string): boolean {
  return byId.get(id)?.generic === true;
}

/** Siblings under a specific group: MySQL and PostgreSQL, React and Vue, AWS and Azure. */
export function shareSpecificParent(a: string, b: string): boolean {
  if (a === b) return false;
  const parents = new Set(parentsOf(a).filter((parent) => !isGeneric(parent)));
  return parentsOf(b).some((parent) => parents.has(parent));
}

/** Names of the groups other skills sit under, for prompts that should use the same words. */
export function categoryNames(): string[] {
  return [...children.keys()]
    .map((id) => byId.get(id)?.label)
    .filter((label): label is string => Boolean(label))
    .sort((a, b) => a.localeCompare(b));
}
