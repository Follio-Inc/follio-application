'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { formatEntryDuration } from '@/lib/entry-duration';
import { cn } from '@/lib/utils';

interface EntryDurationFieldProps {
  startDate: Date | string | null | undefined;
  endDate: Date | string | null | undefined;
  isCurrent?: boolean | null;
  visible?: boolean | null;
  onVisibleChange: (visible: boolean) => void;
}

export function EntryDurationField({
  startDate,
  endDate,
  isCurrent,
  visible,
  onVisibleChange,
}: EntryDurationFieldProps) {
  const duration = useMemo(
    () => formatEntryDuration(startDate, endDate, isCurrent),
    [startDate, endDate, isCurrent]
  );
  const isVisible = visible === true;
  const canToggle = Boolean(duration);

  return (
    <div className="space-y-1">
      <div className="inline-flex max-w-full items-center gap-1.5">
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          Duration
        </span>
        <span
          className={cn(
            'flex h-7 items-center rounded-md bg-muted/60 px-2.5 text-sm font-medium tabular-nums',
            (!canToggle || !isVisible) && 'opacity-50'
          )}
        >
          {duration ?? '—'}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => onVisibleChange(!isVisible)}
          disabled={!canToggle}
          title={
            !canToggle
              ? 'Add dates to calculate duration'
              : isVisible
                ? 'Hide from resume'
                : 'Show on resume (not recommended)'
          }
          aria-label={
            !canToggle
              ? 'Duration unavailable until dates are set'
              : isVisible
                ? 'Hide duration from resume'
                : 'Show duration on resume'
          }
          aria-pressed={isVisible}
        >
          {isVisible ? (
            <Eye className="h-4 w-4" />
          ) : (
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Subheading tag, hidden by default. Not recommended on a resume — the dates already show the
        range.
      </p>
    </div>
  );
}
