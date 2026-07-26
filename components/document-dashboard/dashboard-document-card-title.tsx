'use client';

import type { ReactNode } from 'react';

interface DashboardDocumentCardTitleProps {
  title: ReactNode;
  subtitle?: ReactNode;
}

/**
 * Shared card title block — one style for resume and cover letter names.
 */
export function DashboardDocumentCardTitle({ title, subtitle }: DashboardDocumentCardTitleProps) {
  return (
    <>
      {typeof title === 'string' ? (
        <h3 className="truncate text-sm font-semibold leading-tight text-foreground">{title}</h3>
      ) : (
        title
      )}
      {subtitle ? (
        typeof subtitle === 'string' ? (
          <p className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</p>
        ) : (
          subtitle
        )
      ) : null}
    </>
  );
}
