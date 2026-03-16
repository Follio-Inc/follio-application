'use client';

import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDownUp, ArrowUpDown, GripVertical } from 'lucide-react';
import { useCallback, useId, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type SortDirection = 'chronological' | 'reverse-chronological';

/**
 * Extract date(s) from an item for sorting.
 * Return `start` for the primary sort key, `end` as the tie-breaker.
 * Return `null` for dates that don't exist — those items sort to the end.
 */
export interface DateExtractor<T> {
  (item: T): { start: Date | null; end: Date | null };
}

interface SortableCardListProps<T extends { id: string }> {
  /** The items to render. Must each have an `id` field. */
  items: T[];
  /**
   * Called whenever the order changes (drag-and-drop or sort button).
   * The parent should persist this order.
   */
  onReorder: (reorderedItems: T[]) => void;
  /**
   * Optional date extractor for chronological sorting.
   * If not provided, the sort-by-date button is hidden.
   */
  dateExtractor?: DateExtractor<T>;
  /** Render function for each item card. Receives the item. */
  renderItem: (item: T) => React.ReactNode;
  /** Disable all reorder interactions */
  disabled?: boolean;
  /** Additional className for the list container */
  className?: string;
}

interface SortableItemCardProps {
  id: string;
  children: React.ReactNode;
  disabled?: boolean;
}

// ─────────────────────────────────────────────
// Date Sort Logic
// ─────────────────────────────────────────────

/**
 * Stable sort items by date. Items without dates are pushed to the end
 * while preserving their relative order. Overlapping date ranges are
 * handled via a three-level sort:
 *   1. Primary date (start or end depending on direction)
 *   2. Secondary date (the other date field)
 *   3. Original array index (preserves stability)
 */
function sortByDate<T>(items: T[], extractor: DateExtractor<T>, direction: SortDirection): T[] {
  const indexed = items.map((item, originalIndex) => ({
    item,
    originalIndex,
    dates: extractor(item),
  }));

  const directionMultiplier = direction === 'reverse-chronological' ? -1 : 1;

  indexed.sort((a, b) => {
    const aHasDate = a.dates.start !== null || a.dates.end !== null;
    const bHasDate = b.dates.start !== null || b.dates.end !== null;

    // Items without any date go to the end, preserving relative order
    if (!aHasDate && !bHasDate) return a.originalIndex - b.originalIndex;
    if (!aHasDate) return 1;
    if (!bHasDate) return -1;

    // Primary sort: start date
    const aStart = a.dates.start?.getTime() ?? 0;
    const bStart = b.dates.start?.getTime() ?? 0;

    if (aStart !== bStart) {
      return (aStart - bStart) * directionMultiplier;
    }

    // Tie-breaker: end date (current/null end dates treated as "far future")
    const FAR_FUTURE = Number.MAX_SAFE_INTEGER;
    const aEnd = a.dates.end?.getTime() ?? FAR_FUTURE;
    const bEnd = b.dates.end?.getTime() ?? FAR_FUTURE;

    if (aEnd !== bEnd) {
      return (aEnd - bEnd) * directionMultiplier;
    }

    // Final tie-breaker: original index for stability
    return a.originalIndex - b.originalIndex;
  });

  return indexed.map(({ item }) => item);
}

// ─────────────────────────────────────────────
// SortableItemCard
// ─────────────────────────────────────────────

/**
 * Wraps a single card with a drag handle for reordering.
 * Place your existing card markup as children.
 */
export function SortableItemCard({ id, children, disabled }: SortableItemCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
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
      className={cn('group/sortable relative', isDragging && 'z-50 opacity-90 shadow-lg')}
    >
      {!disabled && (
        <button
          {...attributes}
          {...listeners}
          className={cn(
            'absolute -left-1 top-1/2 -translate-x-full -translate-y-1/2',
            'flex h-8 w-6 cursor-grab items-center justify-center rounded-md',
            'text-muted-foreground/40 opacity-0 transition-opacity',
            'hover:text-muted-foreground focus-visible:opacity-100 group-hover/sortable:opacity-100',
            isDragging && 'cursor-grabbing opacity-100'
          )}
          title="Drag to reorder"
          type="button"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────
// SortableCardList
// ─────────────────────────────────────────────

/**
 * Generic sortable list with drag-and-drop reordering and date-based sorting.
 *
 * Usage:
 * ```tsx
 * <SortableCardList
 *   items={educations}
 *   onReorder={handleReorder}
 *   dateExtractor={(edu) => ({
 *     start: edu.startDate ? new Date(edu.startDate) : null,
 *     end: edu.endDate ? new Date(edu.endDate) : null,
 *   })}
 *   renderItem={(edu) => <EducationCard edu={edu} />}
 * />
 * ```
 */
export function SortableCardList<T extends { id: string }>({
  items,
  onReorder,
  dateExtractor,
  renderItem,
  disabled = false,
  className,
}: SortableCardListProps<T>) {
  const dndId = useId();
  const [activeSortDirection, setActiveSortDirection] = useState<SortDirection | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const itemIds = useMemo(() => items.map((item) => item.id), [items]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        const reordered = arrayMove(items, oldIndex, newIndex);
        setActiveSortDirection(null); // Clear active sort indicator on manual drag
        onReorder(reordered);
      }
    },
    [items, onReorder]
  );

  const handleSortByDate = useCallback(
    (direction: SortDirection) => {
      if (!dateExtractor) return;
      const sorted = sortByDate(items, dateExtractor, direction);
      setActiveSortDirection(direction);
      onReorder(sorted);
    },
    [items, dateExtractor, onReorder]
  );

  if (items.length <= 1 && !dateExtractor) {
    // Only one or zero items and no sort — just render directly
    return (
      <div className={cn('space-y-3', className)}>
        {items.map((item) => (
          <div key={item.id}>{renderItem(item)}</div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Sort toolbar — only shown when there are 2+ items and a date extractor */}
      {items.length >= 2 && dateExtractor && (
        <div className="flex items-center justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 text-xs" disabled={disabled}>
                <ArrowUpDown className="h-3.5 w-3.5" />
                {activeSortDirection === 'reverse-chronological'
                  ? 'Newest First'
                  : activeSortDirection === 'chronological'
                    ? 'Oldest First'
                    : 'Sort by Date'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => handleSortByDate('reverse-chronological')}
                className="gap-2"
              >
                <ArrowDownUp className="h-3.5 w-3.5" />
                Newest First
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => handleSortByDate('chronological')}
                className="gap-2"
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
                Oldest First
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Sortable list */}
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-3 pl-5">
            {items.map((item) => (
              <SortableItemCard key={item.id} id={item.id} disabled={disabled}>
                {renderItem(item)}
              </SortableItemCard>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
