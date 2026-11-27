/**
 * Read and write the parts of a resume that AI edits may touch.
 *
 * Experience bullets live twice: editor HTML (`bulletsHtml`, what the resume
 * renders) and `bullets[]` (derived from it). An edit replaces, adds, or
 * removes one list item, keeps the paragraph styling of its neighbours, and
 * rebuilds `bullets[]` from the new HTML, the same way the editor does.
 *
 * Bullets are found by their text, with the suggested position only breaking
 * ties. Keeping one suggestion shifts the lines after it, so positions alone
 * would point later suggestions at the wrong line.
 */

import { escapeHtml, htmlToBullets, isHtmlEmpty, stripHtmlTags } from '@/lib/html-utils';

import { changeOp, type AppliedEdit, type EditTarget, type ResumeEditChange } from './types';

export interface EditableExperience {
  id: string;
  bullets: string[];
  bulletsHtml: string | null;
}

export interface EditableDocument {
  headline: string | null;
  summary: string | null;
  experiences: EditableExperience[];
}

/** The parts of a stored or draft profile that edits read and write. */
export function editableDocument(profile: {
  headline?: string | null;
  summary?: string | null;
  workExperiences?: ReadonlyArray<{
    id: string;
    bullets?: string[] | null;
    bulletsHtml?: string | null;
  }> | null;
}): EditableDocument {
  return {
    headline: profile.headline ?? null,
    summary: profile.summary ?? null,
    experiences: (profile.workExperiences ?? []).map((item) => ({
      id: item.id,
      bullets: item.bullets ?? [],
      bulletsHtml: item.bulletsHtml ?? null,
    })),
  };
}

/** Visible text on one line: tags, entities, and runs of whitespace removed. */
export function plainLine(value: string | null | undefined): string {
  if (!value) return '';
  return stripHtmlTags(value.replace(/&nbsp;|&#160;|\u00a0/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Visible text with paragraph breaks kept as newlines. */
export function plainParagraphs(value: string | null | undefined): string {
  if (!value) return '';
  return stripHtmlTags(value.replace(/&nbsp;|&#160;|\u00a0/g, ' '))
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/** Whether two plain texts say the same thing, ignoring spacing and case. */
export function sameText(a: string, b: string): boolean {
  const norm = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
  return norm(a) === norm(b);
}

// ── Lines ────────────────────────────────────────────────

/**
 * Where `text` is among `lines`: the hinted position when it still reads that
 * way, otherwise the nearest matching line. Null when no line matches.
 */
export function locateLine(lines: readonly string[], text: string, hint: number): number | null {
  if (!text.trim()) return null;
  let best: number | null = null;
  lines.forEach((line, index) => {
    if (!sameText(line, text)) return;
    if (best === null || Math.abs(index - hint) < Math.abs(best - hint)) best = index;
  });
  return best;
}

/**
 * Where a new line goes: right after the line it followed, or at the hinted
 * position when that line is gone. A null anchor means first.
 */
export function insertionIndex(
  lines: readonly string[],
  anchor: string | null,
  hint: number
): number {
  if (anchor === null) return 0;
  const at = locateLine(lines, anchor, hint - 1);
  if (at !== null) return at + 1;
  return Math.min(Math.max(hint, 0), lines.length);
}

// ── Bullets ──────────────────────────────────────────────

export type ListItem = { start: number; end: number; open: string; inner: string };

const LIST_ITEM = /(<li\b[^>]*>)([\s\S]*?)<\/li>/gi;
const LIST_CLOSE = /<\/(?:ul|ol)>/gi;

/** Position of the last list closing tag, where a first item can go into an empty list. */
export function lastListClose(html: string): number | null {
  return [...html.matchAll(LIST_CLOSE)].at(-1)?.index ?? null;
}
/** How the editor wraps a bullet's text when it has no neighbour to copy. */
export const DEFAULT_BULLET_PARAGRAPH = '<p style="text-align: justify">';

/** Top-level list items in editor HTML, with their positions. */
export function findListItems(html: string): ListItem[] {
  const items: ListItem[] = [];
  for (const match of html.matchAll(LIST_ITEM)) {
    const start = match.index ?? 0;
    items.push({ start, end: start + match[0].length, open: match[1], inner: match[2] });
  }
  return items;
}

function usesHtml(experience: EditableExperience): boolean {
  return Boolean(experience.bulletsHtml && !isHtmlEmpty(experience.bulletsHtml));
}

export interface BulletView {
  /** False when the entry is a paragraph or a nested list; its text is still a fact. */
  editable: boolean;
  /** Plain text per bullet. Index matches the stored list item, empty items included. */
  lines: string[];
}

export function readBullets(experience: EditableExperience): BulletView {
  if (usesHtml(experience)) {
    const html = experience.bulletsHtml ?? '';
    const items = findListItems(html);
    const nested = items.some((item) => /<(?:ul|ol)\b/i.test(item.inner));
    if (items.length === 0 || nested) {
      return { editable: false, lines: plainParagraphs(html).split('\n').filter(Boolean) };
    }
    return { editable: true, lines: items.map((item) => plainLine(item.inner)) };
  }
  return { editable: true, lines: experience.bullets.map((bullet) => plainLine(bullet)) };
}

/** `content` in the paragraph tag `like` opens with, so alignment carries over. */
export function wrapInParagraph(like: string | null | undefined, content: string): string {
  const paragraph = like?.trim().match(/^<p\b[^>]*>/i);
  return paragraph ? `${paragraph[0]}${content}</p>` : content;
}

function innerFromText(like: string, text: string): string {
  return wrapInParagraph(like, escapeHtml(text));
}

type BulletValue = { text: string } | { raw: string };

function withHtml(experience: EditableExperience, html: string): EditableExperience {
  return { ...experience, bulletsHtml: html, bullets: htmlToBullets(html) };
}

function writeBullet(
  experience: EditableExperience,
  index: number,
  value: BulletValue
): EditableExperience | null {
  if (usesHtml(experience)) {
    const html = experience.bulletsHtml ?? '';
    const item = findListItems(html)[index];
    if (!item) return null;
    const inner = 'raw' in value ? value.raw : innerFromText(item.inner, value.text);
    return withHtml(
      experience,
      `${html.slice(0, item.start)}${item.open}${inner}</li>${html.slice(item.end)}`
    );
  }
  if (index < 0 || index >= experience.bullets.length) return null;
  const bullets = [...experience.bullets];
  bullets[index] = 'raw' in value ? value.raw : value.text;
  return { ...experience, bullets };
}

/** A new bullet at `index`, styled like the bullet it lands next to. */
function insertBullet(
  experience: EditableExperience,
  index: number,
  value: BulletValue
): EditableExperience | null {
  const html = experience.bulletsHtml ?? '';
  const items = findListItems(html);
  const listClose = lastListClose(html);
  if (items.length > 0 || listClose !== null) {
    const at = Math.min(Math.max(index, 0), items.length);
    const like = items[at] ?? items[at - 1];
    const inner =
      'raw' in value
        ? value.raw
        : innerFromText(like?.inner ?? DEFAULT_BULLET_PARAGRAPH, value.text);
    const item = `${like?.open ?? '<li>'}${inner}</li>`;
    const cut = items[at]?.start ?? items[at - 1]?.end ?? listClose ?? html.length;
    return withHtml(experience, `${html.slice(0, cut)}${item}${html.slice(cut)}`);
  }
  const bullets = [...experience.bullets];
  bullets.splice(
    Math.min(Math.max(index, 0), bullets.length),
    0,
    'raw' in value ? value.raw : value.text
  );
  return { ...experience, bullets };
}

function removeBullet(experience: EditableExperience, index: number): EditableExperience | null {
  if (usesHtml(experience)) {
    const html = experience.bulletsHtml ?? '';
    const item = findListItems(html)[index];
    if (!item) return null;
    return withHtml(experience, `${html.slice(0, item.start)}${html.slice(item.end)}`);
  }
  if (index < 0 || index >= experience.bullets.length) return null;
  return { ...experience, bullets: experience.bullets.filter((_, at) => at !== index) };
}

function bulletRaw(experience: EditableExperience, index: number): string | null {
  if (usesHtml(experience)) {
    return findListItems(experience.bulletsHtml ?? '')[index]?.inner ?? null;
  }
  return experience.bullets[index] ?? null;
}

/** The editable bullet list of one role, or null when it is gone or not a plain list. */
export function bulletLines(doc: EditableDocument, experienceId: string): string[] | null {
  const experience = doc.experiences.find((item) => item.id === experienceId);
  if (!experience) return null;
  const view = readBullets(experience);
  return view.editable ? view.lines : null;
}

/** Run `edit` on one role's bullets and put the result back. Null when it cannot apply. */
function editExperience(
  doc: EditableDocument,
  experienceId: string,
  edit: (experience: EditableExperience, lines: string[]) => EditableExperience | null
): EditableDocument | null {
  const at = doc.experiences.findIndex((item) => item.id === experienceId);
  const current = doc.experiences[at];
  if (!current) return null;
  const view = readBullets(current);
  if (!view.editable) return null;
  const updated = edit(current, view.lines);
  if (!updated) return null;
  const experiences = [...doc.experiences];
  experiences[at] = updated;
  return { ...doc, experiences };
}

// ── Summary ──────────────────────────────────────────────

/** One paragraph per line of `lines`, each in the summary's own paragraph tag. */
export function summaryParagraphs(previous: string | null, lines: readonly string[]): string {
  const paragraph = previous?.match(/<p\b[^>]*>/i)?.[0] ?? '<p>';
  return lines.map((line) => wrapInParagraph(paragraph, line)).join('');
}

function summaryHtml(previous: string | null, text: string): string {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(escapeHtml);
  return summaryParagraphs(previous, lines);
}

// ── Targets ──────────────────────────────────────────────

export function readTarget(
  doc: EditableDocument,
  target: EditTarget
): { text: string; raw: string } | null {
  if (target.kind === 'headline') {
    return { text: plainLine(doc.headline), raw: doc.headline ?? '' };
  }
  if (target.kind === 'summary') {
    return { text: plainParagraphs(doc.summary), raw: doc.summary ?? '' };
  }
  const experience = doc.experiences.find((item) => item.id === target.experienceId);
  if (!experience) return null;
  const view = readBullets(experience);
  const raw = bulletRaw(experience, target.index);
  if (!view.editable || raw == null) return null;
  return { text: view.lines[target.index] ?? '', raw };
}

/** A new document with one target replaced, or null when the target is gone. */
export function writeTarget(
  doc: EditableDocument,
  target: EditTarget,
  value: BulletValue
): EditableDocument | null {
  if (target.kind === 'headline') {
    return { ...doc, headline: 'raw' in value ? value.raw : value.text.trim() };
  }
  if (target.kind === 'summary') {
    return { ...doc, summary: 'raw' in value ? value.raw : summaryHtml(doc.summary, value.text) };
  }
  return editExperience(doc, target.experienceId, (experience) =>
    writeBullet(experience, target.index, value)
  );
}

/**
 * Where an open suggestion sits in `doc` right now: the line it rewrites or
 * removes, or the slot a new line would take. Null when its line is gone or
 * reads differently. The preview and apply share this, so what is marked is
 * what gets written.
 */
export function locateProposal(
  doc: EditableDocument,
  change: Pick<ResumeEditChange, 'op' | 'target' | 'before' | 'anchor'>
): { index: number; lines: string[] } | { index: null; lines: null } | null {
  const { target } = change;
  if (target.kind !== 'bullet') {
    const current = readTarget(doc, target);
    return current && sameText(current.text, change.before) ? { index: null, lines: null } : null;
  }
  const lines = bulletLines(doc, target.experienceId);
  if (!lines) return null;
  if (changeOp(change) === 'insert') {
    return { index: insertionIndex(lines, change.anchor ?? null, target.index), lines };
  }
  const index = locateLine(lines, change.before, target.index);
  return index === null ? null : { index, lines };
}

// ── Apply / revert plans ─────────────────────────────────

export type ChangeOutcome = 'applied' | 'conflicted' | 'reverted' | 'kept';

export interface EditPlan {
  doc: EditableDocument;
  changes: ResumeEditChange[];
  outcomes: Record<string, ChangeOutcome>;
}

type Step = { doc: EditableDocument; applied: AppliedEdit } | null;

function applyOne(doc: EditableDocument, change: ResumeEditChange, text: string, at: string): Step {
  const place = locateProposal(doc, change);
  if (!place) return null;
  const { target } = change;

  if (place.index === null || target.kind !== 'bullet') {
    const current = readTarget(doc, target);
    const written = current ? writeTarget(doc, target, { text }) : null;
    return current && written
      ? { doc: written, applied: { previousRaw: current.raw, text, at } }
      : null;
  }

  const index = place.index;
  const anchor = place.lines[index - 1] ?? null;
  const op = changeOp(change);
  let previousRaw = '';
  const written = editExperience(doc, target.experienceId, (experience) => {
    if (op === 'insert') return insertBullet(experience, index, { text });
    previousRaw = bulletRaw(experience, index) ?? '';
    return op === 'delete'
      ? removeBullet(experience, index)
      : writeBullet(experience, index, { text });
  });
  if (!written) return null;
  if (op === 'rewrite') return { doc: written, applied: { previousRaw, text, at } };
  return {
    doc: written,
    applied: { previousRaw, text: op === 'delete' ? '' : text, at, index, anchor },
  };
}

function revertOne(doc: EditableDocument, change: ResumeEditChange, applied: AppliedEdit) {
  const { target } = change;
  if (target.kind !== 'bullet') {
    const current = readTarget(doc, target);
    return current && sameText(current.text, applied.text)
      ? writeTarget(doc, target, { raw: applied.previousRaw })
      : null;
  }
  const op = changeOp(change);
  const hint = applied.index ?? target.index;
  return editExperience(doc, target.experienceId, (experience, lines) => {
    if (op === 'delete') {
      const index = insertionIndex(lines, applied.anchor ?? null, hint);
      return insertBullet(experience, index, { raw: applied.previousRaw });
    }
    const index = locateLine(lines, applied.text, hint);
    if (index === null) return null;
    return op === 'insert'
      ? removeBullet(experience, index)
      : writeBullet(experience, index, { raw: applied.previousRaw });
  });
}

/**
 * Apply chosen changes in order. A change whose line no longer reads the way
 * it did when suggested is marked conflicted and left alone.
 */
export function planApply(
  doc: EditableDocument,
  changes: ResumeEditChange[],
  chosen: Map<string, string>,
  now: Date
): EditPlan {
  let next = doc;
  const outcomes: Record<string, ChangeOutcome> = {};
  const updated = changes.map((change) => {
    const text = chosen.get(change.id);
    if (text == null || change.status !== 'proposed') return change;
    const step = applyOne(next, change, text, now.toISOString());
    if (!step) {
      outcomes[change.id] = 'conflicted';
      return { ...change, status: 'conflicted' as const };
    }
    next = step.doc;
    outcomes[change.id] = 'applied';
    return { ...change, status: 'applied' as const, applied: step.applied };
  });
  return { doc: next, changes: updated, outcomes };
}

/**
 * Put back what applied changes replaced. A line edited since then is kept
 * as the user left it, so undo never overwrites their own work.
 */
export function planRevert(
  doc: EditableDocument,
  changes: ResumeEditChange[],
  ids: Set<string> | null
): EditPlan {
  let next = doc;
  const outcomes: Record<string, ChangeOutcome> = {};
  const updated = changes.map((change) => {
    if (change.status !== 'applied' || !change.applied) return change;
    if (ids && !ids.has(change.id)) return change;
    const written = revertOne(next, change, change.applied);
    if (!written) {
      outcomes[change.id] = 'kept';
      return change;
    }
    next = written;
    outcomes[change.id] = 'reverted';
    return { ...change, status: 'reverted' as const };
  });
  return { doc: next, changes: updated, outcomes };
}
