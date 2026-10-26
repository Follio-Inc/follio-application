'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Input } from '@/components/ui/input';
import { notifyProfileUpdated } from '@/lib/events';
import {
  MAX_SUBHEADING_LABEL,
  toSubheadingSortableId,
  type SectionSubHeadings,
} from '@/lib/section-subheadings';
import { cn } from '@/lib/utils';

export async function persistSectionSubHeadings(
  sectionId: string,
  subHeadings: SectionSubHeadings | null
): Promise<void> {
  const response = await fetch(`/api/profile/sections/${sectionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subHeadings }),
  });
  if (!response.ok) {
    throw new Error('Failed to save sub-headings');
  }
  notifyProfileUpdated();
}

function SubheadingHeaderFields({
  label,
  disabled,
  onLabelCommit,
  onDelete,
}: {
  label: string;
  disabled?: boolean;
  onLabelCommit: (label: string) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(label);

  useEffect(() => {
    setDraft(label);
  }, [label]);

  const commit = () => {
    const next = draft.replace(/\s+/g, ' ').trim();
    if (!next) {
      setDraft(label);
      return;
    }
    if (next !== label) onLabelCommit(next);
  };

  return (
    <div className="flex items-center gap-2 rounded-xl bg-background/70 px-3 py-2">
      <Input
        value={draft}
        maxLength={MAX_SUBHEADING_LABEL}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        aria-label="Sub-heading name"
        className="h-7 border-0 bg-transparent px-1 text-xs font-semibold tracking-[0.06em] shadow-none focus-visible:ring-1"
      />
      <button
        type="button"
        disabled={disabled}
        onClick={onDelete}
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors',
          'text-muted-foreground/40 hover:text-destructive',
          'opacity-0 focus-visible:opacity-100 group-hover/sortable-entry:opacity-100'
        )}
        title="Delete sub-heading"
        aria-label={`Delete ${label}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function SubheadingHeaderRow({
  label,
  disabled,
  onLabelCommit,
  onDelete,
}: {
  label: string;
  disabled?: boolean;
  onLabelCommit: (label: string) => void;
  onDelete: () => void;
}) {
  return (
    <div className="group/sortable-entry">
      <SubheadingHeaderFields
        label={label}
        disabled={disabled}
        onLabelCommit={onLabelCommit}
        onDelete={onDelete}
      />
    </div>
  );
}

export function SortableSubheadingRow({
  groupId,
  label,
  disabled,
  onLabelCommit,
  onDelete,
}: {
  groupId: string;
  label: string;
  disabled?: boolean;
  onLabelCommit: (label: string) => void;
  onDelete: () => void;
}) {
  const sortableId = toSubheadingSortableId(groupId);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('group/sortable-entry relative', isDragging && 'z-50 opacity-90 shadow-lg')}
    >
      {!disabled && (
        <button
          {...attributes}
          {...listeners}
          className={cn(
            'absolute -left-1 top-1/2 -translate-x-full -translate-y-1/2',
            'flex h-8 w-6 cursor-grab items-center justify-center rounded-md',
            'text-muted-foreground/40 opacity-0 transition-opacity',
            'hover:text-muted-foreground focus-visible:opacity-100 group-hover/sortable-entry:opacity-100',
            isDragging && 'cursor-grabbing opacity-100'
          )}
          title="Drag to reorder sub-heading"
          type="button"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <SubheadingHeaderFields
        label={label}
        disabled={disabled}
        onLabelCommit={onLabelCommit}
        onDelete={onDelete}
      />
    </div>
  );
}
