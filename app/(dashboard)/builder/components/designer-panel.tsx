'use client';

import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronLeft,
  ChevronRight,
  Italic,
  Minus,
  Pencil,
  RotateCcw,
  Underline,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

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
import { ResumeColorThemeSwitch } from '@/components/resume-color-theme-switch';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  getTemplateDefaultFont,
  mergeResumeDesign,
  type ResumeTypographyRole,
} from '@/lib/resume-design';
import {
  RESUME_FONT_LABELS,
  RESUME_FONT_MAP,
  RESUME_FONT_OPTIONS,
  type PublicProfile,
  type ResumeDensity,
  type ResumeDesign,
  type ResumeDividerStyle,
  type ResumeFontFamily,
  type ResumeHeaderAlignment,
  type ResumeTextStyle,
} from '@/types';

import { ResumeFontLoader } from '@/app/u/[handle]/views/resume-font-loader';
import {
  buildDefaultDesignForTemplate,
  buildDesignForTemplateSwitch,
  getAllResumeTemplates,
  getResumeTemplateId,
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
  '#0f172a', // Deep Ink
  '#1e293b', // Charcoal Slate
  '#334155', // Cool Slate
  '#475569', // Pewter Gray
  '#0c4a6e', // Dark Cerulean
  '#1e3a5f', // Classic Navy
  '#1e40af', // Oxford Blue
  '#1d4ed8', // Royal Blue
  '#134e4a', // Deep Teal
  '#065f46', // Evergreen
  '#3730a3', // Deep Indigo
  '#4c1d95', // Royal Purple
  '#7f1d1d', // Dark Maroon
  '#831843', // Burgundy
  '#78350f', // Rich Espresso
  '#92400e', // Dark Amber
] as const;

const DIVIDER_STYLE_OPTIONS: { value: ResumeDividerStyle; label: string }[] = [
  { value: 'line', label: 'Solid Line' },
  { value: 'double', label: 'Double Line' },
  { value: 'thick', label: 'Thick Line' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
  { value: 'none', label: 'None' },
];

const DENSITY_OPTIONS: { value: ResumeDensity; label: string; description: string }[] = [
  { value: 'compact', label: 'Compact', description: 'Tighter spacing, more content per page' },
  { value: 'normal', label: 'Normal', description: 'Balanced spacing for readability' },
  { value: 'relaxed', label: 'Relaxed', description: 'More whitespace, easier to scan' },
];

// ─── Color Picker ─────────────────────────────────────────────────

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label: string;
}

function ColorPicker({ value, onChange, label }: ColorPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className={cn(
              'h-6 w-6 rounded-full border-2 transition-all hover:scale-110',
              value === color ? 'border-foreground ring-1 ring-foreground/20' : 'border-transparent'
            )}
            style={{ backgroundColor: color }}
            onClick={() => onChange(color)}
            aria-label={`Select color ${color}`}
          />
        ))}
        {/* Custom color picker trigger — rainbow wheel + pencil */}
        <button
          type="button"
          className={cn(
            'relative flex h-6 w-6 items-center justify-center rounded-full transition-all hover:scale-110',
            !PRESET_COLORS.includes(value as (typeof PRESET_COLORS)[number]) &&
              'ring-2 ring-foreground ring-offset-1 ring-offset-background'
          )}
          style={{
            background: !PRESET_COLORS.includes(value as (typeof PRESET_COLORS)[number])
              ? value
              : 'conic-gradient(#ef4444, #f59e0b, #22c55e, #3b82f6, #8b5cf6, #ec4899, #ef4444)',
          }}
          onClick={() => inputRef.current?.click()}
          aria-label="Pick custom color"
        >
          <Pencil className="h-2.5 w-2.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]" />
        </button>
        <input
          ref={inputRef}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="invisible absolute h-0 w-0"
          aria-hidden
        />
      </div>
    </div>
  );
}

// ─── Alignment Selector ───────────────────────────────────────────

interface AlignmentSelectorProps {
  value: ResumeHeaderAlignment;
  onChange: (alignment: ResumeHeaderAlignment) => void;
}

function AlignmentSelector({ value, onChange }: AlignmentSelectorProps) {
  const options: { value: ResumeHeaderAlignment; icon: typeof AlignLeft; label: string }[] = [
    { value: 'left', icon: AlignLeft, label: 'Left' },
    { value: 'center', icon: AlignCenter, label: 'Center' },
    { value: 'right', icon: AlignRight, label: 'Right' },
  ];

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-muted-foreground">Header Alignment</Label>
      <div className="flex gap-1">
        {options.map((opt) => {
          const Icon = opt.icon;
          return (
            <Button
              key={opt.value}
              type="button"
              variant={value === opt.value ? 'default' : 'outline'}
              size="sm"
              className="h-8 flex-1 gap-1.5 px-2 text-xs"
              onClick={() => onChange(opt.value)}
            >
              <Icon className="h-3.5 w-3.5" />
              {opt.label}
            </Button>
          );
        })}
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
  /** Template-recommended font — pinned at the top of the list */
  templateDefault: ResumeFontFamily;
}) {
  const otherFonts = RESUME_FONT_OPTIONS.filter((font) => font !== templateDefault);

  return (
    <Select value={value} onValueChange={(v) => onChange(v as ResumeFontFamily)}>
      <SelectTrigger
        id={id}
        className="h-9 min-w-0 flex-1 text-sm"
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

/** Discrete size control — clearer and more precise than a range slider. */
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
      className="inline-flex h-9 shrink-0 items-center overflow-hidden rounded-md border border-input bg-background"
      role="group"
      aria-label={ariaLabel}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-9 w-8 rounded-none px-0 text-muted-foreground hover:text-foreground"
        onClick={() => bump(-step)}
        disabled={!canDecrease}
        aria-label={`Decrease ${ariaLabel}`}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </Button>
      <span className="min-w-[3.25rem] select-none border-x border-input px-1 text-center text-xs tabular-nums text-foreground">
        {display}px
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-9 w-8 rounded-none px-0 text-muted-foreground hover:text-foreground"
        onClick={() => bump(step)}
        disabled={!canIncrease}
        aria-label={`Increase ${ariaLabel}`}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
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
      className="inline-flex h-9 shrink-0 items-center overflow-hidden rounded-md border border-input bg-background"
      role="group"
      aria-label={`${label} style`}
    >
      {toggles.map(({ key, icon: Icon, aria }, index) => {
        const active = value[key];
        return (
          <Button
            key={key}
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              'h-9 w-8 rounded-none px-0',
              index > 0 && 'border-l border-input',
              active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
            aria-pressed={active}
            aria-label={`${aria} ${label}`}
            onClick={() => onChange({ ...value, [key]: !active })}
          >
            <Icon className="h-3.5 w-3.5" />
          </Button>
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
    <div className="space-y-1.5">
      <Label htmlFor={fontId} className="text-xs font-medium text-foreground">
        {label}
      </Label>
      <div className="flex flex-wrap items-center gap-2">
        <FontFamilySelect
          id={fontId}
          value={font}
          onChange={onFontChange}
          templateDefault={templateDefault}
        />
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
  );
}

// ─── Divider Preview ──────────────────────────────────────────────
function DividerPreview({ style }: { style: ResumeDividerStyle }) {
  const common = 'w-8 h-[2px]';
  switch (style) {
    case 'line':
      return <span className={cn(common, 'bg-foreground/60')} />;
    case 'double':
      return (
        <span className="flex w-8 flex-col gap-[2px]">
          <span className="h-[1px] bg-foreground/60" />
          <span className="h-[1px] bg-foreground/60" />
        </span>
      );
    case 'thick':
      return <span className={cn('w-8', 'h-[3px] bg-foreground/60')} />;
    case 'dashed':
      return <span className={cn(common, 'border-t-2 border-dashed border-foreground/60')} />;
    case 'dotted':
      return <span className={cn(common, 'border-t-2 border-dotted border-foreground/60')} />;
    case 'none':
      return <Minus className="h-3 w-3 text-muted-foreground" />;
    default:
      return null;
  }
}

// ─── Justify All Button ───────────────────────────────────────────

function JustifyAllButton() {
  const { allJustified, justifyAll: handleJustifyAll } = useJustifyAll();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            'h-8 w-full gap-1.5 text-xs transition-colors',
            allJustified
              ? 'cursor-default border-primary/30 bg-primary/10 text-primary'
              : 'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20'
          )}
          onClick={handleJustifyAll}
          disabled={allJustified}
        >
          {allJustified ? (
            <AlignJustify className="h-3.5 w-3.5" />
          ) : (
            <AlignLeft className="h-3.5 w-3.5" />
          )}
          {allJustified ? 'All Justified' : 'Justify All'}
        </Button>
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

  // Sync local state when store changes externally
  useEffect(() => {
    setDesign(mergeResumeDesign(draftProfile.resumeDesign));
  }, [draftProfile.resumeDesign]);

  // Auto-save debounced: update the store immediately for preview, persist to API after 600ms
  const updateDesign = useCallback(
    (updates: Partial<ResumeDesign>) => {
      const next = { ...designRef.current, ...updates };

      // Update local state
      designRef.current = next;
      setDesign(next);

      // Update store for instant preview (outside setState to avoid render-phase side effects)
      commitInlineChange({
        resumeDesign: next,
      } as Partial<typeof draftProfile>);

      // Debounced API save
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

  const handleReset = useCallback(() => {
    updateDesign(buildDefaultDesignForTemplate(designRef.current.templateId));
  }, [updateDesign]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Load selected fonts for live previews in the picker */}
      <ResumeFontLoader
        fonts={[
          design.fontFamily,
          design.nameFontFamily,
          design.titleFontFamily,
          design.headingFontFamily,
          design.contactFontFamily,
        ]}
      />

      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 px-5">
        <span className="text-eyebrow">Design</span>
        <div className="flex items-center gap-1">
          {isSaving && <span className="mr-1 text-[11px] text-muted-foreground">Saving…</span>}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleReset}>
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="sr-only">Reset to defaults</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Reset to defaults
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Scrollable Content */}
      <ScrollArea className="flex-1">
        <div className="space-y-6 p-5">
          {/* ── Section: Template ── */}
          <section className="space-y-3">
            <h3 className="text-eyebrow">Template</h3>
            <p className="text-xs text-muted-foreground">
              Switch layouts anytime — your content stays the same.
            </p>
            <div className="mx-auto grid w-[88%] grid-cols-3 gap-3">
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
                        updateDesign(
                          buildDesignForTemplateSwitch(design, template.id as ResumeTemplateId)
                        );
                      }}
                      className={cn(
                        'group flex flex-col overflow-hidden rounded-lg border text-left transition-all',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                        selected
                          ? 'border-foreground ring-1 ring-foreground'
                          : 'border-border/70 hover:border-foreground/25'
                      )}
                      aria-pressed={selected}
                      aria-label={`Use ${template.name} template`}
                    >
                      <ResumeTemplateLiveThumbnail
                        profile={draftProfile as unknown as PublicProfile}
                        templateId={template.id}
                        currentDesign={design}
                        className="rounded-none border-0 shadow-none"
                      />
                      <span
                        className={cn(
                          'truncate px-1 py-1.5 text-center text-[10px] font-medium leading-none',
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
              onSelect={updateDesign}
            />
          </section>

          <Separator />

          {/* ── Section: Theme ── */}
          <section className="space-y-3">
            <h3 className="text-eyebrow">Theme</h3>
            <p className="text-xs text-muted-foreground">
              Controls how your resume looks when shared — independent of the Follio app theme.
            </p>
            <ResumeColorThemeSwitch
              value={design.colorTheme}
              onChange={(colorTheme) => updateDesign({ colorTheme })}
            />
          </section>

          <Separator />

          {/* ── Section: Colors ── */}
          <section className="space-y-4">
            <h3 className="text-eyebrow">Colors</h3>

            <ColorPicker
              label="Heading Color"
              value={design.headingColor}
              onChange={(headingColor) => updateDesign({ headingColor })}
            />

            <ColorPicker
              label="Accent Color (lines, bullets)"
              value={design.accentColor}
              onChange={(accentColor) => updateDesign({ accentColor })}
            />
          </section>

          <Separator />

          {/* ── Section: Typography ── */}
          <section className="space-y-4">
            <h3 className="text-eyebrow">Typography</h3>

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
          </section>

          <Separator />

          {/* ── Section: Layout ── */}
          <section className="space-y-4">
            <h3 className="text-eyebrow">Layout</h3>

            <AlignmentSelector
              value={design.headerAlignment}
              onChange={(headerAlignment) => updateDesign({ headerAlignment })}
            />

            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Section Divider</Label>
              <Select
                value={design.dividerStyle}
                onValueChange={(v) => updateDesign({ dividerStyle: v as ResumeDividerStyle })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIVIDER_STYLE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      <span className="flex items-center gap-2">
                        <DividerPreview style={opt.value} />
                        {opt.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Spacing</Label>
              <div className="flex gap-1">
                {DENSITY_OPTIONS.map((opt) => (
                  <Tooltip key={opt.value}>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant={design.density === opt.value ? 'default' : 'outline'}
                        size="sm"
                        className="h-8 flex-1 text-xs"
                        onClick={() => updateDesign({ density: opt.value })}
                      >
                        {opt.label}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      {opt.description}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Text Alignment</Label>
              <JustifyAllButton />
            </div>
          </section>

          <Separator />

          {/* ── Restore Defaults ── */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restore Defaults
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Restore default design?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will reset colors, typography, layout, and spacing to the defaults for your
                  selected template. Your template will not change. This action cannot be undone.
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
