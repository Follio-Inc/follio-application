import { cleanPhoneDisplay } from '@/lib/phone';
import { getFollioUrl, getPortfolioPath, getResumePath } from '@/lib/url';
import { formatDate } from '@/lib/utils';
import type { PublicProfile } from '@/types';

import { cloakContactValue } from './cloak';
import type {
  FollioContact,
  FollioEducationItem,
  FollioExperienceItem,
  FollioIdentity,
  FollioLink,
  FollioLinkKind,
} from './types';
import { formatArrangement } from './depth';
import { condense } from './text';
import {
  rewriteAbout,
  rewriteEducationNote,
  rewriteExtras,
  rewriteHeadline,
  rewriteHighlights,
} from './voice';

export { condense };

/**
 * Depth caps. A Follio is a first impression, not an archive — the resume and
 * work doors carry the long tail. These caps keep the whole page glanceable.
 */
const MAX_EXPERIENCE = 4;
const MAX_EDUCATION = 3;
const MAX_LINKS = 6;
const MAX_SKILLS = 5;

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isShown<T extends { isVisible?: boolean }>(item: T): boolean {
  return item.isVisible !== false;
}

// ─── Dates ──────────────────────────────────────────────────────────────────

function yearOf(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : String(parsed.getUTCFullYear());
}

/** "Mar 2022 – Present" — month precision, en dash, no clutter. */
function monthRange(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
  isCurrent: boolean
): string | null {
  const from = formatDate(start);
  if (!from) return null;
  const to = isCurrent ? 'Present' : formatDate(end);
  return to ? `${from} – ${to}` : from;
}

/**
 * Human tenure between two dates, e.g. "2 yrs 1 mo" or "8 mos". Derived purely
 * from the dates already shown — no extra data — so the timeline reads as
 * informative at a glance without turning into a resume. Returns null for
 * anything under a month.
 */
export function formatDuration(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
  isCurrent: boolean
): string | null {
  if (!start) return null;
  const from = new Date(start);
  const to = isCurrent || !end ? new Date() : new Date(end);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return null;

  // Whole elapsed months, then rounded up by one so a role reads inclusively
  // (a Jan–Dec year is 12 months, not 11).
  const months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth()) +
    1;
  if (months < 1) return null;

  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? 'yr' : 'yrs'}`);
  if (remMonths > 0) parts.push(`${remMonths} ${remMonths === 1 ? 'mo' : 'mos'}`);
  return parts.join(' ');
}

/** "2015 – 2017" — schools only need years. */
function yearRange(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
  isCurrent: boolean
): string | null {
  const from = yearOf(start);
  const to = isCurrent ? 'Present' : yearOf(end);
  if (from && to) return from === to ? from : `${from} – ${to}`;
  return to ?? from;
}

// ─── Identity basics ────────────────────────────────────────────────────────

function fullNameOf(profile: PublicProfile): string {
  const name = [profile.firstName, profile.middleName, profile.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  return name || profile.handle;
}

function initialsOf(profile: PublicProfile): string {
  const letters = [profile.firstName?.[0], profile.lastName?.[0]].filter(Boolean).join('');
  if (letters) return letters.toUpperCase();
  return (profile.handle?.[0] || '?').toUpperCase();
}

// ─── Contact ────────────────────────────────────────────────────────────────

/**
 * Stored phone numbers can carry a legacy `+1::US 6287241570` shape, which is
 * not dialable. Normalize to `+` and digits so `tel:` works on every device.
 */
export function toDialString(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const display = cleanPhoneDisplay(phone);
  const dial = display.replace(/[^\d+]/g, '');
  return dial.length >= 4 ? dial : null;
}

function hostnameOf(url: string): string | null {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

function cloak(value: string | null): string | null {
  return value ? cloakContactValue(value) : null;
}

function contactOf(profile: PublicProfile): FollioContact {
  const rawPhone = text(profile.contactInfo?.phone);
  const website = text(profile.contactInfo?.website);
  const dial = toDialString(rawPhone);
  const display = rawPhone ? cleanPhoneDisplay(rawPhone) || rawPhone : null;

  return {
    email: cloak(text(profile.contactInfo?.email)),
    phone: cloak(dial),
    phoneDisplay: cloak(display),
    website,
    websiteLabel: website ? hostnameOf(website) : null,
    location: text(profile.location),
  };
}

// ─── Links ──────────────────────────────────────────────────────────────────

const LINK_KIND_BY_TYPE: Record<string, FollioLinkKind> = {
  GITHUB: 'github',
  LINKEDIN: 'linkedin',
  TWITTER: 'twitter',
  DRIBBBLE: 'dribbble',
  BEHANCE: 'behance',
  YOUTUBE: 'youtube',
  MEDIUM: 'medium',
  SUBSTACK: 'substack',
  HASHNODE: 'hashnode',
  DEVTO: 'devto',
  PORTFOLIO: 'website',
  BLOG: 'website',
};

/** Kinds where a `@handle` reads better than a hostname. */
const HANDLE_KINDS = new Set<FollioLinkKind>([
  'github',
  'twitter',
  'instagram',
  'dribbble',
  'behance',
  'medium',
  'substack',
  'hashnode',
  'devto',
  'tiktok',
  'threads',
  'gitlab',
]);

/** Hostname fragment → kind, for links stored without a specific type. */
const KIND_BY_HOST: [test: (host: string) => boolean, kind: FollioLinkKind][] = [
  [(h) => h.includes('github.'), 'github'],
  [(h) => h.includes('gitlab.'), 'gitlab'],
  [(h) => h.includes('linkedin.'), 'linkedin'],
  [(h) => h.includes('twitter.') || h === 'x.com' || h.endsWith('.x.com'), 'twitter'],
  [(h) => h.includes('medium.'), 'medium'],
  [(h) => h.includes('substack.'), 'substack'],
  [(h) => h.includes('hashnode.'), 'hashnode'],
  [(h) => h === 'dev.to' || h.endsWith('.dev.to'), 'devto'],
  [(h) => h.includes('dribbble.'), 'dribbble'],
  [(h) => h.includes('behance.'), 'behance'],
  [(h) => h.includes('youtube.') || h.includes('youtu.be'), 'youtube'],
  [(h) => h.includes('instagram.'), 'instagram'],
  [(h) => h.includes('facebook.') || h === 'fb.com', 'facebook'],
  [(h) => h.includes('tiktok.'), 'tiktok'],
  [(h) => h.includes('threads.'), 'threads'],
  [(h) => h.includes('stackoverflow.') || h.includes('stackexchange.'), 'stackoverflow'],
];

function linkKind(type: string, url: string): FollioLinkKind {
  const mapped = LINK_KIND_BY_TYPE[type];
  // OTHER is stored for many links whose host still identifies the platform, so
  // fall through to host detection rather than trusting a generic type.
  if (mapped) return mapped;

  const host = hostnameOf(url) ?? '';
  for (const [test, kind] of KIND_BY_HOST) {
    if (test(host)) return kind;
  }
  return 'other';
}

function titleCase(value: string): string {
  const words = value.replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function linkDetail(url: string, kind: FollioLinkKind): string | null {
  if (HANDLE_KINDS.has(kind)) {
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
      const segment = parsed.pathname.split('/').filter(Boolean).pop();
      // Some platforms already carry the @ in the path (medium.com/@ada).
      if (segment) return segment.startsWith('@') ? segment : `@${segment}`;
    } catch {
      // Fall through to the hostname.
    }
  }
  return hostnameOf(url);
}

function linksOf(profile: PublicProfile): FollioLink[] {
  return (profile.links ?? [])
    .filter((link) => isShown(link) && Boolean(text(link.url)))
    .slice(0, MAX_LINKS)
    .map((link) => {
      const url = link.url.trim();
      const kind = linkKind(link.type, url);
      return {
        id: link.id,
        label: text(link.label) ?? titleCase(link.type),
        detail: linkDetail(url, kind),
        url,
        kind,
      };
    });
}

// ─── Experience, education, work ────────────────────────────────────────────

function experienceOf(profile: PublicProfile): FollioExperienceItem[] {
  return (profile.workExperiences ?? [])
    .filter(isShown)
    .slice(0, MAX_EXPERIENCE)
    .map((item) => ({
      id: item.id,
      role: item.role,
      company: item.company,
      companyUrl: text(item.companyUrl),
      period: monthRange(item.startDate, item.endDate, item.isCurrent),
      duration: formatDuration(item.startDate, item.endDate, item.isCurrent),
      isCurrent: item.isCurrent,
      location: text(item.location),
      arrangement: formatArrangement(item.employmentType, item.locationType),
      highlights: rewriteHighlights(item),
    }));
}

function currentRoleOf(profile: PublicProfile): FollioIdentity['currentRole'] {
  const experiences = (profile.workExperiences ?? []).filter(isShown);
  const current = experiences.find((item) => item.isCurrent) ?? experiences[0];
  if (!current?.role) return null;
  return {
    role: current.role,
    company: current.company,
    companyUrl: text(current.companyUrl),
  };
}

function educationOf(profile: PublicProfile): FollioEducationItem[] {
  return (profile.educations ?? [])
    .filter(isShown)
    .slice(0, MAX_EDUCATION)
    .map((item) => ({
      id: item.id,
      institution: item.institution,
      institutionUrl: text(item.institutionUrl),
      credential:
        [text(item.degree), text(item.fieldOfStudy)].filter(Boolean).join(', ').trim() || null,
      period: yearRange(item.startDate, item.endDate, item.isCurrent),
      location: text(item.location),
      gpa: text(item.gpa),
      description: rewriteEducationNote(item.description),
      honors: rewriteExtras(item.honors),
      activities: rewriteExtras(item.activities),
    }));
}

/**
 * Top skills only, flattened. Grouped skills come first because the person
 * curated that order; ungrouped ones fill any remaining slots.
 */
function skillsOf(profile: PublicProfile): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  const grouped = (profile.skillGroups ?? []).flatMap((group) =>
    (group.skills ?? []).filter(isShown).map((skill) => skill.name)
  );
  const ungrouped = (profile.skills ?? [])
    .filter((skill) => isShown(skill) && !skill.groupId)
    .map((skill) => skill.name);

  for (const name of [...grouped, ...ungrouped]) {
    if (ordered.length >= MAX_SKILLS) break;
    const trimmed = name?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(trimmed);
  }

  return ordered;
}

// ─── Builder ────────────────────────────────────────────────────────────────

export type BuildFollioIdentityOptions = {
  showResume: boolean;
  showWork: boolean;
};

export function buildFollioIdentity(
  profile: PublicProfile,
  options: BuildFollioIdentityOptions
): FollioIdentity {
  const fullName = fullNameOf(profile);

  return {
    handle: profile.handle,
    fullName,
    shortName: text(profile.firstName) ?? fullName,
    initials: initialsOf(profile),
    headline: rewriteHeadline(profile.headline),
    avatarUrl: text(profile.avatarUrl),
    currentRole: currentRoleOf(profile),
    contact: contactOf(profile),
    about: rewriteAbout(profile.summary),
    experience: experienceOf(profile),
    education: educationOf(profile),
    skills: skillsOf(profile),
    links: linksOf(profile),
    follioUrl: getFollioUrl(profile.handle),
    resumeHref: getResumePath(profile.handle),
    workHref: getPortfolioPath(profile.handle),
    doors: { resume: options.showResume, work: options.showWork },
  };
}
