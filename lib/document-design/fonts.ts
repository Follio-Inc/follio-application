/**
 * Google Font stylesheets for document paper (resume + cover letter).
 * System fonts (Georgia, Times New Roman, System UI) are omitted — no URL needed.
 */

import type { DocumentFontFamily } from './types';

export const DOCUMENT_GOOGLE_FONT_URLS: Partial<Record<DocumentFontFamily, string>> = {
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

/** Build `<link>` tags for the given faces (deduped). */
export function documentGoogleFontLinkTags(faces: DocumentFontFamily[]): string {
  const urls = new Set(
    faces
      .map((face) => DOCUMENT_GOOGLE_FONT_URLS[face])
      .filter((url): url is string => Boolean(url))
  );
  return [...urls]
    .map((url) => `<link rel="stylesheet" href="${url}" crossorigin="anonymous" />`)
    .join('\n  ');
}
