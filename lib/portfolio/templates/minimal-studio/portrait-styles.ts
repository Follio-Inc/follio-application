/**
 * Minimal Studio — hero portrait presets.
 *
 * Each style is a complete editorial composition (size, shape, placement).
 * All share the same hairline frame and warm photo grade defined in CSS.
 */

export const PORTRAIT_STYLES = [
  {
    id: 'style-1',
    label: 'Style 1',
    name: 'Mark',
    description: 'Small vertical accent beside your headline',
  },
  {
    id: 'style-2',
    label: 'Style 2',
    name: 'Spread',
    description: 'Tall portrait in a right-hand column',
  },
  {
    id: 'style-3',
    label: 'Style 3',
    name: 'Ledger',
    description: 'Tall portrait in a left-hand column',
  },
  {
    id: 'style-4',
    label: 'Style 4',
    name: 'Masthead',
    description: 'Wide cinematic strip above your headline',
  },
  {
    id: 'style-5',
    label: 'Style 5',
    name: 'Float',
    description: 'Medium portrait anchored to the top-right',
  },
] as const;

export type PortraitStyleId = (typeof PORTRAIT_STYLES)[number]['id'];

const STYLE_IDS = new Set<string>(PORTRAIT_STYLES.map((s) => s.id));

export function isPortraitStyleId(value: unknown): value is PortraitStyleId {
  return typeof value === 'string' && STYLE_IDS.has(value);
}

export const DEFAULT_PORTRAIT_STYLE: PortraitStyleId = 'style-1';
