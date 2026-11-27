'use client';

import { Check, Plus, X } from 'lucide-react';
import { useState, type CSSProperties, type KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DEFAULT_HEADING_TAG_COLOR,
  HEADING_TAG_COLOR_IDS,
  HEADING_TAG_SWATCHES,
  MAX_HEADING_TAG_LABEL,
  MAX_HEADING_TAGS,
  canonicalHeadingTagLabel,
  headingTagStyle,
  setHeadingTagColor,
  toggleHeadingTag,
  type HeadingTag,
  type HeadingTagColorId,
  type HeadingTagPreset,
} from '@/lib/heading-tags';
import { cn } from '@/lib/utils';

interface HeadingTagPickerProps {
  value: HeadingTag[];
  onChange: (tags: HeadingTag[]) => void;
  presets: HeadingTagPreset[];
  exclusiveGroups?: string[][];
  label?: string;
  description?: string;
}

function ColorSwatches({
  selected,
  onSelect,
}: {
  selected?: HeadingTagColorId;
  onSelect: (color: HeadingTagColorId) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="listbox" aria-label="Tag color">
      {HEADING_TAG_COLOR_IDS.map((id) => {
        const swatch = HEADING_TAG_SWATCHES[id];
        const isSelected = selected === id;
        return (
          <button
            key={id}
            type="button"
            role="option"
            aria-selected={isSelected}
            aria-label={swatch.label}
            title={swatch.label}
            onClick={() => onSelect(id)}
            className={cn(
              'h-6 w-6 rounded-full border shadow-sm transition-transform',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
              isSelected ? 'scale-110 ring-2 ring-foreground/30' : 'hover:scale-105'
            )}
            style={{
              background: swatch.bg,
              borderColor: swatch.border,
            }}
          >
            {isSelected ? <Check className="mx-auto h-3 w-3" style={{ color: swatch.fg }} /> : null}
          </button>
        );
      })}
    </div>
  );
}

function SelectedChip({
  tag,
  onRemove,
  onColor,
}: {
  tag: HeadingTag;
  onRemove: () => void;
  onColor: (color: HeadingTagColorId) => void;
}) {
  const [open, setOpen] = useState(false);
  const style = headingTagStyle(tag) as CSSProperties;

  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full border py-0.5 pl-2 pr-0.5 text-[11px] font-semibold"
      style={{
        ...style,
        color: 'var(--tag-fg)',
        background: 'var(--tag-bg)',
        borderColor: 'var(--tag-border)',
      }}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="focus-visible:outline-none"
            aria-label={`${tag.label} tag color`}
          >
            {tag.label}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 space-y-3 p-3">
          <p className="text-[11px] font-medium text-muted-foreground">Color</p>
          <ColorSwatches
            selected={tag.color ?? DEFAULT_HEADING_TAG_COLOR}
            onSelect={(color) => {
              onColor(color);
            }}
          />
        </PopoverContent>
      </Popover>
      <button
        type="button"
        className="rounded-full p-0.5 hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        aria-label={`Remove ${tag.label}`}
        onClick={onRemove}
      >
        <X className="h-3 w-3 opacity-60" aria-hidden />
      </button>
    </span>
  );
}

export function HeadingTagPicker({
  value,
  onChange,
  presets,
  exclusiveGroups = [],
  label = 'Heading tags',
  description = 'Shown as a chip beside this title on your resume.',
}: HeadingTagPickerProps) {
  const [draft, setDraft] = useState('');
  const selectedKeys = new Set(value.map((tag) => tag.label.toLowerCase()));
  const atLimit = value.length >= MAX_HEADING_TAGS;

  const addCustom = () => {
    const labelText = canonicalHeadingTagLabel(draft);
    if (!labelText || atLimit) return;
    onChange(toggleHeadingTag(value, { label: labelText }, exclusiveGroups));
    setDraft('');
  };

  const onDraftKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addCustom();
    }
  };

  return (
    <div className="space-y-2">
      <div>
        <Label>{label}</Label>
        <p className="text-[11px] text-muted-foreground">{description}</p>
      </div>

      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <SelectedChip
              key={tag.label}
              tag={tag}
              onRemove={() => onChange(toggleHeadingTag(value, tag.label, exclusiveGroups))}
              onColor={(color) => onChange(setHeadingTagColor(value, tag.label, color))}
            />
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => {
          const selected = selectedKeys.has(preset.label.toLowerCase());
          return (
            <button
              key={preset.label}
              type="button"
              aria-pressed={selected}
              disabled={!selected && atLimit}
              onClick={() => onChange(toggleHeadingTag(value, preset, exclusiveGroups))}
              className={cn(
                'rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                selected
                  ? 'border-foreground/20 bg-muted text-foreground'
                  : 'border-border/80 bg-background text-muted-foreground hover:border-foreground/20 hover:text-foreground',
                !selected && atLimit && 'cursor-not-allowed opacity-40'
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value.slice(0, MAX_HEADING_TAG_LABEL))}
          onKeyDown={onDraftKeyDown}
          placeholder="Add your own"
          disabled={atLimit}
          className="h-8 text-sm"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1 px-2.5"
          onClick={addCustom}
          disabled={atLimit || !draft.trim()}
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>
    </div>
  );
}
