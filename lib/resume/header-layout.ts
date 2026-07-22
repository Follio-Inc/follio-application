/**
 * Header layout — one control, two option sets.
 *
 * Same segmented-button UI either way:
 * - Photo off → text alignment: left | center | right (`headerAlignment`)
 * - Photo on  → photo compositions (`headerPhotoLayout`):
 *     photo-left        → [Photo] Name / Title
 *     photo-right       → Name / Title ………… [Photo]  (text left, photo pinned right)
 *     photo-above       → Photo above, centered stack
 *     photo-above-left  → Photo above, left-aligned stack
 *
 * These are not the same as text-align. “Photo right” keeps name/title
 * left-aligned; it does not right-align the text against the photo.
 */

import type { ResumeHeaderAlignment, ResumeHeaderPhotoLayout } from '@/types';

/** Resolved header composition used by live view and PDF export. */
export type ResumeHeaderComposition =
  | 'text'
  | 'photo-left'
  | 'photo-right'
  | 'photo-above'
  | 'photo-above-left';

export const HEADER_PHOTO_LAYOUT_OPTIONS: {
  value: ResumeHeaderPhotoLayout;
  /** Button label — reads as visual order */
  label: string;
  /** Tooltip / accessible description */
  description: string;
}[] = [
  {
    value: 'photo-left',
    label: 'Photo · Name',
    description: 'Photo on the left, name and title beside it',
  },
  {
    value: 'photo-right',
    label: 'Name · Photo',
    description: 'Name and title on the left, photo on the right',
  },
  {
    value: 'photo-above',
    label: 'Photo above',
    description: 'Photo centered above the name and title',
  },
  {
    value: 'photo-above-left',
    label: 'Above · Left',
    description: 'Photo above the name and title, left-aligned',
  },
];

export const HEADER_TEXT_ALIGNMENT_OPTIONS: {
  value: ResumeHeaderAlignment;
  label: string;
}[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

export function resolveHeaderComposition(
  showPhoto: boolean,
  photoLayout: ResumeHeaderPhotoLayout
): ResumeHeaderComposition {
  if (!showPhoto) return 'text';
  return photoLayout;
}

/** Whether the photo should render before the identity text in the DOM. */
export function isPhotoBeforeText(composition: ResumeHeaderComposition): boolean {
  return (
    composition === 'photo-left' ||
    composition === 'photo-above' ||
    composition === 'photo-above-left'
  );
}

export function getHeaderLayoutSectionLabel(showPhoto: boolean): string {
  return showPhoto ? 'Photo placement' : 'Header Alignment';
}
