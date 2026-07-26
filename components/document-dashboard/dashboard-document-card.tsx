'use client';

import type { ReactNode } from 'react';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type DashboardDocumentCardAccent = 'default' | 'public';

interface DashboardDocumentCardProps {
  /** Thumbnail region (include clickable wrapper when needed). */
  thumbnail: ReactNode;
  /** Title block (title + optional subtitle / rename input). */
  title: ReactNode;
  /** Overflow menu — typically hover-reveal on the card. */
  menu?: ReactNode;
  /** Visibility + timestamp row. */
  meta?: ReactNode;
  /** Edit / View (or document-specific) primary actions. */
  primaryActions: ReactNode;
  /**
   * `carousel` matches dashboard resume/cover-letter scroller cards (260px).
   * `fluid` fills a grid cell (e.g. full resumes page).
   */
  width?: 'carousel' | 'fluid';
  /** Public resume emerald border treatment. */
  accent?: DashboardDocumentCardAccent;
  className?: string;
}

/**
 * Shared dashboard document card chrome for resumes and cover letters.
 *
 * Thumbnail on top → title/menu → visibility meta → primary actions.
 * Document-specific menus and handlers stay in the section components.
 */
export function DashboardDocumentCard({
  thumbnail,
  title,
  menu,
  meta,
  primaryActions,
  width = 'carousel',
  accent = 'default',
  className,
}: DashboardDocumentCardProps) {
  return (
    <Card
      className={cn(
        'group relative flex flex-col overflow-hidden transition-all duration-200 hover:shadow-md',
        width === 'carousel' && 'w-[260px] shrink-0',
        accent === 'public'
          ? 'border-emerald-500/25 hover:border-emerald-500/35'
          : 'hover:border-border',
        className
      )}
    >
      {thumbnail}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">{title}</div>
          {menu}
        </div>
        {meta}
        <div className="flex items-center gap-2">{primaryActions}</div>
      </div>
    </Card>
  );
}

/** Clickable thumbnail wrapper — avoids nested <button> with Retry inside the thumbnail. */
export function DashboardDocumentThumbnailButton({
  label,
  disabled,
  onOpen,
  children,
}: {
  label: string;
  disabled?: boolean;
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={label}
      className="relative block w-full cursor-pointer border-b border-border/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-disabled:cursor-not-allowed"
      onClick={() => {
        if (disabled) return;
        onOpen();
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      {children}
    </div>
  );
}
