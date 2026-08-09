'use client';

/**
 * Shared paper design controls — theme, colors, typography, density, page layout.
 * Resume and cover letter designers compose these; document-specific sections sit beside them.
 */

import {
  AlignJustify,
  Bold,
  FileText,
  Italic,
  Monitor,
  Moon,
  ScrollText,
  Sheet,
  Sun,
  Underline,
} from 'lucide-react';
import { useId, useState, useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DOCUMENT_FONT_LABELS,
  DOCUMENT_FONT_MAP,
  DOCUMENT_FONT_OPTIONS,
  type DocumentColorTheme,
  type DocumentDensity,
  type DocumentDesign,
  type DocumentDividerStyle,
  type DocumentFontFamily,
  type DocumentPageLayout,
  type DocumentTextStyle,
} from '@/lib/document-design';
import { cn } from '@/lib/utils';

const PRESET_COLORS = [
  '#0f172a',
  '#1e293b',
  '#334155',
  '#475569',
  '#0c4a6e',
  '#1e3a5f',
  '#1e40af',
  '#1d4ed8',
  '#134e4a',
  '#065f46',
  '#3730a3',
  '#4c1d95',
  '#7f1d1d',
  '#831843',
  '#78350f',
  '#92400e',
] as const;

const DIVIDER_STYLE_OPTIONS: { value: DocumentDividerStyle; label: string }[] = [
  { value: 'line', label: 'Solid' },
  { value: 'double', label: 'Double' },
  { value: 'thick', label: 'Thick' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
  { value: 'none', label: 'None' },
];

const DENSITY_OPTIONS: { value: DocumentDensity; label: string }[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'normal', label: 'Normal' },
  { value: 'relaxed', label: 'Relaxed' },
];

const THEME_OPTIONS: {
  value: DocumentColorTheme;
  label: string;
  icon: typeof Sun;
}[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'Auto', icon: Monitor },
];

const PAGE_LAYOUT_OPTIONS: {
  value: DocumentPageLayout;
  label: string;
  icon: typeof ScrollText;
}[] = [
  { value: 'continuous', label: 'Scroll', icon: ScrollText },
  { value: 'a4', label: 'A4', icon: FileText },
  { value: 'letter', label: 'Letter', icon: Sheet },
];

const HEX_PATTERN = /^#([0-9a-fA-F]{6})$/;

function normalizeHex(value: string): string | null {
  const trimmed = value.trim();
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (!HEX_PATTERN.test(withHash)) return null;
  return withHash.toLowerCase();
}

function isLightColor(hex: string): boolean {
  const normalized = normalizeHex(hex);
  if (!normalized) return false;
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.72;
}

export function DesignSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-[13px] font-semibold tracking-tight text-foreground">{title}</h3>
        {description ? (
          <p className="text-[11px] leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  'aria-label': ariaLabel,
  equalWidth = true,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; icon?: React.ComponentType<{ className?: string }> }[];
  'aria-label': string;
  equalWidth?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex w-full items-center rounded-lg bg-muted/60 p-0.5',
        !equalWidth && 'w-auto'
      )}
    >
      {options.map((option) => {
        const Icon = option.icon;
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-all',
              equalWidth && 'flex-1',
              selected
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ColorField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (color: string) => void;
  label: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [hexDraft, setHexDraft] = useState(value);
  const fieldId = useId();

  useEffect(() => {
    if (open) setHexDraft(value.toUpperCase());
  }, [open, value]);

  const commitHex = (raw: string) => {
    const next = normalizeHex(raw);
    if (next) onChange(next);
    else setHexDraft(value.toUpperCase());
  };

  const isPreset = PRESET_COLORS.includes(value.toLowerCase() as (typeof PRESET_COLORS)[number]);

  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={fieldId} className="shrink-0 text-[12px] font-medium text-muted-foreground">
        {label}
      </Label>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={fieldId}
            type="button"
            className={cn(
              'group flex h-8 min-w-[7.5rem] items-center gap-2 rounded-lg border border-border/70 bg-background px-1.5 pr-2.5 text-left transition-colors',
              'hover:border-border hover:bg-muted/30',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
              open && 'border-border bg-muted/30'
            )}
            aria-label={`${label}: ${value}`}
          >
            <span
              className="h-5 w-5 shrink-0 rounded-md border border-black/10 shadow-sm"
              style={{ backgroundColor: value }}
              aria-hidden
            />
            <span className="flex-1 font-mono text-[11px] uppercase tabular-nums tracking-wide text-foreground">
              {value.replace('#', '')}
            </span>
          </button>
        </PopoverTrigger>

        <PopoverContent align="end" className="w-[220px] space-y-3 p-3">
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">Presets</p>
            <div className="grid grid-cols-8 gap-1">
              {PRESET_COLORS.map((color) => {
                const selected = value.toLowerCase() === color;
                return (
                  <button
                    key={color}
                    type="button"
                    className={cn(
                      'relative flex h-5 w-5 items-center justify-center rounded-[5px] border border-black/10 transition-transform',
                      'hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                      selected && 'ring-2 ring-foreground ring-offset-1 ring-offset-popover'
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => {
                      onChange(color);
                      setHexDraft(color.toUpperCase());
                    }}
                    aria-label={`Select ${color}`}
                    aria-pressed={selected}
                  >
                    {selected ? (
                      <span
                        className={cn(
                          'text-[10px] font-bold',
                          isLightColor(color) ? 'text-foreground' : 'text-white'
                        )}
                      >
                        ✓
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5 border-t border-border/50 pt-3">
            <p className="text-[11px] font-medium text-muted-foreground">Custom</p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className={cn(
                  'relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/70',
                  'hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                  !isPreset && 'ring-2 ring-foreground/20'
                )}
                style={{
                  background: isPreset
                    ? 'conic-gradient(from 180deg, #ef4444, #f59e0b, #22c55e, #3b82f6, #8b5cf6, #ec4899, #ef4444)'
                    : value,
                }}
                onClick={() => inputRef.current?.click()}
                aria-label="Open system color picker"
              />
              <input
                ref={inputRef}
                type="color"
                value={normalizeHex(value) ?? '#0f172a'}
                onChange={(e) => {
                  onChange(e.target.value);
                  setHexDraft(e.target.value.toUpperCase());
                }}
                className="invisible absolute h-0 w-0"
                aria-hidden
                tabIndex={-1}
              />
              <div className="relative min-w-0 flex-1">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
                  #
                </span>
                <Input
                  value={hexDraft.replace(/^#/, '').toUpperCase()}
                  onChange={(e) => {
                    const next = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
                    setHexDraft(`#${next}`);
                  }}
                  onBlur={() => commitHex(hexDraft)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitHex(hexDraft);
                    }
                  }}
                  className="h-8 pl-5 font-mono text-[11px] uppercase tracking-wide"
                  aria-label={`${label} hex value`}
                  spellCheck={false}
                />
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

type TypographyRole = 'name' | 'heading' | 'body';

function TypographyRoleRow({
  label,
  fontFamily,
  fontSize,
  textStyle,
  onFontChange,
  onSizeChange,
  onStyleChange,
  sizeMin,
  sizeMax,
}: {
  label: string;
  fontFamily: DocumentFontFamily;
  fontSize: number;
  textStyle: DocumentTextStyle;
  onFontChange: (font: DocumentFontFamily) => void;
  onSizeChange: (size: number) => void;
  onStyleChange: (style: DocumentTextStyle) => void;
  sizeMin: number;
  sizeMax: number;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border/50 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-foreground">{label}</span>
        <div className="flex items-center gap-0.5">
          {(
            [
              { key: 'bold', icon: Bold, label: 'Bold' },
              { key: 'italic', icon: Italic, label: 'Italic' },
              { key: 'underline', icon: Underline, label: 'Underline' },
            ] as const
          ).map(({ key, icon: Icon, label: tip }) => (
            <Tooltip key={key}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={textStyle[key] ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onStyleChange({ ...textStyle, [key]: !textStyle[key] })}
                  aria-label={tip}
                  aria-pressed={textStyle[key]}
                >
                  <Icon className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">{tip}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Select value={fontFamily} onValueChange={(v) => onFontChange(v as DocumentFontFamily)}>
          <SelectTrigger className="h-8 flex-1 text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DOCUMENT_FONT_OPTIONS.map((font) => (
              <SelectItem key={font} value={font} style={{ fontFamily: DOCUMENT_FONT_MAP[font] }}>
                {DOCUMENT_FONT_LABELS[font]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="number"
          min={sizeMin}
          max={sizeMax}
          value={fontSize}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isNaN(n)) onSizeChange(Math.min(sizeMax, Math.max(sizeMin, n)));
          }}
          className="h-8 w-14 text-[12px] tabular-nums"
          aria-label={`${label} size`}
        />
      </div>
    </div>
  );
}

export interface SharedPaperDesignControlsProps {
  design: Required<DocumentDesign>;
  onChange: (patch: Partial<DocumentDesign>) => void;
  /** Which typography roles to show (cover letter skips unused ones). */
  typographyRoles?: TypographyRole[];
  showJustifyAll?: boolean;
}

/**
 * Theme, colors, typography, density, page layout — the shared designer core.
 */
export function SharedPaperDesignControls({
  design,
  onChange,
  typographyRoles = ['name', 'heading', 'body'],
  showJustifyAll = true,
}: SharedPaperDesignControlsProps) {
  return (
    <>
      <DesignSection title="Theme" description="Paper color and page size.">
        <div className="space-y-2.5">
          <SegmentedControl
            value={design.colorTheme}
            onChange={(colorTheme) => onChange({ colorTheme })}
            options={THEME_OPTIONS}
            aria-label="Color theme"
          />
          <SegmentedControl
            value={design.pageLayout}
            onChange={(pageLayout) => onChange({ pageLayout })}
            options={PAGE_LAYOUT_OPTIONS}
            aria-label="Page layout"
          />
        </div>
      </DesignSection>

      <DesignSection title="Colors">
        <div className="space-y-2">
          <ColorField
            label="Name & section titles"
            value={design.headingColor}
            onChange={(headingColor) => onChange({ headingColor })}
          />
          <ColorField
            label="Accent"
            value={design.accentColor}
            onChange={(accentColor) => onChange({ accentColor })}
          />
        </div>
      </DesignSection>

      <DesignSection title="Typography">
        <div className="space-y-2">
          {typographyRoles.includes('name') ? (
            <TypographyRoleRow
              label="Name"
              fontFamily={design.nameFontFamily}
              fontSize={design.nameFontSize}
              textStyle={design.nameStyle}
              onFontChange={(nameFontFamily) => onChange({ nameFontFamily })}
              onSizeChange={(nameFontSize) => onChange({ nameFontSize })}
              onStyleChange={(nameStyle) => onChange({ nameStyle })}
              sizeMin={16}
              sizeMax={48}
            />
          ) : null}
          {typographyRoles.includes('heading') ? (
            <TypographyRoleRow
              label="Section headers"
              fontFamily={design.headingFontFamily}
              fontSize={design.headingFontSize}
              textStyle={design.headingStyle}
              onFontChange={(headingFontFamily) => onChange({ headingFontFamily })}
              onSizeChange={(headingFontSize) => onChange({ headingFontSize })}
              onStyleChange={(headingStyle) => onChange({ headingStyle })}
              sizeMin={9}
              sizeMax={18}
            />
          ) : null}
          {typographyRoles.includes('body') ? (
            <TypographyRoleRow
              label="Section content"
              fontFamily={design.fontFamily}
              fontSize={design.fontSize}
              textStyle={design.bodyStyle}
              onFontChange={(fontFamily) => onChange({ fontFamily })}
              onSizeChange={(fontSize) => onChange({ fontSize })}
              onStyleChange={(bodyStyle) => onChange({ bodyStyle })}
              sizeMin={8}
              sizeMax={20}
            />
          ) : null}
        </div>
      </DesignSection>

      <DesignSection title="Layout" description="Spacing and alignment.">
        <div className="space-y-2.5">
          <div className="space-y-1.5">
            <Label className="text-[12px] text-muted-foreground">Density</Label>
            <SegmentedControl
              value={design.density}
              onChange={(density) => onChange({ density })}
              options={DENSITY_OPTIONS}
              aria-label="Content density"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px] text-muted-foreground">Divider</Label>
            <SegmentedControl
              value={design.dividerStyle}
              onChange={(dividerStyle) => onChange({ dividerStyle })}
              options={DIVIDER_STYLE_OPTIONS}
              aria-label="Divider style"
            />
          </div>
          {showJustifyAll ? (
            <button
              type="button"
              onClick={() => onChange({ justifyAll: !design.justifyAll })}
              aria-pressed={design.justifyAll}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-[12px] transition-colors',
                design.justifyAll
                  ? 'border-primary/40 bg-primary/5 text-foreground'
                  : 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground'
              )}
            >
              <AlignJustify className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="font-medium">Justify all text</span>
            </button>
          ) : null}
        </div>
      </DesignSection>
    </>
  );
}
