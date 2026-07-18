'use client';

import { Check } from 'lucide-react';

import { AppearanceModeSwitch } from '@/components/appearance-mode-switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { TemplateStyleConfig } from '@/lib/portfolio/templates/types';
import type { EditorTemplateInfo } from './types';

interface StylePanelProps {
  style: TemplateStyleConfig;
  template: EditorTemplateInfo;
  onChange: (patch: Partial<TemplateStyleConfig>) => void;
}

export function StylePanel({ style, template, onChange }: StylePanelProps) {
  const appearance = style.appearance ?? template.defaultAppearance ?? 'system';

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h4 className="text-xs font-medium text-muted-foreground">Appearance</h4>
        <AppearanceModeSwitch
          value={appearance}
          onChange={(value) => onChange({ appearance: value })}
          ariaLabel="Portfolio appearance"
        />
      </section>

      <section className="space-y-3">
        <h4 className="text-xs font-medium text-muted-foreground">Accent color</h4>
        <div className="flex flex-wrap gap-2">
          {template.accentColors.map((color) => {
            const selected = color.value.toLowerCase() === style.accentColor.toLowerCase();
            return (
              <button
                key={color.value}
                type="button"
                title={color.name}
                aria-label={color.name}
                aria-pressed={selected}
                onClick={() => onChange({ accentColor: color.value })}
                className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-transform hover:scale-105 ${
                  selected ? 'border-foreground' : 'border-transparent'
                }`}
                style={{ backgroundColor: color.value }}
              >
                {selected && <Check className="h-4 w-4 text-white drop-shadow" />}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-xs font-medium text-muted-foreground">Font</h4>
        <Select value={style.fontFamily} onValueChange={(value) => onChange({ fontFamily: value })}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a font" />
          </SelectTrigger>
          <SelectContent>
            {template.fonts.map((font) => (
              <SelectItem key={font.id} value={font.id}>
                {font.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>
    </div>
  );
}
