'use client';

import { cn } from '@/lib/utils';

export interface LayoutStyleOption<Id extends string> {
  id: Id;
  label: string;
  description: string;
}

interface LayoutStylePickerProps<Id extends string> {
  options: ReadonlyArray<LayoutStyleOption<Id>>;
  value: Id;
  onChange: (id: Id) => void;
  /** Tiny wireframe preview for an option. */
  renderThumbnail: (id: Id) => React.ReactNode;
}

/**
 * Generic preset picker — a grid of selectable cards, each with a wireframe
 * thumbnail, a label, and a short description. Mirrors the portrait picker so
 * every "style" control in the editor looks and behaves the same.
 */
export function LayoutStylePicker<Id extends string>({
  options,
  value,
  onChange,
  renderThumbnail,
}: LayoutStylePickerProps<Id>) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.id)}
            className={cn(
              'flex flex-col gap-2 rounded-lg border p-2 text-left transition-colors',
              selected
                ? 'border-foreground bg-muted/40 ring-1 ring-foreground/20'
                : 'border-border bg-background hover:bg-muted/30'
            )}
          >
            <ThumbFrame>{renderThumbnail(option.id)}</ThumbFrame>
            <div>
              <span className="text-xs font-semibold text-foreground">{option.label}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                {option.description}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ThumbFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative h-14 w-full rounded border border-border/80 bg-muted/25 p-1.5"
      aria-hidden="true"
    >
      {children}
    </div>
  );
}

// ============================================================================
// THUMBNAILS — small wireframe hints, one per layout preset
// ============================================================================

const block = 'rounded-sm bg-foreground/20';
const blockStrong = 'rounded-sm bg-foreground/25';
const line = 'rounded-sm bg-foreground/15';

export function WorkStyleThumbnail({ id }: { id: string }) {
  if (id === 'editorial') {
    return (
      <div className="flex h-full flex-col gap-1">
        <div className={cn('h-[45%] w-full', blockStrong)} />
        <div className="grid flex-1 grid-cols-2 gap-1">
          <div className={block} />
          <div className={block} />
        </div>
      </div>
    );
  }
  if (id === 'grid') {
    return (
      <div className="grid h-full grid-cols-2 grid-rows-2 gap-1">
        <div className={block} />
        <div className={block} />
        <div className={block} />
        <div className={block} />
      </div>
    );
  }
  // gallery
  return (
    <div className="grid h-full grid-cols-3 grid-rows-2 gap-1">
      <div className={block} />
      <div className={block} />
      <div className={block} />
      <div className={block} />
      <div className={block} />
      <div className={block} />
    </div>
  );
}

export function AboutStyleThumbnail({ id }: { id: string }) {
  if (id === 'sidebar') {
    return (
      <div className="flex h-full gap-1.5">
        <div className="flex w-[34%] flex-col gap-1">
          <div className={cn('h-1 w-3/4', line)} />
          <div className={cn('h-1 w-2/3', line)} />
          <div className={cn('h-1 w-3/4', line)} />
        </div>
        <div className="flex flex-1 flex-col justify-center gap-1">
          <div className={cn('h-2 w-2/3', blockStrong)} />
          <div className={cn('h-1 w-full', line)} />
          <div className={cn('h-1 w-5/6', line)} />
        </div>
      </div>
    );
  }
  if (id === 'centered') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1">
        <div className={cn('h-1 w-1/4', line)} />
        <div className={cn('h-2 w-1/2', blockStrong)} />
        <div className={cn('h-1 w-3/4', line)} />
        <div className={cn('h-1 w-2/3', line)} />
      </div>
    );
  }
  // statement
  return (
    <div className="flex h-full flex-col justify-center gap-1.5">
      <div className={cn('h-3 w-3/4', blockStrong)} />
      <div className="flex gap-1">
        <div className={cn('h-1.5 w-1/4', line)} />
        <div className={cn('h-1.5 w-1/4', line)} />
        <div className={cn('h-1.5 w-1/4', line)} />
      </div>
    </div>
  );
}

export function SkillsStyleThumbnail({ id }: { id: string }) {
  if (id === 'rows') {
    return (
      <div className="flex h-full flex-col justify-center gap-1.5">
        {[0, 1].map((row) => (
          <div key={row} className="flex items-center gap-1.5">
            <div className={cn('h-1.5 w-[28%] shrink-0', line)} />
            <div className="flex flex-1 gap-1">
              <div className={cn('h-1.5 w-1/4', block)} />
              <div className={cn('h-1.5 w-1/4', block)} />
              <div className={cn('h-1.5 w-1/4', block)} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (id === 'inline') {
    return (
      <div className="flex h-full flex-col justify-center gap-1">
        <div className={cn('h-1.5 w-1/3', line)} />
        <div className="flex flex-wrap gap-1">
          <div className={cn('h-1.5 w-1/5', block)} />
          <div className={cn('h-1.5 w-1/4', block)} />
          <div className={cn('h-1.5 w-1/5', block)} />
          <div className={cn('h-1.5 w-1/4', block)} />
        </div>
      </div>
    );
  }
  // columns
  return (
    <div className="grid h-full grid-cols-3 gap-1">
      {[0, 1, 2].map((col) => (
        <div key={col} className="flex flex-col gap-1">
          <div className={cn('h-1.5 w-3/4', line)} />
          <div className={cn('h-1.5 w-full', block)} />
          <div className={cn('h-1.5 w-2/3', block)} />
        </div>
      ))}
    </div>
  );
}
