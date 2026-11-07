'use client';

import { Check, Eye, EyeOff } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { notifyProfileUpdated } from '@/lib/events';
import {
  calculateTotalExperienceMonths,
  normalizeTotalExperienceOverride,
  resolveTotalExperienceUnits,
  type ExperienceDateRange,
  type ResolvedTotalExperienceUnits,
} from '@/lib/total-experience';
import { cn } from '@/lib/utils';

interface TotalExperienceFieldProps {
  override: string | null | undefined;
  visible?: boolean | null;
  showYears?: boolean | null;
  showMonths?: boolean | null;
  experiences: ExperienceDateRange[];
  /** Live preview while typing. */
  onPreviewChange: (value: string | null) => void;
  /** After a successful save so draft and saved stay in sync. */
  onPersisted: (value: string | null) => void;
  onVisibleChange: (visible: boolean) => void;
  onUnitsChange: (units: ResolvedTotalExperienceUnits) => void;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function experienceParts(value: string | null | undefined, fallbackMonths: number | null) {
  if (value?.trim()) {
    const years = Number(value.match(/(\d+)\s*\+?\s*(?:yr|year)/i)?.[1] ?? 0);
    const months = Number(value.match(/(\d+)\s*(?:mo|month)/i)?.[1] ?? 0);
    return { years: String(years), months: String(months) };
  }

  if (fallbackMonths == null) return { years: '', months: '' };
  return {
    years: String(Math.floor(fallbackMonths / 12)),
    months: String(fallbackMonths % 12),
  };
}

function toNumber(value: string, maximum?: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(Math.floor(parsed), maximum ?? Number.MAX_SAFE_INTEGER);
}

function formatExperienceParts(years: number, months: number): string | null {
  const parts = [
    years > 0 ? `${years} ${years === 1 ? 'yr' : 'yrs'}` : null,
    months > 0 ? `${months} ${months === 1 ? 'mo' : 'mos'}` : null,
  ].filter((part): part is string => part !== null);
  return parts.join(' ') || null;
}

export function TotalExperienceField({
  override,
  visible = true,
  showMonths,
  experiences,
  onPreviewChange,
  onPersisted,
  onVisibleChange,
  onUnitsChange,
}: TotalExperienceFieldProps) {
  const isVisible = visible !== false;
  const calculatedMonths = useMemo(
    () => calculateTotalExperienceMonths(experiences),
    [experiences]
  );
  const resolvedUnits = useMemo(
    () => resolveTotalExperienceUnits(calculatedMonths, { showMonths }),
    [calculatedMonths, showMonths]
  );
  const [units, setUnits] = useState(resolvedUnits);
  const unitsSavePendingRef = useRef(false);
  const includeMonths = units.showMonths;
  const resolvedParts = useMemo(
    () => experienceParts(override, calculatedMonths),
    [calculatedMonths, override]
  );
  const [years, setYears] = useState(resolvedParts.years);
  const [months, setMonths] = useState(resolvedParts.months);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const persistSeq = useRef(0);
  const visibilitySeq = useRef(0);
  const unitsSeq = useRef(0);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleRef = useRef(isVisible);
  visibleRef.current = isVisible;
  const unitsRef = useRef(units);
  unitsRef.current = units;

  useEffect(() => {
    if (!editing) {
      setYears(resolvedParts.years);
      setMonths(resolvedParts.months);
    }
  }, [editing, resolvedParts]);

  useEffect(() => {
    if (!unitsSavePendingRef.current) {
      setUnits(resolvedUnits);
    }
  }, [resolvedUnits]);

  const persistValue = async (nextYears = years, nextMonths = months) => {
    const normalizedYears = toNumber(nextYears);
    const normalizedMonths = toNumber(nextMonths, 11);
    const raw = formatExperienceParts(normalizedYears, normalizedMonths);
    const next = normalizeTotalExperienceOverride(raw, experiences, units);
    const current = override?.trim() || null;
    if (next === current) {
      setYears(String(normalizedYears));
      setMonths(String(normalizedMonths));
      // Preview updates draft immediately; keep saved in sync so the header
      // does not sit on "Unsaved changes" with no save control.
      onPersisted(current);
      return;
    }

    const seq = ++persistSeq.current;
    setError(null);
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totalExperience: next, syncAvatarToClerk: false }),
      });
      if (!response.ok) {
        throw new Error('Could not save');
      }
      if (seq !== persistSeq.current) return;
      onPersisted(next);
      notifyProfileUpdated();
      setYears(String(normalizedYears));
      setMonths(String(normalizedMonths));
    } catch (err) {
      if (isAbortError(err) || seq !== persistSeq.current) return;
      setError('Could not save');
      setYears(resolvedParts.years);
      setMonths(resolvedParts.months);
      onPreviewChange(override ?? null);
    }
  };

  const flushPersist = (nextYears = years, nextMonths = months) => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    void persistValue(nextYears, nextMonths);
  };

  const schedulePersist = (nextYears: string, nextMonths: string) => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      void persistValue(nextYears, nextMonths);
    }, 400);
  };

  useEffect(
    () => () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    },
    []
  );

  const updateValue = (kind: 'years' | 'months', value: string) => {
    const numericValue = value.replace(/\D/g, '');
    const nextYears = kind === 'years' ? numericValue : years;
    const nextMonths = kind === 'months' ? numericValue : months;
    if (kind === 'years') setYears(numericValue);
    else setMonths(numericValue);

    const raw = formatExperienceParts(toNumber(nextYears), toNumber(nextMonths, 11));
    onPreviewChange(raw);
    schedulePersist(nextYears, nextMonths);
  };

  const persistVisibility = async (next: boolean) => {
    if (next === visibleRef.current) return;

    const previous = visibleRef.current;
    visibleRef.current = next;
    onVisibleChange(next);
    setError(null);

    const seq = ++visibilitySeq.current;
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totalExperienceVisible: next, syncAvatarToClerk: false }),
      });
      if (!response.ok) {
        throw new Error('Could not save');
      }
      if (seq !== visibilitySeq.current) return;
      notifyProfileUpdated();
    } catch (err) {
      if (isAbortError(err) || seq !== visibilitySeq.current) return;
      visibleRef.current = previous;
      onVisibleChange(previous);
      setError('Could not save');
    }
  };

  const persistUnits = async (next: ResolvedTotalExperienceUnits) => {
    const current = unitsRef.current;
    if (next.showYears === current.showYears && next.showMonths === current.showMonths) return;

    unitsRef.current = next;
    unitsSavePendingRef.current = true;
    setUnits(next);
    onUnitsChange(next);
    setError(null);

    const seq = ++unitsSeq.current;
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          totalExperienceShowYears: next.showYears,
          totalExperienceShowMonths: next.showMonths,
          syncAvatarToClerk: false,
        }),
      });
      if (!response.ok) {
        throw new Error('Could not save');
      }
      if (seq !== unitsSeq.current) return;
      unitsSavePendingRef.current = false;
      notifyProfileUpdated();
    } catch (err) {
      if (isAbortError(err) || seq !== unitsSeq.current) return;
      unitsSavePendingRef.current = false;
      unitsRef.current = current;
      setUnits(current);
      onUnitsChange(current);
      setError('Could not save');
    }
  };

  return (
    <div className="inline-block max-w-full">
      <div className="inline-flex max-w-full flex-wrap items-center gap-2">
        <span className="shrink-0 text-xs font-medium text-muted-foreground">Total experience</span>
        <div
          className={cn(
            'flex h-7 items-center px-0.5 transition-colors',
            !isVisible && 'opacity-50'
          )}
        >
          <div className="flex h-6 items-center rounded px-1 transition-colors focus-within:bg-background focus-within:shadow-sm">
            <label htmlFor="total-experience" className="sr-only">
              Years of experience
            </label>
            <input
              id="total-experience"
              value={years}
              placeholder="0"
              maxLength={3}
              autoComplete="off"
              spellCheck={false}
              inputMode="numeric"
              pattern="[0-9]*"
              aria-invalid={error ? true : undefined}
              aria-label="Years of experience"
              className="w-7 bg-transparent text-center text-sm font-medium tabular-nums outline-none placeholder:text-muted-foreground/50"
              onFocus={() => {
                setEditing(true);
                setError(null);
              }}
              onChange={(event) => updateValue('years', event.target.value)}
              onBlur={() => {
                setEditing(false);
                flushPersist();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
            />
            <span className="text-[11px] font-medium text-muted-foreground">yr</span>
          </div>
          <div className="mx-1 h-3.5 w-px bg-border/70" />
          <div className="flex h-6 items-center rounded px-1 transition-colors focus-within:bg-background focus-within:shadow-sm">
            <label htmlFor="total-experience-months" className="sr-only">
              Additional months of experience
            </label>
            <input
              id="total-experience-months"
              value={months}
              placeholder="0"
              maxLength={2}
              autoComplete="off"
              spellCheck={false}
              inputMode="numeric"
              pattern="[0-9]*"
              aria-invalid={error ? true : undefined}
              aria-label="Additional months of experience"
              className="w-7 bg-transparent text-center text-sm font-medium tabular-nums outline-none placeholder:text-muted-foreground/50"
              onFocus={() => {
                setEditing(true);
                setError(null);
              }}
              onChange={(event) => updateValue('months', event.target.value)}
              onBlur={() => {
                setEditing(false);
                flushPersist();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
            />
            <span className="text-[11px] font-medium text-muted-foreground">mo</span>
          </div>
        </div>
        <button
          type="button"
          role="checkbox"
          aria-checked={includeMonths}
          className={cn(
            'flex h-7 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
            includeMonths ? 'text-foreground' : ''
          )}
          onClick={() => void persistUnits({ showYears: true, showMonths: !includeMonths })}
        >
          <span
            aria-hidden="true"
            className={cn(
              'grid h-3.5 w-3.5 place-items-center rounded-[4px] border transition-colors',
              includeMonths ? 'border-foreground bg-foreground text-background' : 'border-border'
            )}
          >
            <Check
              className={cn(
                'h-2.5 w-2.5 transition-opacity',
                includeMonths ? 'opacity-100' : 'opacity-0'
              )}
              strokeWidth={3}
            />
          </span>
          Show months
        </button>
        <button
          type="button"
          className="builder-quiet-btn h-7 w-7"
          onClick={() => void persistVisibility(!isVisible)}
          title={isVisible ? 'Hide from resume' : 'Show on resume'}
          aria-label={isVisible ? 'Hide total experience' : 'Show total experience'}
          aria-pressed={isVisible}
        >
          {isVisible ? (
            <Eye className="h-4 w-4" />
          ) : (
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </div>
      {error ? <p className="mt-1 text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}
