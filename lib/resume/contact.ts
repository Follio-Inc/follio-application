/**
 * Shared helpers for resume contact lines and identity display.
 * Used by live resume views and kept layout-agnostic for template switching.
 */

import { cleanPhoneDisplay } from '@/lib/phone';
import type { FilteredProfile } from '@/lib/visibility';

export function getResumeFullName(profile: {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
}): string {
  return [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(' ');
}

export interface ResumeContactField {
  id: string;
  /** Optional short label; Studio contact card renders values only (no P/E/A). */
  label: string | null;
  value: string;
}

/**
 * Build ordered contact fields with optional short labels.
 * Respects `contactInfo.headerFieldsOrder` when present.
 */
export function buildResumeContactFields(profile: FilteredProfile): ResumeContactField[] {
  const itemMap = new Map<string, ResumeContactField>();

  if (profile.location) {
    itemMap.set('location', {
      id: 'location',
      label: null,
      value: profile.location,
    });
  }
  if (profile.contactInfo?.email) {
    itemMap.set('email', {
      id: 'email',
      label: null,
      value: profile.contactInfo.email,
    });
  }
  if (profile.contactInfo?.phone) {
    itemMap.set('phone', {
      id: 'phone',
      label: null,
      value: cleanPhoneDisplay(profile.contactInfo.phone),
    });
  }

  profile.links?.forEach((link) => {
    const displayUrl = link.url
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/$/, '');
    itemMap.set(link.id, { id: link.id, label: null, value: displayUrl });
  });

  const storedOrder = (profile.contactInfo as Record<string, unknown> | null)?.headerFieldsOrder;
  const order = Array.isArray(storedOrder) ? (storedOrder as string[]) : null;

  if (order && order.length > 0) {
    const ordered: ResumeContactField[] = [];
    const seen = new Set<string>();
    for (const id of order) {
      const field = itemMap.get(id);
      if (field && !seen.has(id)) {
        ordered.push(field);
        seen.add(id);
      }
    }
    for (const [id, field] of itemMap) {
      if (!seen.has(id)) ordered.push(field);
    }
    return ordered;
  }

  // Default: insertion order (location → email → phone → links)
  return Array.from(itemMap.values());
}

/**
 * Build ordered contact display strings for the resume header / sidebar.
 * Respects `contactInfo.headerFieldsOrder` when present.
 */
export function buildResumeContactItems(profile: FilteredProfile): string[] {
  return buildResumeContactFields(profile).map((field) => field.value);
}

/** Studio contact card prefers phone → email, then links (no address line). */
export function buildResumeStudioContactFields(profile: FilteredProfile): ResumeContactField[] {
  const fields = buildResumeContactFields(profile).filter((field) => field.id !== 'location');
  const preferred = ['phone', 'email'];
  const ordered: ResumeContactField[] = [];
  const seen = new Set<string>();
  for (const id of preferred) {
    const field = fields.find((f) => f.id === id);
    if (field) {
      ordered.push(field);
      seen.add(id);
    }
  }
  for (const field of fields) {
    if (!seen.has(field.id)) ordered.push(field);
  }
  return ordered;
}

export function shouldShowResumePhoto(profile: FilteredProfile): boolean {
  return (
    (profile as unknown as Record<string, unknown>).resumeShowPhoto === true &&
    Boolean(profile.avatarUrl) &&
    Boolean(profile._photosVisible)
  );
}
