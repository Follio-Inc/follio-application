/**
 * Target-role evaluation — types.
 *
 * A "role profile" is an **application-defined** description of what a job
 * family usually asks for. It is not a job posting, not a standard, and not a
 * statement about any particular employer's bar. See `RoleProfile.provenance`.
 *
 * These profiles exist so a user can ask "how does my resume read for a
 * Technical Program Manager?" without pasting a job description. Because no
 * real posting is involved, role evaluation deliberately reports **competency
 * coverage**, never a percentage match or an ATS score — see
 * `RoleCoverageResult`.
 */

/** Stable ids. Extend `ROLE_PROFILES` to add a role. */
export type RoleProfileId =
  | 'technical-program-manager'
  | 'software-engineer'
  | 'data-scientist'
  | 'product-manager';

export interface RoleCompetency {
  id: string;
  /** Human-readable name, shown in the UI. */
  label: string;
  /** What evidence for this competency usually looks like on a resume. */
  description: string;
  /**
   * Lexical signals used for deterministic evidence detection. Matched as
   * normalized substrings against the resume corpus — never shown to the user
   * as "you are missing X", only used to decide whether evidence was found.
   */
  signals: string[];
}

export interface RoleProfile {
  id: RoleProfileId;
  /** Canonical display name, e.g. "Technical Program Manager". */
  label: string;
  /** Alternative spellings a user might type, normalized on lookup. */
  aliases: string[];
  summary: string;
  competencies: RoleCompetency[];
  /** Resume job titles that count as direct experience in this family. */
  signalTitles: string[];
  /** Where this profile came from. Surfaced to the user, verbatim. */
  provenance: string;
}

/** How much evidence the resume carries for one competency. */
export type CompetencyCoverage = 'covered' | 'partial' | 'absent';

export interface CompetencyFinding {
  id: string;
  label: string;
  description: string;
  coverage: CompetencyCoverage;
  /**
   * The signal phrases actually found in the resume. Empty for `absent`.
   * These are quotes from the resume's own text, so a user can verify them.
   */
  evidence: string[];
}

/**
 * Qualitative band for role coverage.
 *
 * Deliberately NOT a 0-100 score and deliberately not reusing `MatchBand`
 * from lib/jd-match: that band describes similarity to a real posting. There
 * is no posting here, so a numeric score would imply a precision this method
 * does not have.
 */
export type RoleCoverageBand = 'broad' | 'partial' | 'limited';

export interface RoleCoverageResult {
  roleId: RoleProfileId;
  roleLabel: string;
  roleSummary: string;
  band: RoleCoverageBand;
  /** e.g. "Evidence found for 4 of 6 competencies." */
  label: string;
  competencies: CompetencyFinding[];
  coveredCount: number;
  partialCount: number;
  absentCount: number;
  totalCompetencies: number;
  /** Resume titles that align with this role family, if any. */
  matchingTitles: string[];
  /** Verbatim `RoleProfile.provenance`. */
  provenance: string;
  /** Why this is not an ATS score. Surfaced in the UI. */
  basis: string;
}
