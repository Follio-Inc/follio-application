'use client';

import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';

import { SubheadingHeaderRow } from '@/components/section-subheadings/section-subheadings-editor';
import {
  addSubHeadingGroup,
  groupEntriesBySubheadings,
  MAX_SUBHEADING_GROUPS,
  parseSubHeadings,
  removeSubHeadingGroup,
  setGroupLabel,
  type SectionSubHeadings,
} from '@/lib/section-subheadings';
import type { ProfileSection } from '@/types';

import { SortableCardList, type DateExtractor } from './sortable-card-list';
import { usePersistSectionSubHeadings } from './connected-section-subheadings';

export function SubheadingAddButton({
  section,
  disabled,
}: {
  section: ProfileSection | null | undefined;
  disabled?: boolean;
}) {
  const persist = usePersistSectionSubHeadings();
  const parsed = parseSubHeadings(section?.subHeadings);
  if (!section || !parsed || parsed.groups.length >= MAX_SUBHEADING_GROUPS) return null;

  return (
    <button
      type="button"
      disabled={disabled}
      className="builder-add-btn"
      onClick={() => persist(section.id, addSubHeadingGroup(parsed))}
    >
      <Plus className="h-3.5 w-3.5" />
      Add sub-heading
    </button>
  );
}

export function SubheadingGroupedCards<T extends { id: string }>({
  section,
  items,
  onReorder,
  dateExtractor,
  disabled,
  renderItem,
  orgOf,
}: {
  section: ProfileSection | null | undefined;
  items: T[];
  onReorder: (items: T[]) => void;
  dateExtractor?: DateExtractor<T>;
  disabled?: boolean;
  renderItem: (item: T) => ReactNode;
  orgOf?: (item: T) => string | null | undefined;
}) {
  const persist = usePersistSectionSubHeadings();
  const parsed = parseSubHeadings(section?.subHeadings);

  if (!section || !parsed) {
    return (
      <SortableCardList
        items={items}
        onReorder={onReorder}
        dateExtractor={dateExtractor}
        disabled={disabled}
        renderItem={renderItem}
        grouping={section?.entryGrouping}
        orgOf={orgOf}
      />
    );
  }

  const groups = groupEntriesBySubheadings(items, parsed, { includeEmpty: true });

  const persistGroups = (next: SectionSubHeadings | null) => persist(section.id, next);

  const handleGroupReorder = (groupId: string, reordered: T[]) => {
    const nextItems = groups.flatMap((group) => (group.id === groupId ? reordered : group.entries));
    onReorder(nextItems);
    persistGroups({
      groups: parsed.groups.map((group) => ({
        ...group,
        entryIds: (group.id === groupId
          ? reordered
          : (groups.find((item) => item.id === group.id)?.entries ?? [])
        ).map((item) => item.id),
      })),
    });
  };

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const heading = parsed.groups.find((item) => item.id === group.id);
        return (
          <div key={group.id} className="space-y-2">
            {heading ? (
              <SubheadingHeaderRow
                label={heading.label}
                disabled={disabled}
                onLabelCommit={(label) => persistGroups(setGroupLabel(parsed, heading.id, label))}
                onDelete={() => persistGroups(removeSubHeadingGroup(parsed, heading.id))}
              />
            ) : null}
            {group.entries.length > 0 ? (
              <SortableCardList
                items={group.entries}
                onReorder={(reordered) => handleGroupReorder(group.id, reordered)}
                dateExtractor={dateExtractor}
                disabled={disabled}
                renderItem={renderItem}
                grouping={section.entryGrouping}
                orgOf={orgOf}
              />
            ) : (
              <p className="px-1 text-xs text-muted-foreground">
                No entries in this sub-heading yet.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
