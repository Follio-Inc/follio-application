'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface DashboardDocumentsToolbarProps {
  /**
   * When true, the section title is omitted — the parent owns that chrome
   * (e.g. dashboard documents tabs). Create actions stay right-aligned.
   */
  embedded?: boolean;
  title: string;
  count?: number;
  /** Optional secondary actions (e.g. View all) before the create control. */
  secondaryActions?: ReactNode;
  /** Primary create control — always right-aligned. */
  createAction: ReactNode;
}

/**
 * Shared documents section toolbar.
 * Embedded: create action flush right. Standalone: title + count left, actions right.
 */
export function DashboardDocumentsToolbar({
  embedded = false,
  title,
  count,
  secondaryActions,
  createAction,
}: DashboardDocumentsToolbarProps) {
  return (
    <div className={cn('flex items-center gap-3', embedded ? 'justify-end' : 'justify-between')}>
      {!embedded ? (
        <div className="flex min-w-0 items-center gap-2.5">
          <h2 className="text-section-title">{title}</h2>
          {typeof count === 'number' ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums leading-none text-muted-foreground">
              {count}
            </span>
          ) : null}
        </div>
      ) : (
        <span className="sr-only">{title}</span>
      )}
      <div className="flex shrink-0 items-center gap-1.5">
        {secondaryActions}
        {createAction}
      </div>
    </div>
  );
}
