'use client';

import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Italic,
  Minus,
  Monitor,
  Moon,
  Pipette,
  RotateCcw,
  ScrollText,
  Sheet,
  Sun,
  Underline,
} from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  getTemplateDefaultFont,
  mergeResumeDesign,
  type ResumeTypographyRole,
} from '@/lib/resume-design';
import {
  getHeaderLayoutSectionLabel,
  HEADER_PHOTO_LAYOUT_OPTIONS,
  HEADER_TEXT_ALIGNMENT_OPTIONS,
} from '@/lib/resume/header-layout';
import {
  RESUME_FONT_LABELS,
  RESUME_FONT_MAP,
  RESUME_FONT_OPTIONS,
  type PublicProfile,
  type ResumeColorTheme,
  type ResumeDensity,
  type ResumeDesign,
  type ResumeDividerStyle,
  type ResumeFontFamily,
  type ResumeHeaderAlignment,
  type ResumeHeaderPhotoLayout,
  type ResumePageLayout,
  type ResumeTextStyle,
} from '@/types';

const PHOTO_SIZE_MIN = 40;
const PHOTO_SIZE_MAX = 120;
const PHOTO_SIZE_STEP = 4;

import { ResumeFontLoader } from '@/app/u/[handle]/views/resume-font-loader';
import {
  buildDefaultDesignForTemplate,
  buildDesignForTemplateSwitch,
  getAllResumeTemplates,
  getResumeTemplateId,
  getTemplateDefaultShowPhoto,
  TEMPLATE_PREVIEW_IN_BUILDER,
  type ResumeTemplateId,
} from '@/lib/resume/templates';

import { useJustifyAll } from '../lib/use-justify-all';
import { useBuilderStore } from './builder-store-provider';
import { ResumeTemplateGallery } from './resume-template-gallery';
import { ResumeTemplateLiveThumbnail } from './resume-template-live-thumbnail';

/** How many template thumbnails to show inline before "Browse all". */
const INLINE_TEMPLATE_PREVIEW_COUNT = 3;

// ─── Constants ────────────────────────────────────────────────────

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

const DIVIDER_STYLE_OPTIONS: { value: ResumeDividerStyle; label: string }[] = [
  { value: 'line', label: 'Solid' },
  { value: 'double', label: 'Double' },
  { value: 'thick', label: 'Thick' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
  { value: 'none', label: 'None' },
];

const DENSITY_OPTIONS: { value: ResumeDensity; label: string }[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'normal', label: 'Normal' },
  { value: 'relaxed', label: 'Relaxed' },
];

const THEME_OPTIONS: {
  value: ResumeColorTheme;
  label: string;
  icon: typeof Sun;
}[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'Auto', icon: Monitor },
];

const PAGE_LAYOUT_OPTIONS: {
  value: ResumePageLayout;
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
  // Perceived luminance
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.72;
}

// ─── Shared primitives ────────────────────────────────────────────

function DesignSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl bg-muted p-4">
      <div className="space-y-1">
        <h3 className="text-eyebrow">{title}</h3>
        {description ? (
          <p className="text-[12px] leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function SegmentedControl<T extends string>({
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
        'inline-flex w-full items-center rounded-xl bg-black/[0.04] p-0.5 dark:bg-white/[0.06]',
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
                ? 'bg-background text-foreground shadow-sm shadow-black/[0.04]'
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

// ─── Color Field (Squarespace / Framer style) ─────────────────────

interface ColorFieldProps {
  value: string;
  onChange: (color: string) => void;
  label: string;
}

function ColorField({ value, onChange, label }: ColorFieldProps) {
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
    <div className="flex items-center justify-between gap-3 rounded-xl bg-background px-3 py-2.5">
      <Label htmlFor={fieldId} className="shrink-0 text-[12px] font-medium text-muted-foreground">
        {label}
      </Label>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={fieldId}
            type="button"
            className={cn(
              'group flex h-8 min-w-[7.5rem] items-center gap-2 rounded-lg bg-muted/60 px-1.5 pr-2.5 text-left transition-colors',
              'hover:bg-muted',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
              open && 'bg-muted'
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
            <ChevronDown
              className={cn(
                'h-3 w-3 shrink-0 text-muted-foreground transition-transform',
                open && 'rotate-180'
              )}
              aria-hidden
            />
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
                      <Check
                        className={cn(
                          'h-3 w-3',
                          isLightColor(color) ? 'text-foreground' : 'text-white'
                        )}
                        strokeWidth={3}
                        aria-hidden
                      />
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
              >
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-background/90 shadow-sm">
                  <Pipette className="h-2.5 w-2.5 text-foreground" />
                </span>
              </button>
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

// ─── Header Layout Selector ───────────────────────────────────────

interface HeaderLayoutSelectorProps {
  alignment: ResumeHeaderAlignment;
  photoLayout: ResumeHeaderPhotoLayout;
  showPhoto: boolean;
  onAlignmentChange: (alignment: ResumeHeaderAlignment) => void;
  onPhotoLayoutChange: (layout: ResumeHeaderPhotoLayout) => void;
}

function HeaderLayoutSelector({
  alignment,
  photoLayout,
  showPhoto,
  onAlignmentChange,
  onPhotoLayoutChange,
}: HeaderLayoutSelectorProps) {
  const textIcons: Record<ResumeHeaderAlignment, typeof AlignLeft> = {
    left: AlignLeft,
    center: AlignCenter,
    right: AlignRight,
  };
  const photoIcons: Record<ResumeHeaderPhotoLayout, typeof AlignLeft> = {
    'photo-left': AlignLeft,
    'photo-right': AlignRight,
    'photo-above': AlignCenter,
    'photo-above-left': AlignLeft,
  };

  return (
    <div className="space-y-2">
      <Label className="text-[12px] font-medium text-muted-foreground">
        {getHeaderLayoutSectionLabel(showPhoto)}
      </Label>
      {showPhoto ? (
        <div className="grid grid-cols-2 gap-1.5">
          {HEADER_PHOTO_LAYOUT_OPTIONS.map((opt) => {
            const Icon = photoIcons[opt.value];
            const selected = photoLayout === opt.value;
            return (
              <Tooltip key={opt.value}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onPhotoLayoutChange(opt.value)}
                    aria-pressed={selected}
                    aria-label={opt.description}
                    className={cn(
                      'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-2 text-[11px] font-medium transition-colors',
                      selected
                        ? 'bg-foreground text-background'
                        : 'bg-background text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{opt.label}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {opt.description}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      ) : (
        <SegmentedControl
          value={alignment}
          onChange={onAlignmentChange}
          aria-label="Header alignment"
          options={HEADER_TEXT_ALIGNMENT_OPTIONS.map((opt) => ({
            value: opt.value,
            label: opt.label,
            icon: textIcons[opt.value],
          }))}
        />
      )}
    </div>
  );
}

// ─── Photo Size Slider ────────────────────────────────────────────

function PhotoSizeSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (photoSize: number) => void;
}) {
  return (
    <div className="space-y-2.5">
      <Label className="text-[12px] font-medium text-muted-foreground">Photo size</Label>
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full border border-foreground/25 bg-foreground/10"
        />
        <Slider
          size="sm"
          value={value}
          min={PHOTO_SIZE_MIN}
          max={PHOTO_SIZE_MAX}
          step={PHOTO_SIZE_STEP}
          onChange={onChange}
          aria-label="Photo size"
        />
        <span
          aria-hidden
          className="size-4 shrink-0 rounded-full border border-foreground/25 bg-foreground/10"
        />
      </div>
    </div>
  );
}

// ─── Font Dropdown ────────────────────────────────────────────────

function FontFamilySelect({
  value,
  onChange,
  id,
  templateDefault,
}: {
  value: ResumeFontFamily;
  onChange: (font: ResumeFontFamily) => void;
  id?: string;
  templateDefault: ResumeFontFamily;
}) {
  const otherFonts = RESUME_FONT_OPTIONS.filter((font) => font !== templateDefault);

  return (
    <Select value={value} onValueChange={(v) => onChange(v as ResumeFontFamily)}>
      <SelectTrigger
        id={id}
        className="h-8 min-w-0 flex-1 rounded-lg border-border/70 text-[12px]"
        style={{ fontFamily: RESUME_FONT_MAP[value] }}
      >
        <SelectValue placeholder="Select font" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Template default
          </SelectLabel>
          <SelectItem value={templateDefault}>
            <span style={{ fontFamily: RESUME_FONT_MAP[templateDefault] }}>
              {RESUME_FONT_LABELS[templateDefault]}
            </span>
          </SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            All fonts
          </SelectLabel>
          {otherFonts.map((font) => (
            <SelectItem key={font} value={font}>
              <span style={{ fontFamily: RESUME_FONT_MAP[font] }}>{RESUME_FONT_LABELS[font]}</span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function FontSizeStepper({
  value,
  min,
  max,
  step = 1,
  onChange,
  'aria-label': ariaLabel,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (size: number) => void;
  'aria-label': string;
}) {
  const decimals = step < 1 ? 1 : 0;
  const display = Number(value.toFixed(decimals));
  const canDecrease = value > min;
  const canIncrease = value < max;

  const bump = (delta: number) => {
    const next = Math.min(max, Math.max(min, Number((value + delta).toFixed(decimals))));
    if (next !== value) onChange(next);
  };

  return (
    <div
      className="inline-flex h-8 shrink-0 items-center overflow-hidden rounded-lg border border-border/70 bg-background"
      role="group"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className="flex h-8 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-40"
        onClick={() => bump(-step)}
        disabled={!canDecrease}
        aria-label={`Decrease ${ariaLabel}`}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-[2.75rem] select-none border-x border-border/70 px-1 text-center text-[11px] tabular-nums text-foreground">
        {display}
      </span>
      <button
        type="button"
        className="flex h-8 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-40"
        onClick={() => bump(step)}
        disabled={!canIncrease}
        aria-label={`Increase ${ariaLabel}`}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function TextStyleToggleGroup({
  value,
  onChange,
  label,
}: {
  value: ResumeTextStyle;
  onChange: (next: ResumeTextStyle) => void;
  label: string;
}) {
  const toggles = [
    { key: 'bold' as const, icon: Bold, aria: 'Bold' },
    { key: 'italic' as const, icon: Italic, aria: 'Italic' },
    { key: 'underline' as const, icon: Underline, aria: 'Underline' },
  ];

  return (
    <div
      className="inline-flex h-8 shrink-0 items-center overflow-hidden rounded-lg border border-border/70 bg-background"
      role="group"
      aria-label={`${label} style`}
    >
      {toggles.map(({ key, icon: Icon, aria }, index) => {
        const active = value[key];
        return (
          <button
            key={key}
            type="button"
            className={cn(
              'flex h-8 w-7 items-center justify-center transition-colors',
              index > 0 && 'border-l border-border/70',
              active
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
            )}
            aria-pressed={active}
            aria-label={`${aria} ${label}`}
            onClick={() => onChange({ ...value, [key]: !active })}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}

function TypographyRoleRow({
  label,
  fontId,
  role,
  templateId,
  font,
  onFontChange,
  size,
  onSizeChange,
  sizeMin,
  sizeMax,
  sizeStep = 1,
  style,
  onStyleChange,
}: {
  label: string;
  fontId: string;
  role: ResumeTypographyRole;
  templateId: ResumeDesign['templateId'];
  font: ResumeFontFamily;
  onFontChange: (font: ResumeFontFamily) => void;
  size: number;
  onSizeChange: (size: number) => void;
  sizeMin: number;
  sizeMax: number;
  sizeStep?: number;
  style: ResumeTextStyle;
  onStyleChange: (style: ResumeTextStyle) => void;
}) {
  const templateDefault = getTemplateDefaultFont(templateId, role);

  return (
    <div className="space-y-2 rounded-xl bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={fontId} className="text-[12px] font-medium text-foreground">
          {label}
        </Label>
        <div className="flex items-center gap-1.5">
          <FontSizeStepper
            value={size}
            min={sizeMin}
            max={sizeMax}
            step={sizeStep}
            onChange={onSizeChange}
            aria-label={`${label} size`}
          />
          <TextStyleToggleGroup value={style} onChange={onStyleChange} label={label} />
        </div>
      </div>
      <FontFamilySelect
        id={fontId}
        value={font}
        onChange={onFontChange}
        templateDefault={templateDefault}
      />
    </div>
  );
}

// ─── Divider Preview / Selector ───────────────────────────────────

function DividerPreview({ style }: { style: ResumeDividerStyle }) {
  const common = 'w-7 h-[2px]';
  switch (style) {
    case 'line':
      return <span className={cn(common, 'bg-current')} />;
    case 'double':
      return (
        <span className="flex w-7 flex-col gap-[2px]">
          <span className="h-[1px] bg-current" />
          <span className="h-[1px] bg-current" />
        </span>
      );
    case 'thick':
      return <span className="h-[3px] w-7 bg-current" />;
    case 'dashed':
      return (
        <span className={cn(common, 'border-t-2 border-dashed border-current bg-transparent')} />
      );
    case 'dotted':
      return (
        <span className={cn(common, 'border-t-2 border-dotted border-current bg-transparent')} />
      );
    case 'none':
      return <Minus className="h-3 w-3" />;
    default:
      return null;
  }
}

function DividerStyleSelector({
  value,
  onChange,
}: {
  value: ResumeDividerStyle;
  onChange: (value: ResumeDividerStyle) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-[12px] font-medium text-muted-foreground">Section divider</Label>
      <div role="radiogroup" aria-label="Section divider" className="grid grid-cols-3 gap-1.5">
        {DIVIDER_STYLE_OPTIONS.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(opt.value)}
              className={cn(
                'flex h-12 flex-col items-center justify-center gap-1.5 rounded-lg transition-colors',
                selected
                  ? 'bg-foreground text-background'
                  : 'bg-background text-muted-foreground hover:text-foreground'
              )}
            >
              <DividerPreview style={opt.value} />
              <span className="text-[10px] font-medium leading-none">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Justify All Button ───────────────────────────────────────────

function JustifyAllButton() {
  const { allJustified, justifyAll: handleJustifyAll } = useJustifyAll();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-[12px] font-medium transition-colors',
            allJustified
              ? 'cursor-default bg-background/60 text-muted-foreground'
              : 'bg-background text-foreground hover:bg-background/80'
          )}
          onClick={handleJustifyAll}
          disabled={allJustified}
        >
          {allJustified ? (
            <AlignJustify className="h-3.5 w-3.5" />
          ) : (
            <AlignLeft className="h-3.5 w-3.5" />
          )}
          {allJustified ? 'All justified' : 'Justify all text'}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {allJustified
          ? 'All text content is already justified'
          : 'Set justified alignment on all text content'}
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Main Designer Panel (Inline) ─────────────────────────────────

/**
 * DesignerPanel — inline design customization panel.
 * Renders directly within the builder layout (no overlay/backdrop).
 * Changes are auto-saved with debouncing and preview updates are instant.
 */
export function DesignerPanel() {
  const draftProfile = useBuilderStore((s) => s.draftProfile);
  const commitInlineChange = useBuilderStore((s) => s.commitInlineChange);

  const currentDesign: Required<ResumeDesign> = mergeResumeDesign(draftProfile.resumeDesign);

  const [design, setDesign] = useState<Required<ResumeDesign>>(currentDesign);
  const [isSaving, setIsSaving] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const designRef = useRef(design);
  designRef.current = design;

  useEffect(() => {
    setDesign(mergeResumeDesign(draftProfile.resumeDesign));
  }, [draftProfile.resumeDesign]);

  const updateDesign = useCallback(
    (updates: Partial<ResumeDesign>) => {
      const next = { ...designRef.current, ...updates };

      designRef.current = next;
      setDesign(next);

      commitInlineChange({
        resumeDesign: next,
      } as Partial<typeof draftProfile>);

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
        setIsSaving(true);
        try {
          await fetch('/api/profile/resume-design', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(next),
          });
        } catch (err) {
          console.error('Failed to save resume design:', err);
        } finally {
          setIsSaving(false);
        }
      }, 600);
    },
    [commitInlineChange]
  );

  /** Sync photo visibility to a template’s default look (Profile flag, not design JSON). */
  const syncTemplatePhotoDefault = useCallback(
    (templateId: ResumeDesign['templateId']) => {
      const nextShowPhoto = getTemplateDefaultShowPhoto(templateId);
      const previousShowPhoto = Boolean(draftProfile.resumeShowPhoto);
      if (previousShowPhoto === nextShowPhoto) return;

      commitInlineChange({
        resumeShowPhoto: nextShowPhoto,
      } as Partial<typeof draftProfile>);

      void fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeShowPhoto: nextShowPhoto }),
      }).catch((err) => {
        console.error('Failed to sync resume photo visibility:', err);
        commitInlineChange({
          resumeShowPhoto: previousShowPhoto,
        } as Partial<typeof draftProfile>);
      });
    },
    [commitInlineChange, draftProfile.resumeShowPhoto]
  );

  const applyTemplateDesign = useCallback(
    (nextDesign: ResumeDesign) => {
      updateDesign(nextDesign);
      syncTemplatePhotoDefault(nextDesign.templateId);
    },
    [updateDesign, syncTemplatePhotoDefault]
  );

  const handleReset = useCallback(() => {
    const templateId = designRef.current.templateId;
    applyTemplateDesign(buildDefaultDesignForTemplate(templateId));
  }, [applyTemplateDesign]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  return (
    <div className="flex h-full flex-col">
      <ResumeFontLoader
        fonts={[
          design.fontFamily,
          design.nameFontFamily,
          design.titleFontFamily,
          design.headingFontFamily,
          design.contactFontFamily,
        ]}
      />

      {/* Header — sits on the elevated panel surface */}
      <div className="sticky top-0 z-20 flex h-12 shrink-0 items-center justify-between border-b border-border/30 bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center gap-2">
          <span className="text-eyebrow">Design</span>
          {isSaving ? <span className="text-[11px] text-muted-foreground">Saving…</span> : null}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={handleReset}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="sr-only">Reset to defaults</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Reset to defaults
          </TooltipContent>
        </Tooltip>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-3 p-4 pb-8">
          {/* Template */}
          <DesignSection
            title="Template"
            description="Switch layouts anytime — your content stays put."
          >
            <div className="grid grid-cols-3 gap-2">
              {getAllResumeTemplates()
                .slice(0, INLINE_TEMPLATE_PREVIEW_COUNT)
                .map((template) => {
                  const selected = getResumeTemplateId(design.templateId) === template.id;
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => {
                        if (selected) return;
                        applyTemplateDesign(
                          buildDesignForTemplateSwitch(design, template.id as ResumeTemplateId)
                        );
                      }}
                      className={cn(
                        'group flex flex-col overflow-hidden rounded-xl border text-left transition-all',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                        selected
                          ? 'border-foreground/80 ring-1 ring-foreground/80'
                          : 'border-border/60 hover:border-border'
                      )}
                      aria-pressed={selected}
                      aria-label={`Use ${template.name} template`}
                    >
                      <div className="relative">
                        <ResumeTemplateLiveThumbnail
                          profile={draftProfile as unknown as PublicProfile}
                          templateId={template.id}
                          currentDesign={design}
                          className="rounded-none border-0 shadow-none"
                        />
                        {selected ? (
                          <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-background shadow-sm">
                            <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden />
                          </span>
                        ) : null}
                      </div>
                      <span
                        className={cn(
                          'truncate px-1.5 py-1.5 text-center text-[10px] font-medium leading-none',
                          selected ? 'text-foreground' : 'text-muted-foreground'
                        )}
                      >
                        {template.name}
                      </span>
                    </button>
                  );
                })}
            </div>
            <ResumeTemplateGallery
              profile={draftProfile as unknown as PublicProfile}
              currentDesign={design}
              currentTemplateId={getResumeTemplateId(design.templateId)}
              previewDataPolicy={TEMPLATE_PREVIEW_IN_BUILDER}
              onSelect={applyTemplateDesign}
            >
              <button
                type="button"
                className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-background text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Browse all templates
              </button>
            </ResumeTemplateGallery>
          </DesignSection>

          {/* Theme */}
          <DesignSection
            title="Theme"
            description="How your resume looks when shared — separate from the app theme."
          >
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-[12px] font-medium text-muted-foreground">Appearance</Label>
                <SegmentedControl
                  value={design.colorTheme}
                  onChange={(colorTheme) => updateDesign({ colorTheme })}
                  aria-label="Resume theme"
                  options={THEME_OPTIONS}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[12px] font-medium text-muted-foreground">Page layout</Label>
                <SegmentedControl
                  value={design.pageLayout}
                  onChange={(pageLayout) => updateDesign({ pageLayout })}
                  aria-label="Resume page layout"
                  options={PAGE_LAYOUT_OPTIONS}
                />
              </div>
            </div>
          </DesignSection>

          {/* Colors */}
          <DesignSection title="Colors">
            <div className="space-y-2">
              <ColorField
                label="Headings"
                value={design.headingColor}
                onChange={(headingColor) => updateDesign({ headingColor })}
              />
              <ColorField
                label="Accent"
                value={design.accentColor}
                onChange={(accentColor) => updateDesign({ accentColor })}
              />
            </div>
          </DesignSection>

          {/* Typography */}
          <DesignSection title="Typography">
            <div className="space-y-2">
              <TypographyRoleRow
                label="Name"
                fontId="design-font-name"
                role="name"
                templateId={design.templateId}
                font={design.nameFontFamily}
                onFontChange={(nameFontFamily) => updateDesign({ nameFontFamily })}
                size={design.nameFontSize}
                onSizeChange={(nameFontSize) => updateDesign({ nameFontSize })}
                sizeMin={16}
                sizeMax={48}
                style={design.nameStyle}
                onStyleChange={(nameStyle) => updateDesign({ nameStyle })}
              />

              <TypographyRoleRow
                label="Title"
                fontId="design-font-title"
                role="title"
                templateId={design.templateId}
                font={design.titleFontFamily}
                onFontChange={(titleFontFamily) => updateDesign({ titleFontFamily })}
                size={design.titleFontSize}
                onSizeChange={(titleFontSize) => updateDesign({ titleFontSize })}
                sizeMin={10}
                sizeMax={24}
                style={design.titleStyle}
                onStyleChange={(titleStyle) => updateDesign({ titleStyle })}
              />

              <TypographyRoleRow
                label="Headings"
                fontId="design-font-heading"
                role="heading"
                templateId={design.templateId}
                font={design.headingFontFamily}
                onFontChange={(headingFontFamily) => updateDesign({ headingFontFamily })}
                size={design.headingFontSize}
                onSizeChange={(headingFontSize) => updateDesign({ headingFontSize })}
                sizeMin={9}
                sizeMax={18}
                sizeStep={0.5}
                style={design.headingStyle}
                onStyleChange={(headingStyle) => updateDesign({ headingStyle })}
              />

              <TypographyRoleRow
                label="Contact"
                fontId="design-font-contact"
                role="contact"
                templateId={design.templateId}
                font={design.contactFontFamily}
                onFontChange={(contactFontFamily) => updateDesign({ contactFontFamily })}
                size={design.contactFontSize}
                onSizeChange={(contactFontSize) => updateDesign({ contactFontSize })}
                sizeMin={9}
                sizeMax={18}
                sizeStep={0.5}
                style={design.contactStyle}
                onStyleChange={(contactStyle) => updateDesign({ contactStyle })}
              />

              <TypographyRoleRow
                label="Body"
                fontId="design-font-body"
                role="body"
                templateId={design.templateId}
                font={design.fontFamily}
                onFontChange={(fontFamily) => updateDesign({ fontFamily })}
                size={design.fontSize}
                onSizeChange={(fontSize) => updateDesign({ fontSize })}
                sizeMin={10}
                sizeMax={16}
                sizeStep={0.5}
                style={design.bodyStyle}
                onStyleChange={(bodyStyle) => updateDesign({ bodyStyle })}
              />
            </div>
          </DesignSection>

          {/* Layout */}
          <DesignSection title="Layout">
            <div className="space-y-4">
              <HeaderLayoutSelector
                alignment={design.headerAlignment}
                photoLayout={design.headerPhotoLayout}
                showPhoto={Boolean(draftProfile.resumeShowPhoto && draftProfile.avatarUrl)}
                onAlignmentChange={(headerAlignment) => updateDesign({ headerAlignment })}
                onPhotoLayoutChange={(headerPhotoLayout) => updateDesign({ headerPhotoLayout })}
              />

              {Boolean(draftProfile.resumeShowPhoto && draftProfile.avatarUrl) && (
                <PhotoSizeSlider
                  value={design.photoSize}
                  onChange={(photoSize) => updateDesign({ photoSize })}
                />
              )}

              <DividerStyleSelector
                value={design.dividerStyle}
                onChange={(dividerStyle) => updateDesign({ dividerStyle })}
              />

              <div className="space-y-2">
                <Label className="text-[12px] font-medium text-muted-foreground">Spacing</Label>
                <SegmentedControl
                  value={design.density}
                  onChange={(density) => updateDesign({ density })}
                  aria-label="Spacing density"
                  options={DENSITY_OPTIONS.map((opt) => ({
                    value: opt.value,
                    label: opt.label,
                  }))}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[12px] font-medium text-muted-foreground">
                  Text alignment
                </Label>
                <JustifyAllButton />
              </div>
            </div>
          </DesignSection>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restore defaults
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Restore default design?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will reset colors, typography, emphasis, alignment, layout, spacing, and
                  photo visibility to the defaults for your selected template. Your template will
                  not change. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleReset}>Restore Defaults</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </ScrollArea>
    </div>
  );
}
