/**
 * The posting's requirements against the resume's skill list.
 *
 * Both sides resolve through the shared skill list, so names never have to
 * match letter for letter: "DBMS" answers "Database Management Systems",
 * PostgreSQL answers SQL, and a B.Tech in Computer Science and Engineering
 * answers "Bachelor's degree in Computer Science". A requirement counts in
 * full when experience, the summary, a project, or a certification shows
 * it, in part when only the skills or education section names it, and at
 * half when the resume only has a close skill.
 */

import { plural } from '@/lib/resume-edit/review';
import { hasTerm, indexText, termForms, type TextIndex } from '@/services/ai/evaluate/keywords';
import type {
  RequirementMatch,
  ResumeSkill,
  SkillEvidence,
  SkillMatchCheck,
  SkillMatchKind,
  SkillSource,
} from '@/services/ai/evaluate/types';
import type { JobRequirement, RequirementImportance } from '@/services/ai/job-requirements/types';
import type { EditFacts } from '@/services/ai/resume-edit/facts';

import {
  ancestorsOf,
  catalogEntry,
  customSkillId,
  isGeneric,
  parentsOf,
  resolveSkill,
  shareSpecificParent,
} from './catalog';
import { isDegreeText, matchDegree, readDegreeRequirement, readResumeDegree } from './education';
import { readSkillLines, SKILL_SOURCES } from './profile';

const SHOWN_IN: ReadonlySet<SkillSource> = new Set([
  'experience',
  'summary',
  'projects',
  'certifications',
]);

const WEIGHT: Record<RequirementImportance, number> = { required: 2, preferred: 1 };
/** Share of the credit a skill earns when it is only listed, not shown in a role. */
export const LISTED_CREDIT = 0.75;
/** Share of the credit a close skill earns, e.g. MySQL for PostgreSQL. */
export const RELATED_CREDIT = 0.5;

const MATCH_CREDIT: Record<SkillMatchKind, number> = {
  exact: 1,
  implied: 1,
  related: RELATED_CREDIT,
  missing: 0,
};

export const SKILL_SOURCE_LABELS: Record<SkillSource, string> = {
  experience: 'experience',
  summary: 'summary',
  projects: 'projects',
  certifications: 'certifications',
  skills: 'skills list',
  education: 'education',
};

function evidenceFor(where: readonly SkillSource[], credential: boolean): SkillEvidence {
  if (where.length === 0) return 'missing';
  if (credential || where.some((source) => SHOWN_IN.has(source))) return 'shown';
  return 'listed';
}

function sortSources(where: Iterable<SkillSource>): SkillSource[] {
  return [...new Set(where)].sort((a, b) => SKILL_SOURCES.indexOf(a) - SKILL_SOURCES.indexOf(b));
}

/** Catalog ids the requirement stands for: its term, then its aliases. */
function requirementIds(requirement: JobRequirement): string[] {
  const ids = [requirement.term, ...requirement.aliases]
    .map(resolveSkill)
    .filter((id): id is string => id !== null);
  return [...new Set(ids)];
}

function customIds(requirement: JobRequirement): Set<string> {
  return new Set([requirement.term, ...requirement.aliases].map(customSkillId));
}

function closeness(
  skill: ResumeSkill,
  ids: readonly string[],
  custom: ReadonlySet<string>,
  broader: readonly string[]
): SkillMatchKind {
  if (custom.has(skill.id) || ids.includes(skill.id)) return 'exact';
  const skillBroader = new Set([...ancestorsOf(skill.id), ...skill.broader]);
  for (const id of skill.broader) for (const above of ancestorsOf(id)) skillBroader.add(above);
  if (ids.some((id) => skillBroader.has(id))) return 'implied';
  if (ids.some((id) => shareSpecificParent(skill.id, id))) return 'related';
  // The resume has the tool the posting names a flavor of: SQL for PostgreSQL, JavaScript for React.
  if (
    catalogEntry(skill.id)?.kind === 'tool' &&
    ids.some((id) => parentsOf(id).includes(skill.id))
  ) {
    return 'related';
  }
  // A skill the list does not know, placed by the model under the same group.
  const specific = (list: Iterable<string>) => [...list].filter((id) => !isGeneric(id));
  const wanted = new Set(specific([...broader, ...ids.flatMap((id) => [...parentsOf(id)])]));
  if (specific([...skill.broader, ...parentsOf(skill.id)]).some((id) => wanted.has(id))) {
    return 'related';
  }
  return 'missing';
}

const RANK: Record<SkillMatchKind, number> = { exact: 3, implied: 2, related: 1, missing: 0 };

interface Context {
  facts: EditFacts;
  skills: readonly ResumeSkill[];
  sections: ReadonlyArray<{ source: SkillSource; index: TextIndex }>;
}

function matchDegreeRequirement(requirement: JobRequirement, context: Context): RequirementMatch {
  const degrees = context.facts.degrees.map((item) => readResumeDegree(item.ref, item));
  const result = matchDegree(readDegreeRequirement(requirement.term, requirement.degree), degrees);
  const match: SkillMatchKind =
    result.fit === 'meets' ? 'exact' : result.fit === 'partly' ? 'related' : 'missing';
  return {
    term: requirement.term,
    kind: requirement.kind,
    importance: requirement.importance,
    match,
    evidence: match === 'missing' ? 'missing' : 'shown',
    where: match === 'missing' ? [] : ['education'],
    via: result.degree?.label ?? null,
    skills: [],
  };
}

function matchSkillRequirement(requirement: JobRequirement, context: Context): RequirementMatch {
  const ids = requirementIds(requirement);
  const custom = customIds(requirement);
  const broader = (requirement.broader ?? [])
    .map(resolveSkill)
    .filter((id): id is string => id !== null);

  let best: SkillMatchKind = 'missing';
  let matched: ResumeSkill[] = [];
  for (const skill of context.skills) {
    const kind = closeness(skill, ids, custom, broader);
    if (kind === 'missing' || RANK[kind] < RANK[best]) continue;
    if (RANK[kind] > RANK[best]) matched = [];
    best = kind;
    matched.push(skill);
  }

  // Words the skill list cannot place still count when the resume writes them.
  // Known skills follow the list's rules instead, so "go" in prose is not Go.
  if (best !== 'exact' && ids.length === 0) {
    const forms = termForms(requirement.term, requirement.aliases);
    const where = context.sections
      .filter((section) => hasTerm(section.index, forms))
      .map((section) => section.source);
    if (where.length > 0) {
      return {
        term: requirement.term,
        kind: requirement.kind,
        importance: requirement.importance,
        match: 'exact',
        evidence: evidenceFor(where, requirement.kind === 'credential'),
        where: sortSources(where),
        via: null,
        skills: [],
      };
    }
  }

  const where = sortSources(matched.flatMap((skill) => skill.where));
  const via = best === 'exact' ? null : (matched[0]?.label ?? null);
  return {
    term: requirement.term,
    kind: requirement.kind,
    importance: requirement.importance,
    match: best,
    evidence: evidenceFor(where, requirement.kind === 'credential'),
    where,
    via,
    skills: matched.map((skill) => skill.id),
  };
}

function isDegree(requirement: JobRequirement): boolean {
  return (
    requirement.kind === 'credential' &&
    (requirement.degree != null || isDegreeText(requirement.term))
  );
}

function credit(match: RequirementMatch): number {
  const evidence = match.evidence === 'shown' ? 1 : match.evidence === 'listed' ? LISTED_CREDIT : 0;
  return evidence * MATCH_CREDIT[match.match];
}

function isMet(match: RequirementMatch): boolean {
  return match.match === 'exact' || match.match === 'implied';
}

function tally(matches: RequirementMatch[], importance: RequirementImportance) {
  const items = matches.filter((match) => match.importance === importance);
  return { met: items.filter(isMet).length, total: items.length };
}

function summaryFor(check: Omit<SkillMatchCheck, 'summary' | 'score' | 'matches'>): string {
  const { required, preferred, related, listedOnly } = check;
  if (required.total + preferred.total === 0) return 'This posting asks for no specific skills.';
  return [
    required.total > 0 ? `Required: ${required.met} of ${required.total} on your resume.` : null,
    preferred.total > 0 ? `Nice to have: ${preferred.met} of ${preferred.total}.` : null,
    related > 0
      ? `${plural(related, 'close match', 'close matches')} ${related === 1 ? 'counts' : 'count'} for half.`
      : null,
    listedOnly > 0
      ? `${plural(listedOnly, 'skill')} only listed, not shown in your experience.`
      : null,
  ]
    .filter(Boolean)
    .join(' ');
}

/** The posting's requirements against the resume's skill list and education. */
export function matchRequirements(
  facts: EditFacts,
  skills: readonly ResumeSkill[],
  requirements: readonly JobRequirement[]
): SkillMatchCheck {
  const lines = readSkillLines(facts);
  const context: Context = {
    facts,
    skills,
    sections: SKILL_SOURCES.map((source) => ({
      source,
      index: indexText(
        lines
          .filter((line) => line.source === source)
          .map((line) => line.text)
          .join('\n')
      ),
    })),
  };

  const matches = requirements.map((requirement) =>
    isDegree(requirement)
      ? matchDegreeRequirement(requirement, context)
      : matchSkillRequirement(requirement, context)
  );
  const ordered = [
    ...matches.filter((match) => match.importance === 'required'),
    ...matches.filter((match) => match.importance === 'preferred'),
  ];

  let earned = 0;
  let possible = 0;
  for (const match of ordered) {
    earned += WEIGHT[match.importance] * credit(match);
    possible += WEIGHT[match.importance];
  }

  const counts = {
    required: tally(ordered, 'required'),
    preferred: tally(ordered, 'preferred'),
    related: ordered.filter((match) => match.match === 'related').length,
    listedOnly: ordered.filter((match) => isMet(match) && match.evidence === 'listed').length,
  };
  return {
    ...counts,
    score: possible === 0 ? null : Math.round((100 * earned) / possible),
    matches: ordered,
    summary: summaryFor(counts),
  };
}
