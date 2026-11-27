/**
 * Keeps AI resume edits honest.
 *
 * The model proposes rewrites, new bullets, and removals. This decides what
 * the user is shown:
 * - a number the resume does not state becomes a blank the user fills in;
 * - a tool, name, or job-posting term the resume never mentions drops the change;
 * - a headline or summary may not raise seniority;
 * - a rewrite may not lose a number its line already states;
 * - edits must point at a line the user asked to change;
 * - a role gains at most a couple of bullets, never a copy of one it has, and
 *   never loses so many that it reads empty.
 * The user's own instructions count as facts; the job description never does.
 */

import { z } from 'zod';

import { sameText } from '@/lib/resume-edit/document';
import {
  EDIT_PLACEHOLDER,
  maxCharsFor,
  RESUME_EDIT_LIMITS,
  type EditOp,
  type EditTarget,
  type ResumeEditChange,
} from '@/lib/resume-edit/types';
import { numbersIn } from '@/services/ai/evaluate/lines';
import { canon, requirementTokens, tokenize } from '@/services/ai/jd-align/support';

import {
  experienceCorpus,
  factCorpus,
  INSERT_SUFFIX,
  resolveInsertRef,
  resolveRef,
  type EditFacts,
  type FactExperience,
} from './facts';

/** `{ref, text}` rewrites; `{ref: "E1.2+", text}` adds after E1.2; `{ref, remove: true}` removes. */
const rawChange = z.object({
  ref: z.string(),
  text: z.string().optional().nullable(),
  remove: z.boolean().optional().nullable(),
  reason: z.string().optional().nullable(),
});

const DEFAULT_REASON = {
  rewrite: 'Clearer, stronger wording.',
  insert: 'Adds something this role does not show yet.',
  delete: 'Repeats another line or adds little here.',
} as const;

const NUMBER = /\$?\d[\d,]*(?:\.\d+)?%?/g;
const DIGITS = /\d[\d,]*(?:\.\d+)?/;
const WORD = /[A-Za-z][A-Za-z0-9]*(?:[.+#-][A-Za-z0-9]+)*[+#]*/g;

const SENIORITY = new Set([
  'senior',
  'sr',
  'staff',
  'principal',
  'lead',
  'head',
  'director',
  'vp',
  'chief',
  'manager',
  'architect',
]);

/** Ordinary resume words. A job posting using them does not make them claims. */
const COMMON = new Set([
  'led',
  'built',
  'drove',
  'owned',
  'shipped',
  'launched',
  'delivered',
  'designed',
  'improved',
  'reduced',
  'increased',
  'grew',
  'scaled',
  'cut',
  'saved',
  'partnered',
  'mentored',
  'managed',
  'created',
  'developed',
  'implemented',
  'automated',
  'streamlined',
  'optimized',
  'migrated',
  'standardized',
  'established',
  'across',
  'cross',
  'functional',
  'stakeholders',
  'customers',
  'users',
  'team',
  'teams',
  'product',
  'quality',
  'reliability',
  'performance',
  'impact',
  'results',
  'end',
]);

function cleanLine(value: string, multiline: boolean): string {
  const unwrapped = value.replace(/^[\s"'“”‘’•*·–—-]+/, '').replace(/[\s"'“”‘’]+$/, '');
  if (!multiline) return unwrapped.replace(/\s+/g, ' ').trim();
  return unwrapped
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function numberKey(token: string): string {
  return token.toLowerCase().replace(/[$%,]/g, '');
}

/** Numbers the source does not contain become blanks: "40%" -> "[__]%". */
export function blankForeignNumbers(text: string, source: string): string {
  const allowed = new Set((source.match(NUMBER) ?? []).map(numberKey));
  return text.replace(NUMBER, (token) =>
    allowed.has(numberKey(token)) ? token : token.replace(DIGITS, EDIT_PLACEHOLDER)
  );
}

function sameStem(a: string, b: string): boolean {
  return a === b || (a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5));
}

function vocabulary(text: string): string[] {
  return [...new Set(tokenize(text).map(canon))];
}

function known(word: string, words: string[]): boolean {
  const tokens = tokenize(word).map(canon);
  return tokens.every((token) => words.some((have) => sameStem(token, have)));
}

/** A tool, acronym, or proper noun: "AWS", "GraphQL", "Node.js", "C++", "S3", "Kubernetes". */
function looksLikeName(word: string, startsSentence: boolean): boolean {
  if (/[A-Z].*[A-Z]/.test(word) || /\d/.test(word) || /[+#.]/.test(word)) return true;
  return /^[A-Z]/.test(word) && !startsSentence;
}

function startsSentence(text: string, index: number): boolean {
  const before = text.slice(0, index).trimEnd();
  return before.length === 0 || /[.!?:;\n]$/.test(before);
}

/**
 * Words the rewrite claims that nothing true supports. Empty means the
 * change only rephrases what the resume, or the user, already said.
 */
export function unsupportedTerms(
  text: string,
  facts: { corpus: string; before: string; jobDescription: string | null }
): string[] {
  const truth = vocabulary(`${facts.corpus}\n${facts.before}`);
  const job = vocabulary(facts.jobDescription ?? '');
  const out: string[] = [];
  for (const match of text.matchAll(WORD)) {
    const word = match[0];
    if (requirementTokens(word, '').length === 0 || known(word, truth)) continue;
    const lower = word.toLowerCase();
    const fromJob = !COMMON.has(lower) && known(word, job) && !/(?:ed|ing|ly)$/.test(lower);
    if (looksLikeName(word, startsSentence(text, match.index ?? 0)) || fromJob) {
      out.push(word);
    }
  }
  return out;
}

function raisesSeniority(text: string, corpus: string): boolean {
  const have = new Set(tokenize(corpus));
  return tokenize(text).some((token) => SENIORITY.has(token) && !have.has(token));
}

export interface GroundInput {
  facts: EditFacts;
  editableRefs: string[];
  jobDescription: string | null;
  instructions: string | null;
}

export interface GroundResult {
  changes: ResumeEditChange[];
  /** Suggestions removed for claiming something the resume does not show. */
  dropped: number;
}

type Row = z.infer<typeof rawChange>;
type Grounded = ResumeEditChange | 'dropped' | null;

/** One model request's worth of context, plus what earlier rows already used up. */
interface Batch {
  input: GroundInput;
  corpus: string;
  editable: Set<string>;
  /** New bullets and removals so far, per experience id. */
  added: Map<string, number>;
  removed: Map<string, number>;
}

interface Line {
  target: EditTarget;
  before: string;
  experience: FactExperience | null;
}

/** Text a change may write, unstated numbers blanked. 'dropped' when it claims too much; null to ignore. */
function groundText(raw: string, line: Line, batch: Batch): string | 'dropped' | null {
  const cleaned = cleanLine(raw, line.target.kind === 'summary');
  if (!cleaned || cleaned.length > maxCharsFor(line.target)) return null;

  const instructions = batch.input.instructions ?? '';
  const numberSource = `${line.experience ? experienceCorpus(line.experience) : batch.corpus}\n${instructions}`;
  const text = blankForeignNumbers(cleaned, numberSource);
  if (sameText(text, line.before)) return null;

  const truth = `${batch.corpus}\n${instructions}`;
  const terms = unsupportedTerms(text, {
    corpus: truth,
    before: line.before,
    jobDescription: batch.input.jobDescription,
  });
  if (terms.length > 0) return 'dropped';
  if (line.target.kind !== 'bullet' && raisesSeniority(text, `${truth}\n${line.before}`)) {
    return 'dropped';
  }
  return text;
}

function reasonFor(row: Row, op: EditOp): string {
  return cleanLine(row.reason ?? '', false).slice(0, 140) || DEFAULT_REASON[op];
}

function bump(counts: Map<string, number>, id: string): number {
  const next = (counts.get(id) ?? 0) + 1;
  counts.set(id, next);
  return next;
}

/** A rewrite may reword a line but never lose a figure it states. */
function dropsNumber(before: string, after: string): boolean {
  const kept = new Set(numbersIn(after));
  return numbersIn(before).some((value) => !kept.has(value));
}

function groundRewrite(row: Row, ref: string, batch: Batch): Grounded {
  const resolved = batch.editable.has(ref) ? resolveRef(batch.input.facts, ref) : null;
  if (!resolved) return null;
  const text = groundText(row.text ?? '', resolved, batch);
  if (text === null || text === 'dropped') return text;
  if (dropsNumber(resolved.before, text)) return null;
  return {
    id: ref,
    op: 'rewrite',
    target: resolved.target,
    label: resolved.label,
    before: resolved.before,
    after: text,
    reason: reasonFor(row, 'rewrite'),
    status: 'proposed',
  };
}

function groundRemove(row: Row, ref: string, batch: Batch): Grounded {
  const resolved = batch.editable.has(ref) ? resolveRef(batch.input.facts, ref) : null;
  const experience = resolved?.experience;
  if (!resolved || !experience || resolved.target.kind !== 'bullet') return null;
  const removed = batch.removed.get(experience.id) ?? 0;
  if (experience.bullets.length - removed - 1 < RESUME_EDIT_LIMITS.minBulletsPerRole) return null;
  bump(batch.removed, experience.id);
  return {
    id: ref,
    op: 'delete',
    target: resolved.target,
    label: resolved.label,
    before: resolved.before,
    after: '',
    reason: reasonFor(row, 'delete'),
    status: 'proposed',
  };
}

function groundInsert(row: Row, ref: string, batch: Batch): Grounded {
  const resolved = resolveInsertRef(batch.input.facts, ref);
  if (!resolved) return null;
  const { experience } = resolved;
  const allowed =
    batch.editable.has(resolved.after) ||
    (resolved.anchor === null &&
      [...batch.editable].some((item) => item.startsWith(`${experience.ref}.`)));
  if (!allowed) return null;
  if ((batch.added.get(experience.id) ?? 0) >= RESUME_EDIT_LIMITS.maxNewBulletsPerRole) {
    return null;
  }

  const text = groundText(row.text ?? '', { ...resolved, before: '' }, batch);
  if (text === null || text === 'dropped') return text;
  if (experience.bullets.some((bullet) => sameText(bullet.text, text))) return null;
  bump(batch.added, experience.id);
  return {
    id: ref,
    op: 'insert',
    target: resolved.target,
    label: resolved.label,
    before: '',
    after: text,
    anchor: resolved.anchor,
    reason: reasonFor(row, 'insert'),
    status: 'proposed',
  };
}

/** Turn a model payload into changes the user can review. Unknown shapes become no changes. */
export function groundEdits(model: unknown, input: GroundInput): GroundResult {
  const rows =
    model && typeof model === 'object' ? (model as Record<string, unknown>).changes : undefined;
  if (!Array.isArray(rows)) return { changes: [], dropped: 0 };

  const batch: Batch = {
    input,
    corpus: factCorpus(input.facts),
    editable: new Set(input.editableRefs),
    added: new Map(),
    removed: new Map(),
  };
  const seen = new Set<string>();
  const changes: ResumeEditChange[] = [];
  let dropped = 0;

  for (const row of rows) {
    const parsed = rawChange.safeParse(row);
    if (!parsed.success) continue;
    const ref = parsed.data.ref.trim().replace(/^\[|\]$/g, '');
    if (seen.has(ref)) continue;

    const result = ref.endsWith(INSERT_SUFFIX)
      ? groundInsert(parsed.data, ref, batch)
      : parsed.data.remove
        ? groundRemove(parsed.data, ref, batch)
        : groundRewrite(parsed.data, ref, batch);
    if (result === null) continue;
    seen.add(ref);
    if (result === 'dropped') dropped += 1;
    else changes.push(result);
    if (changes.length >= RESUME_EDIT_LIMITS.maxChanges) break;
  }

  return { changes, dropped };
}
