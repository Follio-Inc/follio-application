/**
 * Atelier resume template helpers — year ranges and contact icons.
 */

import { cleanPhoneDisplay } from '@/lib/phone';
import type { FilteredProfile } from '@/lib/visibility';

export type AtelierContactKind = 'phone' | 'email' | 'website' | 'link';

export interface AtelierContactField {
  id: string;
  kind: AtelierContactKind;
  value: string;
}

function yearFromDate(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  return String(d.getFullYear());
}

/** Atelier experience dates use year-only ranges (e.g. "2018 - 2021"). */
export function formatAtelierYearRange(
  startDate: Date | string | null | undefined,
  endDate: Date | string | null | undefined,
  isCurrent?: boolean
): string {
  const start = yearFromDate(startDate);
  const end = isCurrent ? 'Present' : yearFromDate(endDate);
  if (!start && !end) return '';
  if (!start) return end;
  if (!end) return start;
  return `${start} - ${end}`;
}

function stripUrl(url: string): string {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');
}

/**
 * Contact line for Atelier header: phone → email → website → links.
 * Matches the icon row in the reference design (no location / social block).
 */
export function buildResumeAtelierContactFields(profile: FilteredProfile): AtelierContactField[] {
  const fields: AtelierContactField[] = [];

  if (profile.contactInfo?.phone) {
    fields.push({
      id: 'phone',
      kind: 'phone',
      value: cleanPhoneDisplay(profile.contactInfo.phone),
    });
  }
  if (profile.contactInfo?.email) {
    fields.push({
      id: 'email',
      kind: 'email',
      value: profile.contactInfo.email,
    });
  }

  const website = (profile.contactInfo as { website?: string | null } | null)?.website;
  if (website) {
    fields.push({
      id: 'website',
      kind: 'website',
      value: stripUrl(website),
    });
  }

  profile.links?.forEach((link) => {
    if (!link.url?.trim()) return;
    fields.push({
      id: link.id,
      kind: 'link',
      value: stripUrl(link.url),
    });
  });

  return fields;
}

/** Google Fonts URL for the Atelier script name face. */
export const ATELIER_SCRIPT_FONT_URL =
  'https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap';

export const ATELIER_SCRIPT_FONT_FAMILY = "'Great Vibes', 'Segoe Script', cursive";
