'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface DashboardDocumentsEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action: ReactNode;
}

/**
 * Shared dashed empty state for dashboard document lists.
 */
export function DashboardDocumentsEmptyState({
  icon: Icon,
  title,
  description,
  action,
}: DashboardDocumentsEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/10 px-6 py-14 text-center">
      <Icon className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
      <p className="mt-4 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      <div className="mt-5">{action}</div>
    </div>
  );
}
