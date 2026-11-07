/**
 * Highlights are the lines worth marking on a resume: outcomes, not a profile.
 * Follio stays a first impression. This view lifts the proof points out of the
 * document and keeps just enough context to know where each one happened.
 */

import {
  highlightLines,
  rewriteAbout,
  rewriteEducationNote,
  rewriteExtras,
  rewriteHeadline,
} from '@/lib/follio-identity';
import { displayTotalExperience, unitsFromProfile } from '@/lib/total-experience';
import { applyVisibilityFilter } from '@/lib/visibility';
import { formatDate } from '@/lib/utils';
import type { PublicProfile } from '@/types';

const MAX_LINES = 4;
const MAX_GROUPS = 12;
const MAX_LINE_CHARS = 240;

/** Duty-list filler is not a highlight when the role has a real outcome. */
const NOISE_HIGHLIGHT =
  /^(?:responsible for|duties included|worked on|worked with|tasked with|involved in|various duties|assisted with|helped with|participated in)\b/i;

const DEFAULT_SECTION_ORDER = [
  'EXPERIENCE',
  'PROJECTS',
  'EDUCATION',
  'AWARDS',
  'CERTIFICATIONS',
] as const;

export type ResumeHighlightKind =
  | 'experience'
  | 'project'
  | 'education'
  | 'award'
  | 'certification';

export type ResumeHighlightGroup = {
  id: string;
  kind: ResumeHighlightKind;
  /** Role, project, or degree. Null when the marked line is the title itself. */
  heading: string | null;
  /** Where and when — company, school, issuer, dates. */
  meta: string | null;
  lines: string[];
};

export type ResumeHighlights = {
  name: string;
  headline: string | null;
  /** Short introduction. Unmarked when proof points exist. */
  lead: string | null;
  tenure: string | null;
  groups: ResumeHighlightGroup[];
};

const SECTION_KIND: Record<string, ResumeHighlightKind> = {
  EXPERIENCE: 'experience',
  PROJECTS: 'project',
  EDUCATION: 'education',
  AWARDS: 'award',
  CERTIFICATIONS: 'certification',
};

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function metaLine(parts: Array<string | null | undefined>): string | null {
  const kept = parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part));
  return kept.length > 0 ? kept.join(' · ') : null;
}

function yearOf(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : String(parsed.getUTCFullYear());
}

function periodOf(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
  isCurrent: boolean
): string | null {
  const from = formatDate(start);
  if (!from) return null;
  if (isCurrent) return `${from} – Present`;
  const to = formatDate(end);
  return to ? `${from} – ${to}` : from;
}

function yearSpan(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
  isCurrent: boolean
): string | null {
  const from = yearOf(start);
  const to = isCurrent ? 'Present' : yearOf(end);
  if (from && to) return from === to ? from : `${from} – ${to}`;
  return to ?? from;
}

function personName(profile: PublicProfile): string {
  const name = [profile.firstName, profile.middleName, profile.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  return name || profile.handle || 'Highlights';
}

/**
 * Proof points in the order they were written. Noise drops out when a stronger
 * line exists; a role made only of duty-list filler contributes nothing.
 */
export function selectHighlightLines(
  item: { bullets?: string[] | null; bulletsHtml?: string | null },
  max = MAX_LINES
): string[] {
  const candidates = highlightLines(item, { max: 16, maxChars: MAX_LINE_CHARS });
  return candidates.filter((line) => !NOISE_HIGHLIGHT.test(line)).slice(0, max);
}

function uniqueLines(lines: Array<string | null | undefined>, max = MAX_LINES): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const trimmed = line?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= max) break;
  }
  return out;
}

function sectionTypes(profile: PublicProfile): string[] {
  const fromSections = (profile.sections ?? [])
    .filter((section) => SECTION_KIND[section.type])
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((section) => section.type);

  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const type of [...fromSections, ...DEFAULT_SECTION_ORDER]) {
    if (seen.has(type) || !SECTION_KIND[type]) continue;
    seen.add(type);
    ordered.push(type);
  }
  return ordered;
}

function experienceGroups(profile: PublicProfile): ResumeHighlightGroup[] {
  return (profile.workExperiences ?? []).flatMap((item) => {
    const lines = selectHighlightLines(item);
    const heading = text(item.role) ?? text(item.company);
    if (!heading || lines.length === 0) return [];
    return [
      {
        id: `experience-${item.id}`,
        kind: 'experience' as const,
        heading,
        meta: metaLine([
          text(item.company) && text(item.company) !== heading ? text(item.company) : null,
          periodOf(item.startDate, item.endDate, item.isCurrent),
        ]),
        lines,
      },
    ];
  });
}

function projectGroups(profile: PublicProfile): ResumeHighlightGroup[] {
  return (profile.projects ?? []).flatMap((item) => {
    const lines = selectHighlightLines({
      bullets: item.highlights,
      bulletsHtml: item.highlights?.length ? null : item.description,
    });
    const heading = text(item.title);
    if (!heading || lines.length === 0) return [];
    return [
      {
        id: `project-${item.id}`,
        kind: 'project' as const,
        heading,
        meta: periodOf(item.startDate, item.endDate, item.isCurrent),
        lines,
      },
    ];
  });
}

function educationGroups(profile: PublicProfile): ResumeHighlightGroup[] {
  return (profile.educations ?? []).flatMap((item) => {
    const notes = highlightLines(
      { bulletsHtml: item.description },
      { max: 8, maxChars: MAX_LINE_CHARS }
    )
      .map((line) => rewriteEducationNote(line))
      .filter((line): line is string => Boolean(line));
    const gpa = text(item.gpa);
    const lines = uniqueLines([...notes, ...rewriteExtras(item.honors), gpa ? `GPA ${gpa}` : null]);
    const credential =
      [text(item.degree), text(item.fieldOfStudy)].filter(Boolean).join(', ') || null;
    const institution = text(item.institution);
    const heading = credential ?? institution;
    if (!heading || lines.length === 0) return [];
    return [
      {
        id: `education-${item.id}`,
        kind: 'education' as const,
        heading,
        meta: metaLine([
          credential ? institution : null,
          yearSpan(item.startDate, item.endDate, item.isCurrent),
        ]),
        lines,
      },
    ];
  });
}

function awardGroups(profile: PublicProfile): ResumeHighlightGroup[] {
  return (profile.awards ?? []).flatMap((item) => {
    const title = text(item.title);
    if (!title) return [];
    const description = highlightLines(
      { bullets: item.description ? [item.description] : [] },
      { max: 1, maxChars: MAX_LINE_CHARS }
    )[0];
    const distinct =
      description && description.toLowerCase() !== title.toLowerCase() ? description : null;
    return [
      {
        id: `award-${item.id}`,
        kind: 'award' as const,
        heading: distinct ? title : null,
        meta: metaLine([text(item.issuer), yearOf(item.date)]),
        lines: distinct ? [distinct] : [title],
      },
    ];
  });
}

function certificationGroups(profile: PublicProfile): ResumeHighlightGroup[] {
  return (profile.certifications ?? []).flatMap((item) => {
    const name = text(item.name);
    if (!name) return [];
    return [
      {
        id: `certification-${item.id}`,
        kind: 'certification' as const,
        heading: null,
        meta: metaLine([text(item.issuer), yearOf(item.issueDate)]),
        lines: [name],
      },
    ];
  });
}

const GROUPS_BY_TYPE: Record<string, (profile: PublicProfile) => ResumeHighlightGroup[]> = {
  EXPERIENCE: experienceGroups,
  PROJECTS: projectGroups,
  EDUCATION: educationGroups,
  AWARDS: awardGroups,
  CERTIFICATIONS: certificationGroups,
};

export function buildResumeHighlights(profile: PublicProfile): ResumeHighlights {
  const visible = applyVisibilityFilter(profile, { resumeContext: true });
  const groups: ResumeHighlightGroup[] = [];

  for (const type of sectionTypes(visible)) {
    const build = GROUPS_BY_TYPE[type];
    if (!build) continue;
    for (const group of build(visible)) {
      if (groups.length >= MAX_GROUPS) break;
      groups.push(group);
    }
    if (groups.length >= MAX_GROUPS) break;
  }

  return {
    name: personName(visible),
    headline: rewriteHeadline(visible.headline),
    lead: rewriteAbout(visible.summary),
    tenure: displayTotalExperience(
      visible.totalExperience,
      (visible.workExperiences ?? []).filter((item) => item.isVisible !== false),
      visible.totalExperienceVisible,
      unitsFromProfile(visible)
    ),
    groups,
  };
}
