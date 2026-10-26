import type { ReactNode } from 'react';

import { groupEntriesBySubheadings, hasLabeledSubheadingGroups } from '@/lib/section-subheadings';
import { cn } from '@/lib/utils';

export function ResumeSubheading({ children }: { children: ReactNode }) {
  return <p className="resume-subheading">{children}</p>;
}

export function ResumeEntryGroups<T extends { id: string }>({
  items,
  subHeadings,
  compact,
  children,
}: {
  items: T[];
  subHeadings?: unknown;
  compact?: boolean;
  children: (item: T) => ReactNode;
}) {
  const groups = groupEntriesBySubheadings(items, subHeadings);
  const labeled = hasLabeledSubheadingGroups(groups);

  if (!labeled) {
    return (
      <div className={cn('resume-entries', compact && 'resume-entries-compact')}>
        {items.map(children)}
      </div>
    );
  }

  return (
    <>
      {groups.map((group) => (
        <div
          key={group.id}
          className={cn('resume-entry-group', compact && 'resume-entry-group-compact')}
        >
          {group.label ? <ResumeSubheading>{group.label}</ResumeSubheading> : null}
          <div className={cn('resume-entries', compact && 'resume-entries-compact')}>
            {group.entries.map(children)}
          </div>
        </div>
      ))}
    </>
  );
}
