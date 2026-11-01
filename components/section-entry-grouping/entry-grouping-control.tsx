'use client';

import { ChevronDown } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { notifyProfileUpdated } from '@/lib/events';
import {
  parseEntryGrouping,
  serializeEntryGrouping,
  type EntryGroupingMode,
  type EntryGroupingStored,
} from '@/lib/section-entry-grouping';
import { cn } from '@/lib/utils';

const MODE_LABEL: Record<EntryGroupingMode, string> = {
  off: 'Group',
  repeats: 'Grouped',
  all: 'Group all',
};

export async function persistSectionEntryGrouping(
  sectionId: string,
  entryGrouping: EntryGroupingStored
): Promise<void> {
  const response = await fetch(`/api/profile/sections/${sectionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entryGrouping }),
  });
  if (!response.ok) {
    throw new Error('Failed to save grouping');
  }
  notifyProfileUpdated();
}

export function EntryGroupingControl({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (mode: EntryGroupingMode) => void;
}) {
  const mode = parseEntryGrouping(value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium outline-none',
            'rounded-lg px-1.5 py-1 hover:bg-foreground/[0.05] focus-visible:ring-2 focus-visible:ring-ring/40',
            mode === 'off' ? 'text-muted-foreground' : 'text-foreground'
          )}
          aria-label="Group consecutive entries by organization"
        >
          {MODE_LABEL[mode]}
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">
          Group by organization
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(next) => {
            if (next === 'off' || next === 'repeats' || next === 'all') onChange(next);
          }}
        >
          <DropdownMenuRadioItem value="off" className="items-start py-2">
            <span className="flex flex-col gap-0.5">
              <span>Off</span>
              <span className="text-[11px] font-normal leading-snug text-muted-foreground">
                Each entry shows its own organization
              </span>
            </span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="repeats" className="items-start py-2">
            <span className="flex flex-col gap-0.5">
              <span>Same organization</span>
              <span className="text-[11px] font-normal leading-snug text-muted-foreground">
                Consecutive entries that share a name are grouped
              </span>
            </span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="all" className="items-start py-2">
            <span className="flex flex-col gap-0.5">
              <span>All entries</span>
              <span className="text-[11px] font-normal leading-snug text-muted-foreground">
                Same layout for every entry, still split by organization
              </span>
            </span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { serializeEntryGrouping };
