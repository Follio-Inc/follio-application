'use client';

import { useCallback } from 'react';

import { useBuilderPane } from '@/components/document-builder/document-builder-shell';
import { openBuilderSide } from '@/lib/document-builder';

/** DOM id of a suggestion's card in the AI panel. */
export function changeCardDomId(changeId: string): string {
  return `ai-edit-change-${changeId}`;
}

function revealCard(changeId: string): boolean {
  const card = document.getElementById(changeCardDomId(changeId));
  if (!card) return false;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  card.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  const field = card.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled])');
  (field ?? card).focus({ preventScroll: true });
  card.classList.remove('animate-save-attention');
  void card.offsetWidth;
  card.classList.add('animate-save-attention');
  return true;
}

/**
 * Scroll a suggestion's card into view and focus it (its first blank, when it
 * has one). Opens the content side first, in case only the resume is showing.
 */
export function useRevealChange(): (changeId: string) => void {
  const pane = useBuilderPane();
  return useCallback(
    (changeId: string) => {
      pane?.setMode((mode) => openBuilderSide(mode, 'content'));
      window.requestAnimationFrame(() => revealCard(changeId));
    },
    [pane]
  );
}
