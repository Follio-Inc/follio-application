'use client';

import { useCallback } from 'react';

import { persistSectionSubHeadings } from '@/components/section-subheadings/section-subheadings-editor';
import type { SectionSubHeadings } from '@/lib/section-subheadings';
import type { ProfileSection } from '@/types';

import { useBuilderStore } from './builder-store-provider';

export function usePersistSectionSubHeadings() {
  const commitInlineChange = useBuilderStore((state) => state.commitInlineChange);
  const sections = useBuilderStore((state) => state.draftProfile.sections);

  return useCallback(
    (sectionId: string, next: SectionSubHeadings | null) => {
      const current = sections || [];
      commitInlineChange({
        sections: current.map((item) =>
          item.id === sectionId
            ? { ...item, subHeadings: next as ProfileSection['subHeadings'] }
            : item
        ),
      });
      void persistSectionSubHeadings(sectionId, next).catch(() => {
        commitInlineChange({ sections: current });
      });
    },
    [commitInlineChange, sections]
  );
}
