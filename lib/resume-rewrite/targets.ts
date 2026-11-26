/**
 * Addressing resume text.
 *
 * A rewrite proposal has to say *where* it applies precisely enough that
 * applying it later is a field write, not a search-and-replace. Searching for
 * the original string is the obvious design and the wrong one: two bullets
 * under different roles are often identical, HTML and whitespace drift, and
 * the resume may have been edited between the proposal and the approval. So
 * every proposal carries a `ProposalTarget` — a record id and a field path —
 * and this module is the only place that turns one into text.
 *
 * It is also where Phase 3A's scope boundary is enforced in code rather than
 * in a prompt: `listRewriteTargets` enumerates the *only* fields an agent can
 * address. Employer names, job titles, dates, institutions, degrees and
 * certifications are not in the list, so no proposal can name one.
 */

import {
  PROFILE_RECORD_ID,
  type ProposalTarget,
  type ResumeForRewrite,
  type RewriteField,
  type RewriteSection,
  type RewriteTargetView,
} from './types';

const SECTIONS: readonly RewriteSection[] = ['summary', 'experience', 'project'];
const FIELDS: readonly RewriteField[] = ['summary', 'bullets', 'highlights', 'description'];

/** Field paths that are legal for each section. Everything else is refused. */
const ALLOWED: Record<RewriteSection, readonly RewriteField[]> = {
  summary: ['summary'],
  experience: ['bullets'],
  project: ['highlights', 'description'],
};

/** Fields addressed by position within an array. */
const INDEXED: readonly RewriteField[] = ['bullets', 'highlights'];

/** Canonical string form of a target. Stable, and safe in an id. */
export function formatTargetRef(target: ProposalTarget): string {
  const parts = [target.section, target.recordId, target.field];
  if (target.index !== undefined) parts.push(String(target.index));
  return parts.join(':');
}

/** Parse a canonical ref. Returns null for anything malformed or out of scope. */
export function parseTargetRef(ref: string): ProposalTarget | null {
  const parts = String(ref ?? '').split(':');
  if (parts.length < 3 || parts.length > 4) return null;

  const [section, recordId, field, rawIndex] = parts;
  if (!SECTIONS.includes(section as RewriteSection)) return null;
  if (!FIELDS.includes(field as RewriteField)) return null;
  if (!recordId) return null;

  const typedSection = section as RewriteSection;
  const typedField = field as RewriteField;
  if (!ALLOWED[typedSection].includes(typedField)) return null;

  const needsIndex = INDEXED.includes(typedField);
  if (needsIndex) {
    if (rawIndex === undefined) return null;
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index < 0) return null;
    return { section: typedSection, recordId, field: typedField, index };
  }

  if (rawIndex !== undefined) return null;
  return { section: typedSection, recordId, field: typedField };
}

/**
 * The proposal id for a target.
 *
 * Derived from the target rather than generated, so the same target keeps the
 * same id across rewrite rounds. That is what lets a verifier's feedback on
 * round one be matched to the revised proposal in round two without either
 * agent having to carry an id through a prompt.
 */
export function proposalIdForTarget(target: ProposalTarget): string {
  return `prop_${formatTargetRef(target).replace(/[^a-zA-Z0-9]+/g, '_')}`;
}

/** Where a role's text lives, for display. */
function experienceLabel(role: string, company: string): string {
  return [role, company].filter(Boolean).join(' @ ') || 'Work experience';
}

/**
 * Every piece of resume text an agent may rewrite, with its current value.
 *
 * Empty strings are included for experience bullets and project highlights
 * only when they already exist as array entries — a rewrite replaces text, it
 * does not add new bullets, so there is nothing to address at an index the
 * resume does not have.
 */
export function listRewriteTargets(resume: ResumeForRewrite): RewriteTargetView[] {
  const targets: RewriteTargetView[] = [];

  const push = (target: ProposalTarget, label: string, text: string | null | undefined) => {
    targets.push({ target, targetRef: formatTargetRef(target), label, text: text ?? '' });
  };

  if (typeof resume.summary === 'string' && resume.summary.trim()) {
    push(
      { section: 'summary', recordId: PROFILE_RECORD_ID, field: 'summary' },
      'Professional summary',
      resume.summary
    );
  }

  for (const experience of resume.experiences ?? []) {
    const label = experienceLabel(experience.role, experience.company);
    experience.bullets?.forEach((bullet, index) => {
      push(
        { section: 'experience', recordId: experience.id, field: 'bullets', index },
        `${label} — bullet ${index + 1}`,
        bullet
      );
    });
  }

  for (const project of resume.projects ?? []) {
    const label = project.title || 'Project';
    if (typeof project.description === 'string' && project.description.trim()) {
      push(
        { section: 'project', recordId: project.id, field: 'description' },
        `${label} — description`,
        project.description
      );
    }
    project.highlights?.forEach((highlight, index) => {
      push(
        { section: 'project', recordId: project.id, field: 'highlights', index },
        `${label} — highlight ${index + 1}`,
        highlight
      );
    });
  }

  return targets;
}

/** Resolving a target against the live resume: the text, or why there is none. */
export type TargetResolution = { ok: true; view: RewriteTargetView } | { ok: false; error: string };

/**
 * Look up one target in the live resume.
 *
 * Resolution goes through `listRewriteTargets`, so a target that is legal to
 * parse but out of scope to rewrite still fails here. There is exactly one
 * definition of what is addressable.
 */
export function resolveTarget(resume: ResumeForRewrite, target: ProposalTarget): TargetResolution {
  const ref = formatTargetRef(target);
  const view = listRewriteTargets(resume).find((candidate) => candidate.targetRef === ref);

  if (!view) {
    return {
      ok: false,
      error:
        `No rewritable resume element at "${ref}". Use list_rewrite_targets and copy a ` +
        'targetRef from it exactly — do not construct one.',
    };
  }

  return { ok: true, view };
}
