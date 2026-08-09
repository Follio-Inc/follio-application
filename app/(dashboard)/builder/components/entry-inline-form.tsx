'use client';

import { Loader2, Trash2, X } from 'lucide-react';
import type { ReactNode, Ref } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EntryInlineFormProps {
  /** e.g. "Editing experience — save or discard to continue" */
  banner: string;
  error?: string | null;
  children: ReactNode;
  onSave: () => void | Promise<void>;
  onDiscard: () => void;
  canSave: boolean;
  isSaving: boolean;
  actionsRef?: Ref<HTMLDivElement>;
  attentionKey?: number;
  /** When set, shows a Delete action in the footer. */
  onDelete?: () => void | Promise<void>;
  size?: 'default' | 'sm';
}

/**
 * Shared chrome for focused entry editors: banner, error, fields, Save/Discard.
 * Attention state (from Back with unsaved changes) lives here once.
 */
export function EntryInlineForm({
  banner,
  error,
  children,
  onSave,
  onDiscard,
  canSave,
  isSaving,
  actionsRef,
  attentionKey = 0,
  onDelete,
  size = 'sm',
}: EntryInlineFormProps) {
  const needsAttention = attentionKey > 0;

  return (
    <div className="space-y-4 rounded-xl bg-background p-4">
      <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-xs font-medium text-primary">
        <div className="h-1.5 w-1.5 rounded-full bg-primary" />
        {banner}
      </div>

      {error ? (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      ) : null}

      {children}

      <div
        ref={actionsRef}
        data-entry-form-actions
        className={cn(
          'scroll-mt-24 transition-[padding,background-color,border-color,box-shadow] duration-500 ease-out',
          needsAttention
            ? 'rounded-xl border border-primary/15 bg-gradient-to-b from-primary/[0.06] to-transparent p-3.5 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.04)]'
            : 'pt-4'
        )}
      >
        {needsAttention ? (
          <div
            role="status"
            aria-live="polite"
            className="animate-save-attention-copy mb-3.5 flex items-start gap-2.5"
          >
            <span
              aria-hidden
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70 shadow-[0_0_0_3px_hsl(var(--primary)/0.12)]"
            />
            <div className="min-w-0 space-y-0.5">
              <p className="text-[13px] font-medium leading-snug tracking-tight text-foreground">
                Unsaved changes
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Save to keep them, or discard to leave this entry.
              </p>
            </div>
          </div>
        ) : null}

        <div className={cn('flex items-center', needsAttention ? 'gap-3' : 'gap-2')}>
          <Button
            type="button"
            onClick={() => void onSave()}
            disabled={!canSave || isSaving}
            size={size}
            className="gap-2"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size={size}
            onClick={onDiscard}
            disabled={isSaving}
            className="gap-2"
          >
            <X className="h-4 w-4" />
            Discard
          </Button>
          {onDelete ? (
            <Button
              type="button"
              variant="ghost"
              size={size}
              onClick={() => void onDelete()}
              disabled={isSaving}
              className="ml-auto gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
