import { RESUME_DESIGN_DEFAULTS, type ResumeColorTheme } from '@/types';

/**
 * Resolve a resume color theme to a concrete light/dark value.
 * For `system`, pass the current OS preference (defaults to light on the server).
 */
export function resolveResumeColorTheme(
  colorTheme: ResumeColorTheme | undefined,
  systemPreference: 'light' | 'dark' = 'light'
): 'light' | 'dark' {
  const theme = colorTheme ?? RESUME_DESIGN_DEFAULTS.colorTheme;
  if (theme === 'dark') return 'dark';
  if (theme === 'light') return 'light';
  return systemPreference;
}
