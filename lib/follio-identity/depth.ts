import { htmlToBullets, stripHtmlTags } from '@/lib/html-utils';

const MAX_HIGHLIGHTS = 8;
const MAX_HIGHLIGHT_CHARS = 220;

const EMPLOYMENT_LABEL: Record<string, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACT: 'Contract',
  FREELANCE: 'Freelance',
  INTERNSHIP: 'Internship',
};

const LOCATION_LABEL: Record<string, string> = {
  ONSITE: 'On-site',
  REMOTE: 'Remote',
  HYBRID: 'Hybrid',
};

export function humanEmploymentType(value: string | null | undefined): string | null {
  if (!value) return null;
  return EMPLOYMENT_LABEL[value] ?? null;
}

export function humanLocationType(value: string | null | undefined): string | null {
  if (!value) return null;
  return LOCATION_LABEL[value] ?? null;
}

/** Combine employment and location type into one quiet line. */
export function formatArrangement(
  employmentType: string | null | undefined,
  locationType: string | null | undefined
): string | null {
  const parts = [humanEmploymentType(employmentType), humanLocationType(locationType)].filter(
    Boolean
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}

function trimHighlight(value: string, maxChars: number): string | null {
  const plain = stripHtmlTags(value).replace(/\s+/g, ' ').trim();
  if (!plain) return null;
  if (plain.length <= maxChars) return plain;
  const window = plain.slice(0, maxChars);
  const lastWord = window.lastIndexOf(' ');
  return `${(lastWord > 0 ? window.slice(0, lastWord) : window).trimEnd()}…`;
}

/**
 * Resume bullets as plain lines. The Follio voice layer picks signal from this
 * list — pass higher limits when ranking, not when rendering.
 */
export function highlightLines(
  item: {
    bullets?: string[] | null;
    bulletsHtml?: string | null;
  },
  limits: { max?: number; maxChars?: number } = {}
): string[] {
  const max = limits.max ?? MAX_HIGHLIGHTS;
  const maxChars = limits.maxChars ?? MAX_HIGHLIGHT_CHARS;
  const raw =
    item.bullets && item.bullets.length > 0
      ? item.bullets
      : item.bulletsHtml
        ? htmlToBullets(item.bulletsHtml)
        : [];

  const lines: string[] = [];
  const seen = new Set<string>();
  for (const bullet of raw) {
    const line = trimHighlight(bullet, maxChars);
    if (!line) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(line);
    if (lines.length >= max) break;
  }
  return lines;
}

export function stringList(values: string[] | null | undefined): string[] {
  if (!values) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}
