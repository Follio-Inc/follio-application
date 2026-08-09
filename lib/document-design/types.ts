/**
 * Shared paper / document design types.
 *
 * Resume and cover letter both use this core. Document-specific fields
 * (resume photo layout, cover letter template id, …) live on the
 * document-type design interfaces that extend DocumentDesign.
 */

/** Font families available for document rendering */
export type DocumentFontFamily =
  | 'georgia'
  | 'times'
  | 'garamond'
  | 'inter'
  | 'roboto'
  | 'lato'
  | 'merriweather'
  | 'source-sans'
  | 'open-sans'
  | 'raleway'
  | 'instrument-sans'
  | 'dm-sans'
  | 'system'
  | 'great-vibes';

/** Section divider style */
export type DocumentDividerStyle = 'line' | 'double' | 'dotted' | 'dashed' | 'thick' | 'none';

/** Paper density / spacing */
export type DocumentDensity = 'compact' | 'normal' | 'relaxed';

/** Document color theme — independent of the Follio app theme */
export type DocumentColorTheme = 'light' | 'dark' | 'system';

/**
 * On-screen and PDF page layout.
 * - `continuous` — single scrollable sheet (digital-first)
 * - `a4` — ISO A4 pages with visible breaks
 * - `letter` — US Letter pages with visible breaks
 */
export type DocumentPageLayout = 'continuous' | 'a4' | 'letter';

/** Alias used by PDF export — same values as `DocumentPageLayout`. */
export type PdfLayout = DocumentPageLayout;

/** Text emphasis for a typography role */
export interface DocumentTextStyle {
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

export const DOCUMENT_TEXT_STYLE_DEFAULTS: DocumentTextStyle = {
  bold: false,
  italic: false,
  underline: false,
};

/**
 * Shared paper design — theme, colors, typography, density, page size.
 * Stored as JSON on each document; missing values fall back to defaults.
 */
export interface DocumentDesign {
  /** Light / dark / system color theme for the document */
  colorTheme?: DocumentColorTheme;
  /** Color for headings (CSS hex) */
  headingColor?: string;
  /** Accent color for dividers, bullets, etc. */
  accentColor?: string;
  /** Body / content font family */
  fontFamily?: DocumentFontFamily;
  /** Font for the display / sender name; falls back to `fontFamily` when unset */
  nameFontFamily?: DocumentFontFamily;
  /** Font for section / letter headings; falls back to system UI when unset */
  headingFontFamily?: DocumentFontFamily;
  /** Style of the divider line below headings */
  dividerStyle?: DocumentDividerStyle;
  /** Base body font size in px */
  fontSize?: number;
  /** Content density / spacing */
  density?: DocumentDensity;
  /** Name font size in px */
  nameFontSize?: number;
  /** Heading font size in px */
  headingFontSize?: number;
  /** Bold / italic / underline for the display name */
  nameStyle?: DocumentTextStyle;
  /** Bold / italic / underline for headings */
  headingStyle?: DocumentTextStyle;
  /** Bold / italic / underline for body text */
  bodyStyle?: DocumentTextStyle;
  /** Apply justified text alignment to content */
  justifyAll?: boolean;
  /** Page layout for live view (and download gating) */
  pageLayout?: DocumentPageLayout;
}

/** Ordered allowlist for document font pickers */
export const DOCUMENT_FONT_OPTIONS: DocumentFontFamily[] = [
  'georgia',
  'times',
  'garamond',
  'merriweather',
  'inter',
  'roboto',
  'lato',
  'source-sans',
  'open-sans',
  'raleway',
  'instrument-sans',
  'dm-sans',
  'system',
  'great-vibes',
];

/** Maps font family identifiers to CSS font-family values */
export const DOCUMENT_FONT_MAP: Record<DocumentFontFamily, string> = {
  georgia: "'Georgia', 'Times New Roman', Times, serif",
  times: "'Times New Roman', Times, serif",
  garamond: "'EB Garamond', 'Garamond', 'Georgia', serif",
  inter: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  roboto: "'Roboto', -apple-system, 'Segoe UI', sans-serif",
  lato: "'Lato', -apple-system, 'Segoe UI', sans-serif",
  merriweather: "'Merriweather', 'Georgia', serif",
  'source-sans': "'Source Sans 3', -apple-system, 'Segoe UI', sans-serif",
  'open-sans': "'Open Sans', -apple-system, 'Segoe UI', sans-serif",
  raleway: "'Raleway', -apple-system, 'Segoe UI', sans-serif",
  'instrument-sans': "'Instrument Sans', -apple-system, 'Segoe UI', sans-serif",
  'dm-sans': "'DM Sans', -apple-system, 'Segoe UI', sans-serif",
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  'great-vibes': "'Great Vibes', 'Segoe Script', cursive",
};

/** Human-readable labels for font families */
export const DOCUMENT_FONT_LABELS: Record<DocumentFontFamily, string> = {
  georgia: 'Georgia',
  times: 'Times New Roman',
  garamond: 'EB Garamond',
  inter: 'Inter',
  roboto: 'Roboto',
  lato: 'Lato',
  merriweather: 'Merriweather',
  'source-sans': 'Source Sans 3',
  'open-sans': 'Open Sans',
  raleway: 'Raleway',
  'instrument-sans': 'Instrument Sans',
  'dm-sans': 'DM Sans',
  system: 'System UI',
  'great-vibes': 'Great Vibes',
};

/** Default shared paper design */
export const DOCUMENT_DESIGN_DEFAULTS: Required<DocumentDesign> = {
  colorTheme: 'light',
  headingColor: '#000000',
  accentColor: '#000000',
  fontFamily: 'georgia',
  nameFontFamily: 'georgia',
  headingFontFamily: 'system',
  dividerStyle: 'line',
  // Body / section content — primary reading size
  fontSize: 13,
  density: 'normal',
  nameFontSize: 28,
  // Section headers sit slightly under body; caps + weight carry hierarchy
  headingFontSize: 12,
  nameStyle: { bold: true, italic: false, underline: false },
  headingStyle: { bold: true, italic: false, underline: false },
  bodyStyle: { bold: false, italic: false, underline: false },
  justifyAll: false,
  pageLayout: 'continuous',
};
