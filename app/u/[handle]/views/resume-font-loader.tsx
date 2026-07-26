'use client';

import { useEffect, useMemo, useRef } from 'react';

import { DOCUMENT_GOOGLE_FONT_URLS } from '@/lib/document-design';
import type { ResumeFontFamily } from '@/types';

/** @deprecated Prefer DOCUMENT_GOOGLE_FONT_URLS from @/lib/document-design */
export const RESUME_GOOGLE_FONT_URLS = DOCUMENT_GOOGLE_FONT_URLS;

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
 * Dynamically loads Google Font stylesheets for the chosen document faces.
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
      const url = DOCUMENT_GOOGLE_FONT_URLS[face];
      if (url) ensureFontLink(url, loadedRef.current);
    }
    for (const url of extraUrls ?? []) {
      if (url) ensureFontLink(url, loadedRef.current);
    }
  }, [fontKey, extraKey, fonts, fontFamily, extraUrls]);

  return null;
}
