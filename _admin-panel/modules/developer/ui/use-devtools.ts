'use client';

import { useEffect, useState } from 'react';

const SMOKE_STORAGE_KEY = 'follio-devtools-smoke';

export function useSmokeCompletion() {
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SMOKE_STORAGE_KEY);
      if (raw) setDone(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      // ignore
    }
  }, []);

  const mark = (id: string, value: boolean) => {
    setDone((prev) => {
      const next = { ...prev, [id]: value };
      try {
        window.localStorage.setItem(SMOKE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const reset = () => {
    setDone({});
    try {
      window.localStorage.removeItem(SMOKE_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  return { done, mark, reset };
}
