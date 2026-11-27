/**
 * Deterministic target-role coverage.
 *
 * No LLM call: this is lexical evidence detection over the same `ResumeCorpus`
 * that lib/jd-match builds, so JD mode and role mode read the resume the same
 * way. Reusing the corpus is the point — it already handles visibility
 * filtering, HTML stripping and section flattening.
 *
 * Why this reports coverage instead of a score: in JD mode there is a real
 * posting to compare against, so a percentage means something. Here there is
 * no posting, only Follio's own description of a role family. Emitting "73%
 * match" from that would dress an application-defined checklist up as an ATS
 * verdict, so this reports which competencies have evidence, which are thin,
 * and which were not found — plus the evidence itself, so the user can check.
 */

import { normalizeToken } from '@/lib/jd-match/tokenize';

import type { ResumeCorpus } from '@/lib/jd-match/types';
import type {
  CompetencyCoverage,
  CompetencyFinding,
  RoleCoverageBand,
  RoleCoverageResult,
  RoleProfile,
} from './types';

/** Signal hits needed before a competency counts as covered rather than partial. */
const COVERED_THRESHOLD = 2;

const BASIS =
  'Coverage is detected by matching role-profile signal phrases against the text of this ' +
  'resume. It reports where evidence was found, not whether you are qualified, and it is not ' +
  'an ATS score — no job posting or applicant tracking system is involved.';

function bandFromCoverage(covered: number, partial: number, total: number): RoleCoverageBand {
  if (total === 0) return 'limited';
  const weighted = (covered + partial * 0.5) / total;
  if (weighted >= 0.7) return 'broad';
  if (weighted >= 0.35) return 'partial';
  return 'limited';
}

function labelForCoverage(covered: number, total: number): string {
  if (covered === 0) return `No clear evidence found for any of the ${total} competencies.`;
  return `Evidence found for ${covered} of ${total} competencies.`;
}

/**
 * Find which role titles on the resume align with this role family.
 * Substring match in both directions, so "Senior Technical Program Manager"
 * matches the signal title "technical program manager".
 */
function findMatchingTitles(corpus: ResumeCorpus, role: RoleProfile): string[] {
  const signals = role.signalTitles.map((title) => normalizeToken(title)).filter(Boolean);
  const matches: string[] = [];

  for (const resumeRole of corpus.roles) {
    const norm = normalizeToken(resumeRole);
    if (!norm) continue;
    if (signals.some((signal) => norm.includes(signal))) {
      matches.push(resumeRole);
    }
  }

  // Dedupe, preserving the resume's own spelling.
  return [...new Map(matches.map((title) => [normalizeToken(title), title])).values()];
}

/**
 * Evaluate one resume against one application-defined role profile.
 *
 * `evidence` holds the signal phrases actually present in the resume text, so
 * every "covered" verdict is traceable. Nothing here asserts that an absent
 * signal means absent experience — see `RoleCoverageResult.basis`.
 */
export function evaluateRoleCoverage(corpus: ResumeCorpus, role: RoleProfile): RoleCoverageResult {
  // One normalized haystack per resume, built once for all competencies.
  const haystack = normalizeToken(
    [
      corpus.headline,
      corpus.summary,
      corpus.skills.join(' '),
      corpus.roles.join(' '),
      corpus.bodyText,
    ]
      .filter(Boolean)
      .join('\n')
  );

  const competencies: CompetencyFinding[] = role.competencies.map((competency) => {
    const evidence: string[] = [];

    for (const signal of competency.signals) {
      const norm = normalizeToken(signal);
      if (norm && haystack.includes(norm)) {
        evidence.push(signal);
      }
    }

    const coverage: CompetencyCoverage =
      evidence.length >= COVERED_THRESHOLD
        ? 'covered'
        : evidence.length === 1
          ? 'partial'
          : 'absent';

    return {
      id: competency.id,
      label: competency.label,
      description: competency.description,
      coverage,
      evidence,
    };
  });

  const coveredCount = competencies.filter((c) => c.coverage === 'covered').length;
  const partialCount = competencies.filter((c) => c.coverage === 'partial').length;
  const absentCount = competencies.filter((c) => c.coverage === 'absent').length;
  const total = competencies.length;

  return {
    roleId: role.id,
    roleLabel: role.label,
    roleSummary: role.summary,
    band: bandFromCoverage(coveredCount, partialCount, total),
    label: labelForCoverage(coveredCount, total),
    competencies,
    coveredCount,
    partialCount,
    absentCount,
    totalCompetencies: total,
    matchingTitles: findMatchingTitles(corpus, role),
    provenance: role.provenance,
    basis: BASIS,
  };
}
