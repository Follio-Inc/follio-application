import type { ReactNode } from 'react';

import { orgGroupHeaderLabel, type ConsecutiveOrgGroup } from '@/lib/section-entry-grouping';
import { cn } from '@/lib/utils';

export function ContentOrgGroup({
  orgName,
  location,
  locationShared,
  children,
  className,
}: {
  orgName: string;
  location?: string | null;
  locationShared?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const label = orgGroupHeaderLabel(orgName, locationShared ? location : null);

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-1.5 px-0.5">
        <span className="h-3 w-px rounded-full bg-foreground/25" aria-hidden />
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground">{label}</p>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export function ContentOrgGroupFrom<T extends { id: string }>({
  group,
  children,
}: {
  group: ConsecutiveOrgGroup<T>;
  children: ReactNode;
}) {
  if (!group.grouped) return <>{children}</>;
  return (
    <ContentOrgGroup
      orgName={group.orgName}
      location={group.location}
      locationShared={group.locationShared}
    >
      {children}
    </ContentOrgGroup>
  );
}
