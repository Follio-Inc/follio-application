'use client';

import { Sparkles, X } from 'lucide-react';

import { useBuilderStore } from './builder-store-provider';
import { hasContactDraftChanges, hasProfileChanges } from '@/lib/stores/builder-store';
import { cn } from '@/lib/utils';

interface BuilderContentHeaderProps {
  aiOpen?: boolean;
  onToggleAi?: () => void;
}

/**
 * Sticky header for the content editor column.
 * Mirrors the Preview / Design panel headers and surfaces unsaved-change
 * feedback where users are actually editing.
 */
export function BuilderContentHeader({ aiOpen = false, onToggleAi }: BuilderContentHeaderProps) {
  const draftProfile = useBuilderStore((s) => s.draftProfile);
  const savedProfile = useBuilderStore((s) => s.savedProfile);
  const contactDraft = useBuilderStore((s) => s.contactDraft);
  const savedContact = useBuilderStore((s) => s.savedContact);
  const isSaving = useBuilderStore((s) => s.isSaving);
  const isInlineEditing = useBuilderStore((s) => s.isInlineEditing);

  const hasUnsaved =
    hasProfileChanges(draftProfile, savedProfile) ||
    hasContactDraftChanges(contactDraft, savedContact);

  return (
    <div className="sticky top-0 z-20 flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border/20 bg-background/95 px-5 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-8">
      <span className="text-eyebrow">{aiOpen ? 'Edit with AI' : 'Content'}</span>
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
        {onToggleAi && (
          <button
            type="button"
            onClick={onToggleAi}
            disabled={isInlineEditing && !aiOpen}
            title={isInlineEditing && !aiOpen ? 'Save or cancel the open entry first' : undefined}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50',
              aiOpen
                ? 'border-border bg-background hover:bg-muted'
                : 'border-primary/40 bg-primary/10 text-foreground hover:bg-primary/15'
            )}
          >
            {aiOpen ? (
              <X className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
            )}
            {aiOpen ? 'Back to editor' : 'Edit with AI'}
          </button>
        )}
      </div>
    </div>
  );
}
