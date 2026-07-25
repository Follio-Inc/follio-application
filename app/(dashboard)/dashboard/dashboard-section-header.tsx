import type { ReactNode } from 'react';

/**
 * Shared section chrome for the dashboard.
 * Keeps Portfolio / Resumes / Cover letters visually peer-level.
 */
export function DashboardSectionHeader({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <h2 className="text-section-title">{title}</h2>
        {count !== undefined && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums leading-none text-muted-foreground">
            {count}
          </span>
        )}
      </div>
      {children ? <div className="flex shrink-0 items-center gap-1">{children}</div> : null}
    </div>
  );
}
