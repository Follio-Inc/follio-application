'use client';

import { ResumeSwitcher } from './resume-switcher';
import { useBuilderStore } from './builder-store-provider';
import { hasContactDraftChanges, hasProfileChanges } from '@/lib/stores/builder-store';
import { cn } from '@/lib/utils';

/**
 * Sticky header for the content editor column.
 * Mirrors the Preview / Design panel headers and surfaces resume switching
 * plus unsaved-change feedback where users are actually editing.
 */
export function BuilderContentHeader() {
  const draftProfile = useBuilderStore((s) => s.draftProfile);
  const savedProfile = useBuilderStore((s) => s.savedProfile);
  const contactDraft = useBuilderStore((s) => s.contactDraft);
  const savedContact = useBuilderStore((s) => s.savedContact);
  const isSaving = useBuilderStore((s) => s.isSaving);

  const hasUnsaved =
    hasProfileChanges(draftProfile, savedProfile) ||
    hasContactDraftChanges(contactDraft, savedContact);

  return (
    <div className="sticky top-0 z-20 flex h-12 shrink-0 items-center justify-between border-b border-border/60 bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6">
      <span className="text-eyebrow">Content</span>
      <div className="flex items-center gap-3">
        {(hasUnsaved || isSaving) && (
          <>
            <span
              className={cn(
                'hidden text-[11px] font-medium sm:inline',
                isSaving ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-500'
              )}
              role="status"
              aria-live="polite"
            >
              {isSaving ? 'Saving…' : 'Unsaved changes'}
            </span>
            <span
              className={cn(
                'h-2 w-2 shrink-0 rounded-full sm:hidden',
                isSaving ? 'bg-muted-foreground/50' : 'bg-amber-500'
              )}
              aria-hidden
            />
          </>
        )}
        <ResumeSwitcher />
      </div>
    </div>
  );
}
