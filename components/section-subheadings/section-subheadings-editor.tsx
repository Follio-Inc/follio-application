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
    <div className="flex items-center gap-1.5 px-0.5 py-1.5">
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
        className="h-7 border-0 bg-transparent px-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground shadow-none focus-visible:ring-1"
      />
      <button
        type="button"
        disabled={disabled}
        onClick={onDelete}
        className="builder-quiet-btn hover:text-destructive"
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
      className={cn('flex items-center gap-1.5', isDragging && 'z-50 opacity-90')}
    >
      {!disabled ? (
        <button
          {...attributes}
          {...listeners}
          className={cn('builder-grip', isDragging && 'cursor-grabbing text-muted-foreground')}
          title="Drag to reorder sub-heading"
          type="button"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : (
        <span className="flex h-8 w-6 shrink-0" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <SubheadingHeaderFields
          label={label}
          disabled={disabled}
          onLabelCommit={onLabelCommit}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}
