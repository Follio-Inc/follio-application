'use client';

import { useEffect, useState } from 'react';

import { resolveResumeColorTheme } from '@/lib/resume-color-theme';
import { RESUME_DESIGN_DEFAULTS, type ResumeColorTheme } from '@/types';

/**
 * Resolve a resume's color theme to light/dark, listening for OS changes when set to system.
 */
export function useResolvedResumeColorTheme(
  colorTheme: ResumeColorTheme | undefined
): 'light' | 'dark' {
  const theme = colorTheme ?? RESUME_DESIGN_DEFAULTS.colorTheme;
  const [systemPreference, setSystemPreference] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    if (theme !== 'system') return;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemPreference(mq.matches ? 'dark' : 'light');
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [theme]);

  return resolveResumeColorTheme(theme, systemPreference);
}
