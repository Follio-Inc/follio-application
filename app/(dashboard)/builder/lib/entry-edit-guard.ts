'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** Imperative handle registered by focused entry editors with the parent Back control. */
export type EntryEditGuard = {
  hasUnsavedChanges: () => boolean;
  requestAttention: () => void;
};

export type RegisterEntryEditGuard = (guard: EntryEditGuard | null) => void;

/** Normalize values so Date objects and empty strings compare stably. */
export function stableFormSnapshot(value: unknown): string {
  return JSON.stringify(value, (_key, current) => {
    if (current instanceof Date) {
      return Number.isNaN(current.getTime()) ? null : current.toISOString();
    }
    if (current === undefined || current === '') {
      return null;
    }
    return current;
  });
}

export function hasEntryFormChanges(current: unknown, baseline: unknown): boolean {
  return stableFormSnapshot(current) !== stableFormSnapshot(baseline);
}

/**
 * Single API for focused entry editors:
 * tracks dirty vs baseline, registers with parent Back, and drives Save/Discard attention.
 */
export function useEntryFormDirty<T>(
  value: T,
  {
    enabled,
    onRegister,
  }: {
    enabled: boolean;
    onRegister?: RegisterEntryEditGuard;
  }
) {
  const baselineRef = useRef(value);
  const [attentionKey, setAttentionKey] = useState(0);
  const actionsRef = useRef<HTMLDivElement>(null);

  const isDirty = useMemo(() => hasEntryFormChanges(value, baselineRef.current), [value]);
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  const resetBaseline = useCallback((next: T) => {
    baselineRef.current = next;
  }, []);

  const getBaseline = useCallback(() => baselineRef.current, []);

  const requestAttention = useCallback(() => {
    const el = actionsRef.current;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('animate-save-attention');
      void el.offsetWidth;
      el.classList.add('animate-save-attention');
    }
    setAttentionKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (!enabled || !onRegister) return;

    onRegister({
      hasUnsavedChanges: () => isDirtyRef.current,
      requestAttention,
    });

    return () => onRegister(null);
  }, [enabled, onRegister, requestAttention]);

  return {
    isDirty,
    resetBaseline,
    getBaseline,
    actionsRef,
    attentionKey,
    requestAttention,
  };
}
