/**
 * The fact sheet for AI resume edits.
 *
 * Everything the model may rely on, with short refs it can point at
 * ("H", "S", "E1.2"). The same sheet is what the grounding step checks
 * claims against, so the prompt and the checks never disagree.
 */

import { plainLine, plainParagraphs, readBullets } from '@/lib/resume-edit/document';
import { RESUME_EDIT_LIMITS, type EditScope, type EditTarget } from '@/lib/resume-edit/types';
import { formatDateRange } from '@/lib/utils';

export interface EditSourceProfile {
  headline: string | null;
  summary: string | null;
  workExperiences: Array<{
    id: string;
    company: string;
    role: string;
    startDate: Date | string | null;
    endDate: Date | string | null;
    isCurrent: boolean;
    bullets: string[];
    bulletsHtml: string | null;
    isVisible: boolean;
  }>;
  skills: Array<{ name: string }>;
  educations: Array<{ institution: string; degree: string | null; fieldOfStudy: string | null }>;
  certifications: Array<{ name: string; issuer: string }>;
  projects: Array<{ title: string; description: string | null; techStack: string[] }>;
}

export interface FactBullet {
  ref: string;
  index: number;
  text: string;
}

export interface FactExperience {
  ref: string;
  id: string;
  label: string;
  dates: string;
  isCurrent: boolean;
  editable: boolean;
  bullets: FactBullet[];
}

export interface FactDegree {
  ref: string;
  degree: string;
  field: string;
  institution: string;
}

export interface FactLine {
  ref: string;
  text: string;
}

export interface EditFacts {
  headline: string;
  summary: string;
  experiences: FactExperience[];
  skills: string[];
  /** One line per entry: "degree, field, institution". */
  education: string[];
  /** Certifications, then projects, one line each. */
  other: string[];
  /** Education entries, refs "D1", "D2". */
  degrees: FactDegree[];
  /** Refs "C1", "C2". */
  certifications: FactLine[];
  /** Refs "P1", "P2". */
  projects: FactLine[];
}

export interface ResolvedRef {
  ref: string;
  target: EditTarget;
  label: string;
  before: string;
  /** Experience the line belongs to; numbers in a bullet must come from its own entry. */
  experience: FactExperience | null;
}

export function buildEditFacts(profile: EditSourceProfile): EditFacts {
  const experiences = profile.workExperiences
    .filter((item) => item.isVisible !== false)
    .map((item, position): FactExperience => {
      const ref = `E${position + 1}`;
      const view = readBullets(item);
      return {
        ref,
        id: item.id,
        label: [plainLine(item.role), plainLine(item.company)].filter(Boolean).join(' · '),
        dates: formatDateRange(item.startDate, item.endDate, item.isCurrent),
        isCurrent: item.isCurrent,
        editable: view.editable,
        bullets: view.lines
          .map((text, index) => ({ ref: `${ref}.${index + 1}`, index, text }))
          .filter((bullet) => bullet.text.length > 0),
      };
    });

  const degrees = profile.educations
    .map((item) => ({
      degree: plainLine(item.degree),
      field: plainLine(item.fieldOfStudy),
      institution: plainLine(item.institution),
    }))
    .filter((item) => item.degree || item.field || item.institution)
    .map((item, position): FactDegree => ({ ref: `D${position + 1}`, ...item }));
  const certifications = profile.certifications
    .map((item) => [plainLine(item.name), plainLine(item.issuer)].filter(Boolean))
    .filter((parts) => parts.length > 0)
    .map(
      ([name, issuer], position): FactLine => ({
        ref: `C${position + 1}`,
        text: issuer ? `${name} (${issuer})` : (name ?? ''),
      })
    );
  const projects = profile.projects
    .map((item) =>
      [plainLine(item.title), plainLine(item.description), item.techStack.join(', ')]
        .filter(Boolean)
        .join(' · ')
    )
    .filter(Boolean)
    .map((text, position): FactLine => ({ ref: `P${position + 1}`, text }));

  return {
    headline: plainLine(profile.headline),
    summary: plainParagraphs(profile.summary),
    experiences,
    skills: profile.skills.map((skill) => plainLine(skill.name)).filter(Boolean),
    education: degrees.map((item) =>
      [item.degree, item.field, item.institution].filter(Boolean).join(', ')
    ),
    other: [...certifications, ...projects].map((item) => item.text),
    degrees,
    certifications,
    projects,
  };
}

export function resolveRef(facts: EditFacts, ref: string): ResolvedRef | null {
  if (ref === 'H') {
    return {
      ref,
      target: { kind: 'headline' },
      label: 'Headline',
      before: facts.headline,
      experience: null,
    };
  }
  if (ref === 'S') {
    return {
      ref,
      target: { kind: 'summary' },
      label: 'Summary',
      before: facts.summary,
      experience: null,
    };
  }
  const match = ref.match(/^E(\d+)\.(\d+)$/);
  if (!match) return null;
  const experience = facts.experiences[Number(match[1]) - 1];
  const bullet = experience?.bullets.find((item) => item.ref === ref);
  if (!experience || !bullet || !experience.editable) return null;
  return {
    ref,
    target: { kind: 'bullet', experienceId: experience.id, index: bullet.index },
    label: experience.label,
    before: bullet.text,
    experience,
  };
}

/** A ref that adds a bullet after another: "E1.2+", or "E1.0+" to add it first. */
export const INSERT_SUFFIX = '+';

export interface ResolvedInsert {
  /** The insert ref itself, e.g. "E1.2+". */
  ref: string;
  /** The bullet it follows, e.g. "E1.2"; "E1.0" means first. */
  after: string;
  target: Extract<EditTarget, { kind: 'bullet' }>;
  label: string;
  /** Text of the bullet it follows; null when it goes first. */
  anchor: string | null;
  experience: FactExperience;
}

export function resolveInsertRef(facts: EditFacts, ref: string): ResolvedInsert | null {
  if (!ref.endsWith(INSERT_SUFFIX)) return null;
  const after = ref.slice(0, -INSERT_SUFFIX.length);
  const match = after.match(/^E(\d+)\.(\d+)$/);
  if (!match) return null;
  const experience = facts.experiences[Number(match[1]) - 1];
  if (!experience?.editable || experience.bullets.length === 0) return null;
  const bullet = match[2] === '0' ? null : experience.bullets.find((item) => item.ref === after);
  if (match[2] !== '0' && !bullet) return null;
  return {
    ref,
    after,
    target: {
      kind: 'bullet',
      experienceId: experience.id,
      index: bullet ? bullet.index + 1 : 0,
    },
    label: experience.label,
    anchor: bullet?.text ?? null,
    experience,
  };
}

/** One request to the model: the refs it may edit, and a name for the section. */
export interface EditBatch {
  section: string;
  refs: string[];
  /** Experience shown in full; others appear as one line each. Null shows header context only. */
  experience: FactExperience | null;
}

export function planBatches(facts: EditFacts, scope: EditScope): EditBatch[] {
  const batches: EditBatch[] = [];
  const includeHeader = scope.kind === 'all' || scope.kind === 'summary';
  if (includeHeader) {
    const refs = [facts.headline ? 'H' : null, facts.summary ? 'S' : null].filter(
      (ref): ref is string => ref !== null
    );
    if (refs.length > 0) batches.push({ section: 'Summary', refs, experience: null });
  }

  const experiences =
    scope.kind === 'all'
      ? facts.experiences.slice(0, RESUME_EDIT_LIMITS.maxExperiences)
      : scope.kind === 'experience'
        ? facts.experiences.filter((item) => item.id === scope.experienceId)
        : [];

  for (const experience of experiences) {
    if (!experience.editable || experience.bullets.length === 0) continue;
    batches.push({
      section: experience.label || 'Experience',
      refs: experience.bullets.map((bullet) => bullet.ref),
      experience,
    });
  }
  return batches;
}

/** Every true statement on the resume, as one block of text. */
export function factCorpus(facts: EditFacts): string {
  return [
    facts.headline,
    facts.summary,
    ...facts.experiences.flatMap((item) => [
      item.label,
      item.dates,
      ...item.bullets.map((bullet) => bullet.text),
    ]),
    ...facts.skills,
    ...facts.education,
    ...facts.other,
  ].join('\n');
}

/** What one job entry states. A bullet's numbers have to come from here. */
export function experienceCorpus(experience: FactExperience): string {
  return [
    experience.label,
    experience.dates,
    ...experience.bullets.map((bullet) => bullet.text),
  ].join('\n');
}
