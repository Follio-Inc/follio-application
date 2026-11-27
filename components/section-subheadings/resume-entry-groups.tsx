import { Fragment, type ReactNode } from 'react';

import { ResumeOrgGroup } from '@/components/section-entry-grouping/resume-org-group';
import {
  groupConsecutiveByOrg,
  parseEntryGrouping,
  type ConsecutiveOrgGroup,
  type EntryGroupingMode,
} from '@/lib/section-entry-grouping';
import { groupEntriesBySubheadings, hasLabeledSubheadingGroups } from '@/lib/section-subheadings';
import { cn } from '@/lib/utils';

export type ResumeEntryGroupContext = {
  grouped: boolean;
  locationShared: boolean;
};

export function ResumeSubheading({ children }: { children: ReactNode }) {
  return <p className="resume-subheading">{children}</p>;
}

function OrgGroupedEntries<T extends { id: string }>({
  items,
  mode,
  orgOf,
  locationOf,
  compact,
  children,
}: {
  items: T[];
  mode: EntryGroupingMode;
  orgOf?: (item: T) => string | null | undefined;
  locationOf?: (item: T) => string | null | undefined;
  compact?: boolean;
  children: (item: T, context: ResumeEntryGroupContext) => ReactNode;
}) {
  if (!orgOf || mode === 'off') {
    return (
      <div className={cn('resume-entries', compact && 'resume-entries-compact')}>
        {items.map((item) => (
          <Fragment key={item.id}>
            {children(item, { grouped: false, locationShared: true })}
          </Fragment>
        ))}
      </div>
    );
  }

  const groups = groupConsecutiveByOrg(items, orgOf, mode, locationOf);

  return (
    <div className={cn('resume-entries', compact && 'resume-entries-compact')}>
      {groups.map((group) => (
        <OrgGroupBlock key={group.id} group={group}>
          {group.entries.map((item) => (
            <Fragment key={item.id}>
              {children(item, {
                grouped: group.grouped,
                locationShared: group.locationShared,
              })}
            </Fragment>
          ))}
        </OrgGroupBlock>
      ))}
    </div>
  );
}

function OrgGroupBlock<T extends { id: string }>({
  group,
  children,
}: {
  group: ConsecutiveOrgGroup<T>;
  children: ReactNode;
}) {
  if (!group.grouped) return <>{children}</>;
  return (
    <ResumeOrgGroup name={group.orgName} location={group.locationShared ? group.location : null}>
      {children}
    </ResumeOrgGroup>
  );
}

export function ResumeEntryGroups<T extends { id: string }>({
  items,
  subHeadings,
  compact,
  grouping,
  orgOf,
  locationOf,
  children,
}: {
  items: T[];
  subHeadings?: unknown;
  compact?: boolean;
  grouping?: unknown;
  orgOf?: (item: T) => string | null | undefined;
  locationOf?: (item: T) => string | null | undefined;
  children: (item: T, context: ResumeEntryGroupContext) => ReactNode;
}) {
  const groups = groupEntriesBySubheadings(items, subHeadings);
  const labeled = hasLabeledSubheadingGroups(groups);
  const mode = parseEntryGrouping(grouping);

  if (!labeled) {
    return (
      <OrgGroupedEntries
        items={items}
        mode={mode}
        orgOf={orgOf}
        locationOf={locationOf}
        compact={compact}
      >
        {children}
      </OrgGroupedEntries>
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
          <OrgGroupedEntries
            items={group.entries}
            mode={mode}
            orgOf={orgOf}
            locationOf={locationOf}
            compact={compact}
          >
            {children}
          </OrgGroupedEntries>
        </div>
      ))}
    </>
  );
}
