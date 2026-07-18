'use client';

import { useEffect, useMemo, useRef } from 'react';

import type { ResumeFontFamily } from '@/types';

/**
 * Google Fonts URLs for each resume font family.
 * System fonts (Georgia, Times New Roman, System UI) don't need loading.
 */
export const RESUME_GOOGLE_FONT_URLS: Partial<Record<ResumeFontFamily, string>> = {
  garamond:
    'https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&display=swap',
  inter: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  roboto:
    'https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,300;0,400;0,500;0,700;1,400&display=swap',
  lato: 'https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,300;0,400;0,700;1,400&display=swap',
  merriweather:
    'https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,300;0,400;0,700;1,400&display=swap',
  'source-sans':
    'https://fonts.googleapis.com/css2?family=Source+Sans+3:ital,wght@0,300;0,400;0,600;0,700;1,400&display=swap',
  'open-sans':
    'https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,300;0,400;0,600;0,700;1,400&display=swap',
  raleway:
    'https://fonts.googleapis.com/css2?family=Raleway:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap',
  'instrument-sans':
    'https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap',
  'dm-sans':
    'https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap',
  'great-vibes': 'https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap',
};

function ensureFontLink(url: string, loaded: Set<string>) {
  if (loaded.has(url)) return;
  const existing = document.querySelector(`link[href="${url}"]`);
  if (existing) {
    loaded.add(url);
    return;
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
  loaded.add(url);
}

/**
 * Dynamically loads Google Font stylesheets for the chosen resume faces.
 * Idempotent — won't add duplicate <link> elements.
 * `extraUrls` loads additional faces not in the allowlist.
 */
export function ResumeFontLoader({
  fontFamily,
  fonts,
  extraUrls,
}: {
  /** @deprecated Prefer `fonts` — kept for single-face call sites */
  fontFamily?: ResumeFontFamily;
  fonts?: ResumeFontFamily[];
  extraUrls?: string[];
}) {
  const loadedRef = useRef<Set<string>>(new Set());
  const fontKey = useMemo(
    () => (fonts ?? (fontFamily ? [fontFamily] : [])).join(','),
    [fonts, fontFamily]
  );
  const extraKey = useMemo(() => (extraUrls ?? []).join(','), [extraUrls]);

  useEffect(() => {
    const faces = fonts ?? (fontFamily ? [fontFamily] : []);
    for (const face of faces) {
      const url = RESUME_GOOGLE_FONT_URLS[face];
      if (url) ensureFontLink(url, loadedRef.current);
    }
    for (const url of extraUrls ?? []) {
      if (url) ensureFontLink(url, loadedRef.current);
    }
  }, [fontKey, extraKey, fonts, fontFamily, extraUrls]);

  return null;
}
