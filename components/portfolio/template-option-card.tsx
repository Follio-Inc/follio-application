'use client';

import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

import { TemplatePreviewFrame } from './template-preview-frame';

/**
 * A serializable subset of TemplateKitMeta — enough to render an option card
 * without importing the full kit (which pulls in CSS). Both onboarding and the
 * dashboard gallery pass this shape.
 */
export interface TemplateOption {
  id: string;
  name: string;
  description: string;
  tags: string[];
  accentColors: Array<{ name: string; value: string }>;
}

interface TemplateOptionCardProps {
  template: TemplateOption;
  selected: boolean;
  /** Marks the template the portfolio currently uses (shows a "Current" badge). */
  current?: boolean;
  disabled?: boolean;
  onSelect: (templateId: string) => void;
}

export function TemplateOptionCard({
  template,
  selected,
  current = false,
  disabled = false,
  onSelect,
}: TemplateOptionCardProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(template.id)}
      aria-pressed={selected}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border bg-card text-left transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        selected
          ? 'border-foreground ring-1 ring-foreground'
          : 'border-border hover:border-foreground/30 hover:shadow-sm',
        disabled && 'pointer-events-none opacity-60'
      )}
    >
      {/* Selected check */}
      {selected && (
        <span className="absolute right-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background shadow">
          <Check className="h-3.5 w-3.5" />
        </span>
      )}

      {/* Live preview */}
      <div className="relative border-b">
        <TemplatePreviewFrame templateId={template.id} aspectRatio={16 / 10} />
        {current && (
          <span className="absolute left-3 top-3 z-10 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground shadow-sm backdrop-blur">
            Current
          </span>
        )}
      </div>

      {/* Meta */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{template.name}</h3>
          <div className="flex items-center gap-1">
            {template.accentColors.slice(0, 5).map((c) => (
              <span
                key={c.value}
                title={c.name}
                className="h-3 w-3 rounded-full border border-black/10"
                style={{ backgroundColor: c.value }}
              />
            ))}
          </div>
        </div>
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {template.description}
        </p>
        {template.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {template.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
