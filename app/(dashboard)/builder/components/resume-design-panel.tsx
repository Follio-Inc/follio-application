'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Minus,
  MoreHorizontal,
  Palette,
  RotateCcw,
  Type,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  RESUME_DESIGN_DEFAULTS,
  RESUME_FONT_LABELS,
  RESUME_FONT_MAP,
  type ResumeDensity,
  type ResumeDesign,
  type ResumeDividerStyle,
  type ResumeFontFamily,
  type ResumeHeaderAlignment,
} from '@/types';

import { ResumeFontLoader } from '@/app/u/[handle]/views/resume-font-loader';

import { useBuilderStore } from './builder-store-provider';

// ─── Constants ────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#000000',
  '#1a1a1a',
  '#374151',
  '#1e40af',
  '#2563eb',
  '#7c3aed',
  '#9333ea',
  '#db2777',
  '#dc2626',
  '#ea580c',
  '#d97706',
  '#059669',
  '#0d9488',
  '#0891b2',
  '#4f46e5',
  '#6d28d9',
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

const FONT_OPTIONS: ResumeFontFamily[] = [
  'georgia',
  'times',
  'garamond',
  'merriweather',
  'inter',
  'roboto',
  'lato',
  'source-sans',
  'open-sans',
  'raleway',
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
        {/* Custom color picker trigger */}
        <button
          type="button"
          className={cn(
            'relative flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all hover:scale-110',
            !PRESET_COLORS.includes(value as (typeof PRESET_COLORS)[number])
              ? 'border-foreground ring-1 ring-foreground/20'
              : 'border-muted-foreground/30'
          )}
          style={{
            backgroundColor: !PRESET_COLORS.includes(value as (typeof PRESET_COLORS)[number])
              ? value
              : undefined,
          }}
          onClick={() => inputRef.current?.click()}
          aria-label="Pick custom color"
        >
          {PRESET_COLORS.includes(value as (typeof PRESET_COLORS)[number]) && (
            <MoreHorizontal className="h-3 w-3 text-muted-foreground" />
          )}
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

// ─── Font Preview ─────────────────────────────────────────────────

function FontPreviewItem({
  font,
  selected,
  onClick,
}: {
  font: ResumeFontFamily;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-all',
        selected
          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
          : 'border-transparent hover:border-border hover:bg-muted/50'
      )}
      onClick={onClick}
    >
      <span className="flex-1 text-sm" style={{ fontFamily: RESUME_FONT_MAP[font] }}>
        {RESUME_FONT_LABELS[font]}
      </span>
      <span className="text-xs text-muted-foreground" style={{ fontFamily: RESUME_FONT_MAP[font] }}>
        Aa
      </span>
    </button>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────

interface ResumeDesignPanelProps {
  open: boolean;
  onCloseAction: () => void;
}

export function ResumeDesignPanel({ open, onCloseAction }: ResumeDesignPanelProps) {
  const draftProfile = useBuilderStore((s) => s.draftProfile);
  const commitInlineChange = useBuilderStore((s) => s.commitInlineChange);

  // Parse current design from profile (or use defaults)
  const currentDesign: Required<ResumeDesign> = {
    ...RESUME_DESIGN_DEFAULTS,
    ...(draftProfile.resumeDesign ?? {}),
  };

  const [design, setDesign] = useState<Required<ResumeDesign>>(currentDesign);
  const [isSaving, setIsSaving] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Sync local state when store changes externally
  useEffect(() => {
    const storeDesign = draftProfile.resumeDesign ?? {};
    setDesign({ ...RESUME_DESIGN_DEFAULTS, ...storeDesign });
  }, [draftProfile.resumeDesign]);

  // Auto-save debounced: update the store immediately for preview, persist to API after 600ms
  const updateDesign = useCallback(
    (updates: Partial<ResumeDesign>) => {
      setDesign((prev) => {
        const next = { ...prev, ...updates };

        // Update store for instant preview
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

        return next;
      });
    },
    [commitInlineChange]
  );

  const handleReset = useCallback(() => {
    updateDesign(RESUME_DESIGN_DEFAULTS);
  }, [updateDesign]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Load the selected font */}
          <ResumeFontLoader fontFamily={design.fontFamily} />

          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
            onClick={onCloseAction}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: -320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -320, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-y-0 left-0 z-50 flex w-80 flex-col border-r border-border bg-background shadow-xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Customize Design</h2>
              </div>
              <div className="flex items-center gap-1">
                {isSaving && (
                  <span className="mr-1 text-[10px] text-muted-foreground">Saving…</span>
                )}
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
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onCloseAction}>
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </Button>
              </div>
            </div>

            {/* Scrollable Content */}
            <ScrollArea className="flex-1">
              <div className="space-y-6 p-4">
                {/* ── Section: Colors ── */}
                <section className="space-y-4">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-foreground">
                    <Palette className="h-3 w-3" />
                    Colors
                  </h3>

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
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-foreground">
                    <Type className="h-3 w-3" />
                    Typography
                  </h3>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">Font Family</Label>
                    <div className="space-y-0.5">
                      {FONT_OPTIONS.map((font) => (
                        <FontPreviewItem
                          key={font}
                          font={font}
                          selected={design.fontFamily === font}
                          onClick={() => updateDesign({ fontFamily: font })}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium text-muted-foreground">Name Size</Label>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {design.nameFontSize}px
                      </span>
                    </div>
                    <Slider
                      value={design.nameFontSize}
                      min={20}
                      max={40}
                      step={1}
                      onChange={(nameFontSize) => updateDesign({ nameFontSize })}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium text-muted-foreground">
                        Body Font Size
                      </Label>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {design.fontSize}px
                      </span>
                    </div>
                    <Slider
                      value={design.fontSize}
                      min={10}
                      max={16}
                      step={0.5}
                      onChange={(fontSize) => updateDesign({ fontSize })}
                    />
                  </div>
                </section>

                <Separator />

                {/* ── Section: Layout ── */}
                <section className="space-y-4">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-foreground">
                    <AlignCenter className="h-3 w-3" />
                    Layout
                  </h3>

                  <AlignmentSelector
                    value={design.headerAlignment}
                    onChange={(headerAlignment) => updateDesign({ headerAlignment })}
                  />

                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Section Divider
                    </Label>
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
                </section>
              </div>
            </ScrollArea>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Divider Preview Icon ─────────────────────────────────────────

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
