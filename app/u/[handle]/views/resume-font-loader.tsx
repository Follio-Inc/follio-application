'use client';

import { useEffect, useRef } from 'react';

import type { ResumeFontFamily } from '@/types';

/**
 * Google Fonts URLs for each resume font family.
 * System fonts (Georgia, Times New Roman) don't need loading.
 */
const GOOGLE_FONT_URLS: Partial<Record<ResumeFontFamily, string>> = {
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
};

/**
 * Dynamically loads a Google Font stylesheet if the chosen resume font requires it.
 * Idempotent — won't add duplicate <link> elements.
 */
export function ResumeFontLoader({ fontFamily }: { fontFamily?: ResumeFontFamily }) {
  const loadedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!fontFamily) return;
    const url = GOOGLE_FONT_URLS[fontFamily];
    if (!url) return; // System font, nothing to load
    if (loadedRef.current.has(url)) return; // Already loaded

    // Check if the link already exists in the document
    const existing = document.querySelector(`link[href="${url}"]`);
    if (existing) {
      loadedRef.current.add(url);
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
    loadedRef.current.add(url);
  }, [fontFamily]);

  return null;
}
