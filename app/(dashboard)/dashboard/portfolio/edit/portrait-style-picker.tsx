'use client';

import { cn } from '@/lib/utils';

import {
  PORTRAIT_STYLES,
  type PortraitStyleId,
} from '@/lib/portfolio/templates/minimal-studio/portrait-styles';

interface PortraitStylePickerProps {
  value: PortraitStyleId;
  onChange: (style: PortraitStyleId) => void;
}

/** Tiny wireframe thumbnails — shape hints for each editorial preset. */
function StyleThumbnail({ styleId }: { styleId: PortraitStyleId }) {
  return (
    <div
      className="relative h-14 w-full rounded border border-border/80 bg-muted/25 p-1.5"
      aria-hidden="true"
    >
      <div className="flex h-full gap-1">
        {styleId === 'style-1' && (
          <>
            <div className="w-[22%] rounded-sm bg-foreground/25" />
            <div className="flex flex-1 flex-col justify-end gap-0.5">
              <div className="h-1 w-2/3 rounded-sm bg-foreground/15" />
              <div className="h-2.5 flex-1 rounded-sm bg-foreground/20" />
            </div>
          </>
        )}
        {styleId === 'style-2' && (
          <>
            <div className="flex flex-1 flex-col justify-end gap-0.5">
              <div className="h-1 w-2/3 rounded-sm bg-foreground/15" />
              <div className="h-2.5 flex-1 rounded-sm bg-foreground/20" />
            </div>
            <div className="w-[30%] rounded-sm bg-foreground/25" />
          </>
        )}
        {styleId === 'style-3' && (
          <>
            <div className="w-[30%] rounded-sm bg-foreground/25" />
            <div className="flex flex-1 flex-col justify-end gap-0.5">
              <div className="h-1 w-2/3 rounded-sm bg-foreground/15" />
              <div className="h-2.5 flex-1 rounded-sm bg-foreground/20" />
            </div>
          </>
        )}
        {styleId === 'style-4' && (
          <div className="flex flex-1 flex-col gap-1">
            <div className="h-[38%] w-full rounded-sm bg-foreground/25" />
            <div className="h-1 w-1/2 rounded-sm bg-foreground/15" />
            <div className="flex-1 rounded-sm bg-foreground/20" />
          </div>
        )}
        {styleId === 'style-5' && (
          <>
            <div className="relative flex flex-1 flex-col justify-end gap-0.5">
              <div className="absolute right-0 top-0 h-[55%] w-[34%] rounded-sm bg-foreground/25" />
              <div className="h-1 w-2/3 rounded-sm bg-foreground/15" />
              <div className="h-2.5 flex-1 rounded-sm bg-foreground/20" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Portrait preset picker for Minimal Studio — five distinct editorial layouts.
 */
export function PortraitStylePicker({ value, onChange }: PortraitStylePickerProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {PORTRAIT_STYLES.map((style) => {
        const selected = style.id === value;
        return (
          <button
            key={style.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(style.id)}
            className={cn(
              'flex flex-col gap-2 rounded-lg border p-2 text-left transition-colors',
              selected
                ? 'border-foreground bg-muted/40 ring-1 ring-foreground/20'
                : 'border-border bg-background hover:bg-muted/30'
            )}
          >
            <StyleThumbnail styleId={style.id} />
            <div>
              <span className="text-xs font-semibold text-foreground">{style.label}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                {style.description}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
