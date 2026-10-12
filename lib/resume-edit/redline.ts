/**
 * Draws open AI suggestions into the resume itself. Pure, so the builder
 * preview and the tests read the same result.
 *
 * - A rewritten line is marked as a whole in a neutral marker, with the words
 *   it adds in green. Words it drops are not shown.
 * - A new bullet is green as a whole.
 * - A removed bullet is light red and struck through.
 *
 * Lines are found with locateProposal, the same lookup Keep uses, so a mark
 * always sits on the line Keep would change. A suggestion whose line reads
 * differently now cannot be placed; it stays reviewable in the panel.
 */

import { escapeHtml } from '@/lib/html-utils';

import {
  DEFAULT_BULLET_PARAGRAPH,
  findListItems,
  lastListClose,
  locateProposal,
  summaryParagraphs,
  wrapInParagraph,
  type EditableDocument,
  type ListItem,
} from './document';
import { isOpenChange, textFor } from './review';
import { changeOp, EDIT_PLACEHOLDER, type ResumeEditChange } from './types';
import { diffSide, diffWords } from './word-diff';

export type RedlineKind = 'modified' | 'added' | 'removed';

/** Attribute on every marked element. Its value is the change id. */
export const REDLINE_ID_ATTR = 'data-edit-id';
export const REDLINE_KIND_ATTR = 'data-edit-kind';

export interface RedlineMark {
  id: string;
  kind: RedlineKind;
  /**
   * Escaped HTML, safe to inject. Inline content for the headline and bullets;
   * whole paragraphs for the summary.
   */
  html: string;
}

export interface RoleRedline {
  /** Existing bullets to mark, by position in the stored list. */
  lines: Map<number, RedlineMark>;
  /** New bullets, by the position they would take. */
  inserts: Map<number, RedlineMark[]>;
}

export interface ResumeRedline {
  headline: RedlineMark | null;
  summary: RedlineMark | null;
  roles: Map<string, RoleRedline>;
  /** Open suggestions drawn into the resume. */
  placed: string[];
  /** Open suggestions whose line has changed since; only the panel shows them. */
  unplaced: string[];
}

// ── Inline marks ─────────────────────────────────────────

function textHtml(text: string): string {
  return text
    .split(EDIT_PLACEHOLDER)
    .map(escapeHtml)
    .join(`<span class="redline-blank">${EDIT_PLACEHOLDER}</span>`);
}

function modifiedHtml(before: string, after: string): string {
  const inner = diffSide(diffWords(before, after), 'after')
    .map((part) =>
      part.kind === 'added'
        ? `<ins class="redline-ins">${textHtml(part.text)}</ins>`
        : textHtml(part.text)
    )
    .join('');
  return `<mark class="redline redline--modified">${inner}</mark>`;
}

function addedHtml(text: string): string {
  return `<ins class="redline redline--added">${textHtml(text)}</ins>`;
}

function removedHtml(text: string): string {
  return `<del class="redline redline--removed">${textHtml(text)}</del>`;
}

/** The summary's paragraph tag reduced to its alignment; stored HTML is not sanitized yet. */
function paragraphTag(summary: string | null): string | null {
  const align = summary?.match(
    /<p\b[^>]*\bstyle="[^"]*text-align:\s*(left|right|center|justify)/i
  )?.[1];
  return align ? `<p style="text-align: ${align.toLowerCase()}">` : null;
}

/** Rewritten summary: each paragraph diffed against the one it replaces. */
function summaryHtml(previous: string | null, before: string, after: string): string {
  const old = before.split('\n');
  const lines = after
    .split('\n')
    .filter((line) => line.trim())
    .map((line, index) => modifiedHtml(old[index] ?? '', line));
  return summaryParagraphs(paragraphTag(previous), lines);
}

// ── Building ─────────────────────────────────────────────

function roleFor(redline: ResumeRedline, experienceId: string): RoleRedline {
  let role = redline.roles.get(experienceId);
  if (!role) {
    role = { lines: new Map(), inserts: new Map() };
    redline.roles.set(experienceId, role);
  }
  return role;
}

/** Marks for every open suggestion in `changes`, placed against `doc` as it reads now. */
export function buildRedline(
  doc: EditableDocument,
  changes: readonly ResumeEditChange[],
  review: { texts: Record<string, string>; skipped: ReadonlySet<string> }
): ResumeRedline {
  const redline: ResumeRedline = {
    headline: null,
    summary: null,
    roles: new Map(),
    placed: [],
    unplaced: [],
  };

  for (const change of changes) {
    if (!isOpenChange(change, review.skipped)) continue;
    const place = locateProposal(doc, change);
    const text = textFor(change, review.texts);
    const { id, target } = change;

    if (place && target.kind === 'headline') {
      redline.headline = { id, kind: 'modified', html: modifiedHtml(change.before, text) };
    } else if (place && target.kind === 'summary') {
      redline.summary = {
        id,
        kind: 'modified',
        html: summaryHtml(doc.summary, change.before, text),
      };
    } else if (place?.index != null && target.kind === 'bullet') {
      const role = roleFor(redline, target.experienceId);
      const current = place.lines[place.index] ?? change.before;
      const op = changeOp(change);
      if (op === 'insert') {
        const slot = role.inserts.get(place.index) ?? [];
        role.inserts.set(place.index, [...slot, { id, kind: 'added', html: addedHtml(text) }]);
      } else if (role.lines.has(place.index)) {
        redline.unplaced.push(id);
        continue;
      } else {
        role.lines.set(
          place.index,
          op === 'delete'
            ? { id, kind: 'removed', html: removedHtml(current) }
            : { id, kind: 'modified', html: modifiedHtml(current, text) }
        );
      }
    } else {
      redline.unplaced.push(id);
      continue;
    }
    redline.placed.push(id);
  }
  return redline;
}

// ── Drawing into markup ──────────────────────────────────

function markAttrs(mark: RedlineMark): string {
  return ` ${REDLINE_ID_ATTR}="${escapeHtml(mark.id)}" ${REDLINE_KIND_ATTR}="${mark.kind}"`;
}

/** Data attributes for a marked element rendered by React. */
export function redlineDataProps(mark: RedlineMark): Record<string, string> {
  return { [REDLINE_ID_ATTR]: mark.id, [REDLINE_KIND_ATTR]: mark.kind };
}

function markedItem(mark: RedlineMark, like: ListItem | undefined): string {
  const open = (like?.open ?? '<li>').replace(/>$/, `${markAttrs(mark)}>`);
  return `${open}${wrapInParagraph(like?.inner ?? DEFAULT_BULLET_PARAGRAPH, mark.html)}</li>`;
}

/**
 * A role's body markup with its marks drawn in. `markup` is the sanitized
 * list the resume renders; list items line up with the stored bullets.
 */
export function redlineListHtml(markup: string, role: RoleRedline): string {
  const items = findListItems(markup);
  const insertsAt = (slot: number, like: ListItem | undefined) =>
    (role.inserts.get(slot) ?? []).map((mark) => markedItem(mark, like)).join('');

  if (items.length === 0) {
    const added = insertsAt(0, undefined);
    if (!added) return markup;
    const close = lastListClose(markup);
    return close === null
      ? `${markup}<ul class="resume-bullets">${added}</ul>`
      : `${markup.slice(0, close)}${added}${markup.slice(close)}`;
  }

  let out = '';
  let cursor = 0;
  items.forEach((item, index) => {
    out += markup.slice(cursor, item.start) + insertsAt(index, item);
    const mark = role.lines.get(index);
    out += mark ? markedItem(mark, item) : markup.slice(item.start, item.end);
    cursor = item.end;
  });
  return out + insertsAt(items.length, items.at(-1)) + markup.slice(cursor);
}
