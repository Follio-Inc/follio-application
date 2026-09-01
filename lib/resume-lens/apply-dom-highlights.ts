/**
 * Apply / clear recruiter-lens marks inside a rendered resume.
 * Viewer-only: mutates DOM under `.resume-paper`, never the React tree.
 */

import { findNonOverlappingRanges } from './highlight';
import type { LensPhrase } from './types';

export const LENS_MARK_CLASS = 'resume-lens-mark';

const SKIP_CLOSEST =
  'a, button, [data-resume-lens-ignore], .resume-contact-line, .resume-name, .resume-actions, .resume-lens-ui, .resume-paged-measure';

function paperRoots(host: HTMLElement): HTMLElement[] {
  const papers = [...host.querySelectorAll<HTMLElement>('.resume-paper')];
  return papers.filter((paper) => !paper.closest('.resume-paged-measure'));
}

function shouldSkipTextNode(node: Text): boolean {
  const parent = node.parentElement;
  if (!parent) return true;
  if (parent.closest(`mark.${LENS_MARK_CLASS}`)) return true;
  if (parent.closest(SKIP_CLOSEST)) return true;
  const tag = parent.tagName;
  if (
    tag === 'SCRIPT' ||
    tag === 'STYLE' ||
    tag === 'NOSCRIPT' ||
    tag === 'TEXTAREA' ||
    tag === 'SVG'
  ) {
    return true;
  }
  if (!node.nodeValue || !node.nodeValue.trim()) return true;
  return false;
}

function collectTextNodes(root: HTMLElement): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    if (current instanceof Text && !shouldSkipTextNode(current)) {
      nodes.push(current);
    }
    current = walker.nextNode();
  }
  return nodes;
}

function wrapTextNode(
  node: Text,
  phrases: Array<{ id: string; phrase: string }>,
  labels: Map<string, string>
): void {
  const text = node.data;
  const ranges = findNonOverlappingRanges(text, phrases);
  if (ranges.length === 0) return;

  const parent = node.parentNode;
  if (!parent) return;

  const fragment = document.createDocumentFragment();
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      fragment.appendChild(document.createTextNode(text.slice(cursor, range.start)));
    }
    const mark = document.createElement('mark');
    mark.className = LENS_MARK_CLASS;
    mark.dataset.lensId = range.phraseId;
    mark.tabIndex = 0;
    const label = labels.get(range.phraseId);
    if (label) mark.setAttribute('aria-label', label);
    mark.textContent = text.slice(range.start, range.end);
    fragment.appendChild(mark);
    cursor = range.end;
  }
  if (cursor < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(cursor)));
  }
  parent.replaceChild(fragment, node);
}

export function clearResumeLensMarks(host: HTMLElement): void {
  for (const paper of paperRoots(host)) {
    const marks = [...paper.querySelectorAll(`mark.${LENS_MARK_CLASS}`)];
    for (const mark of marks) {
      const parent = mark.parentNode;
      if (!parent) continue;
      parent.replaceChild(document.createTextNode(mark.textContent ?? ''), mark);
      parent.normalize();
    }
  }
}

export function applyResumeLensMarks(host: HTMLElement, phrases: LensPhrase[]): void {
  clearResumeLensMarks(host);
  if (phrases.length === 0) return;

  const specs = phrases.map((p) => ({ id: p.id, phrase: p.phrase }));
  const labels = new Map(
    phrases.map((p) => {
      const count = p.occurrences.length;
      const where =
        count === 0
          ? 'on this resume'
          : count === 1
            ? (p.occurrences[0]?.label ?? 'on this resume')
            : `${count} places`;
      return [p.id, `${p.phrase}. ${where}.`] as const;
    })
  );

  for (const paper of paperRoots(host)) {
    for (const node of collectTextNodes(paper)) {
      wrapTextNode(node, specs, labels);
    }
  }
}
