/**
 * Resume rewriting — shared contracts.
 *
 * Phase 3A proposes edits; it never applies them. Everything in this module
 * describes a *proposal* about resume text, plus the deterministic evidence
 * for or against it. Nothing here writes to a database, calls a model, or
 * touches the network.
 *
 * Two ideas carry most of the weight:
 *
 *   1. **A proposal is addressed, not searched for.** A proposal names a
 *      stable record id and a field path (`ProposalTarget`), so applying one
 *      later is a field write rather than a string search through a resume
 *      that may have changed in the meantime.
 *   2. **A proposal is a claim that can be checked.** `ProposalIssue` is what
 *      a deterministic check found wrong with it — and because the checks are
 *      code, an approving model cannot make an issue go away.
 */

/** Which part of the resume a proposal edits. */
export type RewriteSection = 'summary' | 'experience' | 'project';

/**
 * Fields a rewrite may address.
 *
 * Deliberately short. Employer names, job titles, dates, institutions,
 * degrees and certifications are **not** addressable in Phase 3A: they are
 * factual identifiers, and the safest way to guarantee a rewrite cannot
 * change one is to give the agents no way to name it.
 */
export type RewriteField = 'summary' | 'bullets' | 'highlights' | 'description';

/**
 * A stable reference to one piece of resume text.
 *
 * `recordId` is the database id of the owning row (`WorkExperience.id`,
 * `Project.id`) or the sentinel `profile` for resume-level fields. `index` is
 * the position within an array field and is absent for scalar fields.
 */
export interface ProposalTarget {
  section: RewriteSection;
  recordId: string;
  field: RewriteField;
  index?: number;
}

/** The sentinel `recordId` for fields that live on the resume row itself. */
export const PROFILE_RECORD_ID = 'profile';

/** One addressable piece of resume text, with the text as it stands today. */
export interface RewriteTargetView {
  target: ProposalTarget;
  /** Canonical string form, e.g. `experience:exp1:bullets:0`. */
  targetRef: string;
  /** Human-readable location, e.g. `Senior Engineer @ Acme — bullet 1`. */
  label: string;
  /** The resume's own current text at this target. */
  text: string;
}

// ============================================================================
// ISSUES
// ============================================================================

/**
 * How badly a deterministic check failed.
 *
 * The severity is what decides the verdict floor, so these map one-to-one
 * onto `VerificationStatus`:
 *
 *   blocking → rejected          (the proposal says something the resume does not)
 *   revision → revision_required (fixable: the wording went too far or lost a fact)
 *   clarify  → needs_user_input  (only the user can settle it)
 *   info     → no effect         (worth reporting, decides nothing)
 */
export type IssueSeverity = 'blocking' | 'revision' | 'clarify' | 'info';

export interface ProposalIssue {
  /** Stable code, e.g. `unsupported-number`. Tests and the UI key off this. */
  code: string;
  severity: IssueSeverity;
  /** What was observed, stated factually. */
  detail: string;
  /** The text the check tripped on, when there is a specific fragment. */
  evidence?: string;
}

// ============================================================================
// PROPOSALS
// ============================================================================

/** What an agent proposes, before the deterministic checks have run on it. */
export interface ProposalDraft {
  /** Derived from the target in code — never supplied by a model. */
  proposalId: string;
  target: ProposalTarget;
  targetRef: string;
  /** The text as the proposer claims it stands. Checked against the resume. */
  originalText: string;
  proposedText: string;
  /** Why this is better. Model prose. */
  explanation: string;
  /** JD keywords or role competencies this addresses. Checked for support. */
  keywordsAddressed: string[];
  /** Quotes from the resume backing any factual content. Checked to exist. */
  sourceEvidence: string[];
  /** What the proposer could not settle without asking the user. */
  uncertainties: string[];
}

/** A draft plus everything the deterministic layer established about it. */
export interface EditProposal extends ProposalDraft {
  /** Human-readable location of the target. Computed. */
  label: string;
  section: RewriteSection;
  /** Which rewrite round produced it. 0 is the first attempt. */
  revisionRound: number;
  /** Everything the deterministic checks found. Computed, never model-set. */
  deterministicIssues: ProposalIssue[];
}

// ============================================================================
// VERIFICATION
// ============================================================================

/**
 * The verdict on one proposal.
 *
 * `approved` is the only one that lets a proposal be shown to the user as
 * verified, and it is the only one no deterministic check can produce on its
 * own — it is what remains when nothing objected.
 */
export type VerificationStatus = 'approved' | 'revision_required' | 'rejected' | 'needs_user_input';

/** Strictness order. A verdict is the strictest of everything that applies. */
export const VERIFICATION_RANK: Record<VerificationStatus, number> = {
  approved: 0,
  needs_user_input: 1,
  revision_required: 2,
  rejected: 3,
};

/** Return whichever verdict is stricter. */
export function strictestVerdict(a: VerificationStatus, b: VerificationStatus): VerificationStatus {
  return VERIFICATION_RANK[a] >= VERIFICATION_RANK[b] ? a : b;
}

/** What produced the final verdict, so a reader can tell code from model. */
export type VerdictSource = 'deterministic' | 'model' | 'deterministic+model';

export interface VerificationVerdict {
  proposalId: string;
  targetRef: string;
  status: VerificationStatus;
  /** Why this verdict. */
  reason: string;
  /** Specific claims the verifier could not support. */
  questionableClaims: string[];
  /** What a revision must change, when the verdict asks for one. */
  requiredRevisions: string[];
  /** Resume text supporting what survived. */
  supportingEvidence: string[];
  /** The deterministic findings this verdict rests on. */
  deterministicIssues: ProposalIssue[];
  decidedBy: VerdictSource;
}

// ============================================================================
// RESUME SHAPE
// ============================================================================

/**
 * The resume shape this module needs.
 *
 * A structural subset of `ConnectorProfileView`, for the same reason
 * `ResumeForQuality` is one: the agent's `AgentResumeView` is assignable
 * without an adapter, and lib/ stays independent of the connector's exact
 * type.
 */
export interface ResumeForRewrite {
  headline: string | null;
  summary: string | null;
  skills: string[];
  experiences: Array<{
    id: string;
    company: string;
    role: string;
    bullets: string[];
  }>;
  education: Array<{
    id: string;
    institution: string;
    degree: string | null;
    fieldOfStudy?: string | null;
  }>;
  projects: Array<{
    id: string;
    title: string;
    description: string | null;
    highlights: string[];
    techStack: string[];
  }>;
}
