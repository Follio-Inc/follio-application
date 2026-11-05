/**
 * Projecting two parser results onto each other (PLATFORM_TODO item 23).
 *
 * ## Why the projection is almost an identity
 *
 * The two parsers were expected to need a lossy mapping between alien
 * schemas, and they do not. `services/import/resume-ai.service.ts` and
 * `services/import/resume-openresume.service.ts` each declare their own
 * `NormalizedResumeData`, and the two declarations are field-for-field
 * identical across all nine sections — profile, contactInfo, experiences,
 * educations, projects, skills, skillGroups, links, certifications. They
 * differ only in `meta`: the AI side carries `model` and `processingTimeMs`,
 * the openresume side does not.
 *
 * So the comparison is between two results already aimed at one shape, and
 * the mapping is reported rather than invented. The fields that genuinely do
 * not correspond are listed as uncomparable instead of being coerced.
 *
 * ## Matching
 *
 * Deterministic and textual. Two records are the same record when their key
 * matches after trimming, lower-casing and collapsing whitespace — nothing
 * fuzzy, nothing semantic, and no model asked to judge equivalence. Each
 * section's key is stated in `matchRule` and travels with the numbers, so a
 * weak match is visible as a weak rule rather than as a confident count.
 */

import type {
  EntityComparison,
  FieldDifference,
  FieldState,
  ParserRun,
  ResumeComparison,
  UncomparableField,
} from './comparison-types';
import type { ResumeLabWarning } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */

export const PROJECTION_NOTE =
  'Both parsers already normalize into the same nine-section shape — the two `NormalizedResumeData` declarations are field-for-field identical outside `meta` — so nothing was remapped. Records are matched on the documented key for each section after trimming, lower-casing and collapsing whitespace. No fuzzy or semantic matching, and no model was asked whether two records mean the same thing.';

/** Trim, lower-case, collapse whitespace. The whole normalization. */
export function normalizeKey(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : '';
}

/** A URL compared without its trailing slash or scheme casing. */
function normalizeUrl(value: unknown): string {
  return normalizeKey(value).replace(/\/+$/, '');
}

function joinKey(...parts: unknown[]): string {
  return parts.map((part) => normalizeKey(part)).join(' | ');
}

type Section = {
  type: string;
  label: string;
  matchRule: string;
  /** The records, and the key each one is matched on. */
  keys: (data: any) => string[];
  /** A readable form of a record, for the examples. */
  display?: (data: any) => string[];
};

/**
 * The nine sections, each with the key two records must share.
 *
 * The keys are made of fields that identify a record to a person: a job is
 * the company and the role, a degree is the institution and the degree. A
 * date is deliberately not in any key — the two parsers format dates
 * differently, and including one would report every record as exclusive.
 */
export const SECTIONS: Section[] = [
  {
    type: 'experiences',
    label: 'Experiences',
    matchRule: 'company + role',
    keys: (data) => arr(data?.experiences).map((item) => joinKey(item?.company, item?.role)),
  },
  {
    type: 'educations',
    label: 'Educations',
    matchRule: 'institution + degree',
    keys: (data) => arr(data?.educations).map((item) => joinKey(item?.institution, item?.degree)),
  },
  {
    type: 'projects',
    label: 'Projects',
    matchRule: 'name',
    keys: (data) => arr(data?.projects).map((item) => normalizeKey(item?.name)),
  },
  {
    type: 'skills',
    label: 'Skills',
    matchRule: 'the skill text itself',
    keys: (data) => arr(data?.skills).map((item) => normalizeKey(item)),
  },
  {
    type: 'skillGroups',
    label: 'Skill groups',
    matchRule: 'group name',
    keys: (data) => arr(data?.skillGroups).map((item) => normalizeKey(item?.name)),
  },
  {
    type: 'links',
    label: 'Links',
    matchRule: 'url, without a trailing slash',
    keys: (data) => arr(data?.links).map((item) => normalizeUrl(item?.url)),
  },
  {
    type: 'certifications',
    label: 'Certifications',
    matchRule: 'name',
    keys: (data) => arr(data?.certifications).map((item) => normalizeKey(item?.name)),
  },
];

function arr(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

/** Non-empty keys only: a record with no identifying text cannot be matched. */
function keySet(keys: string[]): Set<string> {
  return new Set(keys.filter((key) => key.length > 0));
}

function compareSection(section: Section, ai: any, openResume: any): EntityComparison {
  const aiKeys = section.keys(ai);
  const orKeys = section.keys(openResume);
  const aiSet = keySet(aiKeys);
  const orSet = keySet(orKeys);

  const overlap = [...aiSet].filter((key) => orSet.has(key));
  const aiOnly = [...aiSet].filter((key) => !orSet.has(key));
  const openResumeOnly = [...orSet].filter((key) => !aiSet.has(key));

  return {
    type: section.type,
    label: section.label,
    // Raw counts, kept apart from the de-duplicated ones so a parser that
    // emitted a record twice shows up rather than being absorbed.
    aiCount: aiKeys.length,
    openResumeCount: orKeys.length,
    aiDistinct: aiSet.size,
    openResumeDistinct: orSet.size,
    overlap: overlap.length,
    aiOnly: aiOnly.length,
    openResumeOnly: openResumeOnly.length,
    aiOnlyExamples: aiOnly.slice(0, 5),
    openResumeOnlyExamples: openResumeOnly.slice(0, 5),
    matchRule: section.matchRule,
  };
}

type ScalarField = {
  field: string;
  label: string;
  read: (data: any) => string | null;
  /** Present when the field cannot honestly be compared at all. */
  notComparable?: string;
};

/** The scalar fields both schemas declare, plus the one that only looks shared. */
const SCALAR_FIELDS: ScalarField[] = [
  { field: 'firstName', label: 'First name', read: (d) => text(d?.profile?.firstName) },
  { field: 'lastName', label: 'Last name', read: (d) => text(d?.profile?.lastName) },
  { field: 'headline', label: 'Headline', read: (d) => text(d?.profile?.headline) },
  { field: 'summary', label: 'Summary', read: (d) => text(d?.profile?.summary) },
  { field: 'location', label: 'Location', read: (d) => text(d?.profile?.location) },
  { field: 'email', label: 'Email', read: (d) => text(d?.contactInfo?.email) },
  { field: 'phone', label: 'Phone', read: (d) => text(d?.contactInfo?.phone) },
  {
    field: 'confidence',
    label: 'Self-reported confidence',
    read: (d) => (typeof d?.meta?.confidence === 'number' ? String(d.meta.confidence) : null),
    // Both sides emit a number called confidence. They are produced by
    // unrelated algorithms against unrelated scales, so putting them in the
    // same row and calling a difference a disagreement would be a fiction.
    notComparable:
      'Both parsers report a number called confidence, computed by unrelated algorithms on unrelated scales. The values are shown side by side and not compared.',
  },
];

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function stateFor(ai: string | null, openResume: string | null): FieldState {
  if (ai === null && openResume === null) return 'missing-from-both';
  if (ai !== null && openResume === null) return 'ai-only';
  if (ai === null && openResume !== null) return 'openresume-only';
  return normalizeKey(ai) === normalizeKey(openResume) ? 'same' : 'different';
}

function compareFields(ai: any, openResume: any): FieldDifference[] {
  return SCALAR_FIELDS.map((field) => {
    const aiValue = field.read(ai);
    const orValue = field.read(openResume);

    if (field.notComparable !== undefined) {
      return {
        field: field.field,
        label: field.label,
        state: 'not-comparable' as const,
        ai: aiValue,
        openResume: orValue,
        rule: field.notComparable,
      };
    }

    return {
      field: field.field,
      label: field.label,
      state: stateFor(aiValue, orValue),
      ai: aiValue,
      openResume: orValue,
      rule: 'Equal after trimming, lower-casing and collapsing whitespace.',
    };
  });
}

/** Fields one schema has and the other does not, named rather than dropped. */
function uncomparableFields(): UncomparableField[] {
  return [
    {
      field: 'meta.model',
      side: 'ai',
      reason:
        'Only the AI result records a model, because only the AI path calls one. The openresume parser has no counterpart.',
    },
    {
      field: 'meta.processingTimeMs',
      side: 'ai',
      reason:
        'The AI service stamps its own duration into the result. The openresume result carries none, so the lab times that side from outside instead.',
    },
    {
      field: 'token usage and cost',
      side: 'ai',
      reason:
        'The openresume parser makes no provider call. It is left empty rather than zeroed, because zero tokens and no tokens are different claims.',
    },
    {
      field: 'experiences[].bullets',
      side: 'both',
      reason:
        'Both schemas carry bullets, and the two parsers split them so differently — one on model output, one on line breaks — that matching them per record would report noise as disagreement. Counted as nested entities on each side, not compared.',
    },
  ];
}

/* ===========================================================================
 * Warnings
 * ======================================================================== */

/** Counts this far apart are worth a look, whichever side is larger. */
const DIVERGENCE_RATIO = 3;

/**
 * Deterministic comparison diagnostics.
 *
 * Nothing here judges which parser did better. A rule fires on a fact — a
 * side failed, a section is empty on one side only, two counts are far apart
 * — and the operator draws the conclusion.
 */
export function buildComparisonWarnings(
  ai: ParserRun | null,
  openResume: ParserRun | null,
  entities: EntityComparison[]
): ResumeLabWarning[] {
  const warnings: ResumeLabWarning[] = [];
  const add = (
    code: string,
    severity: ResumeLabWarning['severity'],
    message: string,
    evidence: string | null = null
  ) => warnings.push({ code, severity, message, evidence });

  // The TODO asks for this one in as many words.
  add(
    'openresume-untested-baseline',
    'info',
    'The openresume side is dead code: nothing in the product imports it, and this lab is its first consumer. Treat its output as an untested baseline.',
    null
  );

  add(
    'openresume-positions-synthesized',
    'info',
    'The OpenResume algorithm works from text positions, and `lib/resume-parser/read-pdf.ts` synthesizes them from plain text on a fixed grid rather than reading the page. Layout-dependent results from this side reflect that approximation.',
    null
  );

  const aiFailed = ai !== null && ai.outcome === 'failed';
  const orFailed = openResume !== null && openResume.outcome === 'failed';

  if (aiFailed && orFailed) {
    add(
      'both-parsers-failed',
      'error',
      'Neither parser produced a result for this document.',
      null
    );
  } else if (aiFailed) {
    add(
      'ai-failed-openresume-succeeded',
      'error',
      'The shipped AI path failed on a document the legacy parser handled.',
      ai?.error ?? null
    );
  } else if (orFailed) {
    add(
      'openresume-failed-ai-succeeded',
      'warning',
      'The legacy parser rejected a document the shipped AI path handled. Expected often enough to be worth noting rather than alarming.',
      openResume?.error ?? null
    );
  }

  if (
    ai !== null &&
    ai.outcome === 'parsed' &&
    ai.ai !== null &&
    ai.ai.usage.status !== 'observed'
  ) {
    add(
      'ai-telemetry-unavailable',
      'warning',
      'The AI side ran without reporting provider usage, so its cost for this comparison is unknown rather than zero.',
      ai.ai.usage.status
    );
  }

  for (const section of entities) {
    if (section.aiCount > 0 && section.openResumeCount === 0) {
      add(
        'section-ai-only',
        'warning',
        `${section.label}: the AI path found ${section.aiCount} and the legacy parser found none.`,
        `${section.aiCount} vs 0 · ${section.type}`
      );
      continue;
    }
    if (section.openResumeCount > 0 && section.aiCount === 0) {
      add(
        'section-openresume-only',
        'warning',
        `${section.label}: the legacy parser found ${section.openResumeCount} and the AI path found none.`,
        `0 vs ${section.openResumeCount} · ${section.type}`
      );
      continue;
    }

    const high = Math.max(section.aiCount, section.openResumeCount);
    const low = Math.min(section.aiCount, section.openResumeCount);
    if (low > 0 && high >= low * DIVERGENCE_RATIO) {
      add(
        'entity-count-divergence',
        'warning',
        `${section.label}: ${section.aiCount} from the AI path against ${section.openResumeCount} from the legacy parser.`,
        `${section.aiCount} vs ${section.openResumeCount} · ${section.type}`
      );
    }

    if (
      section.aiCount !== section.aiDistinct ||
      section.openResumeCount !== section.openResumeDistinct
    ) {
      add(
        'duplicate-records',
        'info',
        `${section.label}: a parser returned records that share a match key, so the distinct counts are lower than the raw ones.`,
        `ai ${section.aiCount}/${section.aiDistinct} · openresume ${section.openResumeCount}/${section.openResumeDistinct}`
      );
    }
  }

  return warnings;
}

/* ===========================================================================
 * The projection
 * ======================================================================== */

/** Compares two normalized results. Pure: it calls nothing and times nothing. */
export function buildComparison(
  aiData: unknown,
  openResumeData: unknown,
  summary: ResumeComparison['summary']
): ResumeComparison {
  return {
    summary,
    entities: SECTIONS.map((section) => compareSection(section, aiData, openResumeData)),
    fields: compareFields(aiData, openResumeData),
    uncomparable: uncomparableFields(),
    projectionNote: PROJECTION_NOTE,
  };
}
