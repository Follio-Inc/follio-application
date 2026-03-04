'use client';

import { useCallback, useRef } from 'react';

import { notifyProfileUpdated } from '@/lib/events';
import type { ProfileSection } from '@/types';

/**
 * Hook that persists section sortOrder changes to the backend via
 * `PATCH /api/profile/sections`.
 *
 * Returns a callback `persistOrder(sections)` that the caller should invoke
 * whenever section order changes (drag-and-drop).
 *
 * Aborts any in-flight request if a newer reorder comes in.
 */
export function useSectionReorderPersist(onUpdate: (sections: ProfileSection[]) => void) {
  const abortRef = useRef<AbortController | null>(null);

  const persistOrder = useCallback(
    async (sections: ProfileSection[]) => {
      // Optimistic: update the parent state immediately
      onUpdate(sections);

      // Abort any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch('/api/profile/sections', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sections: sections.map((s, index) => ({
              id: s.id,
              sortOrder: index,
            })),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          console.error('Failed to persist section reorder:', await response.text());
        } else {
          notifyProfileUpdated();
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        console.error('Failed to persist section reorder:', err);
      }
    },
    [onUpdate]
  );

  return persistOrder;
}
