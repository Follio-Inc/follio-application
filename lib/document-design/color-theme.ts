import { DOCUMENT_DESIGN_DEFAULTS, type DocumentColorTheme } from './types';

/**
 * Resolve a document color theme to a concrete light/dark value.
 * For `system`, pass the current OS preference (defaults to light on the server).
 */
export function resolveDocumentColorTheme(
  colorTheme: DocumentColorTheme | undefined,
  systemPreference: 'light' | 'dark' = 'light'
): 'light' | 'dark' {
  const theme = colorTheme ?? DOCUMENT_DESIGN_DEFAULTS.colorTheme;
  if (theme === 'dark') return 'dark';
  if (theme === 'light') return 'light';
  return systemPreference;
}

/** @deprecated Prefer resolveDocumentColorTheme */
export const resolveResumeColorTheme = resolveDocumentColorTheme;
