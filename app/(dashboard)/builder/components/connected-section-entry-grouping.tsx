'use client';

import { useCallback } from 'react';

import {
  persistSectionEntryGrouping,
  serializeEntryGrouping,
} from '@/components/section-entry-grouping/entry-grouping-control';
import type { EntryGroupingMode } from '@/lib/section-entry-grouping';
import type { ProfileSection } from '@/types';

import { useBuilderStore } from './builder-store-provider';

export function usePersistSectionEntryGrouping() {
  const commitInlineChange = useBuilderStore((state) => state.commitInlineChange);
  const sections = useBuilderStore((state) => state.draftProfile.sections);

  return useCallback(
    (sectionId: string, mode: EntryGroupingMode) => {
      const current = sections || [];
      const stored = serializeEntryGrouping(mode);
      commitInlineChange({
        sections: current.map((item) =>
          item.id === sectionId
            ? { ...item, entryGrouping: stored as ProfileSection['entryGrouping'] }
            : item
        ),
      });
      void persistSectionEntryGrouping(sectionId, stored).catch(() => {
        commitInlineChange({ sections: current });
      });
    },
    [commitInlineChange, sections]
  );
}
