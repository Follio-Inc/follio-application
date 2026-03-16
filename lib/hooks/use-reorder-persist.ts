'use client';

import { useCallback, useRef } from 'react';

import { notifyProfileUpdated } from '@/lib/events';

/**
 * Reorderable model names accepted by `PATCH /api/profile/reorder`.
 */
export type ReorderableModel =
  | 'education'
  | 'workExperience'
  | 'project'
  | 'certification'
  | 'award'
  | 'link'
  | 'skill'
  | 'skillGroup'
  | 'photo';

/**
 * Hook that persists `sortOrder` changes to the backend for Prisma-backed models.
 *
 * Returns a callback `persistOrder(items)` that the caller should invoke
 * whenever the order changes (drag-and-drop or sort-by-date).
 *
 * Debounces rapid consecutive calls (e.g. multiple drags in quick succession)
 * to avoid hammering the API.
 */
export function useReorderPersist<T extends { id: string }>(
  model: ReorderableModel,
  onUpdate: (items: T[]) => void
) {
  const abortRef = useRef<AbortController | null>(null);

  const persistOrder = useCallback(
    async (items: T[]) => {
      // Optimistic: update the parent state immediately
      onUpdate(items);

      // Abort any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch('/api/profile/reorder', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            items: items.map((item, index) => ({
              id: item.id,
              sortOrder: index,
            })),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          console.error('Failed to persist reorder:', await response.text());
        } else {
          notifyProfileUpdated();
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          // Expected when a newer request supersedes this one
          return;
        }
        console.error('Failed to persist reorder:', err);
      }
    },
    [model, onUpdate]
  );

  return persistOrder;
}
