'use client';

import { Check } from 'lucide-react';

import {
  ONBOARDING_CARD_DESCRIPTION,
  ONBOARDING_CARD_TITLE,
  ONBOARDING_QUIET_PILL,
  ONBOARDING_SURFACE_INTERACTIVE,
  ONBOARDING_SURFACE_SELECTED,
} from '@/lib/onboarding-ui';
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
        'group relative flex flex-col overflow-hidden text-left',
        ONBOARDING_SURFACE_INTERACTIVE,
        selected && ONBOARDING_SURFACE_SELECTED,
        disabled && 'pointer-events-none opacity-60'
      )}
    >
      {selected && (
        <span className="absolute right-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background shadow-sm">
          <Check className="h-3.5 w-3.5" />
        </span>
      )}

      <div className="relative border-b border-border/50">
        <TemplatePreviewFrame templateId={template.id} aspectRatio={16 / 10} />
        {current && (
          <span
            className={`absolute left-3 top-3 z-10 bg-background/90 backdrop-blur ${ONBOARDING_QUIET_PILL}`}
          >
            Current
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className={ONBOARDING_CARD_TITLE}>{template.name}</h3>
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
        <p className={`line-clamp-2 ${ONBOARDING_CARD_DESCRIPTION}`}>{template.description}</p>
        {template.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {template.tags.slice(0, 4).map((tag) => (
              <span key={tag} className={ONBOARDING_QUIET_PILL}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
