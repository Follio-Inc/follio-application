export {
  buildResumeEvidence,
  canonicalizeForEquality,
  evidenceMentions,
  extractNumericClaims,
  extractProperNouns,
  normalizeText,
  stripHtml,
  type ResumeEvidence,
} from './evidence';

export {
  extractOutcomeClaims,
  findUnsupportedOutcomeClaims,
  stemWord,
  type OutcomeCategory,
  type OutcomeCheckInput,
  type OutcomeClaim,
  type UnsupportedOutcome,
} from './outcomes';

export {
  blockingIssues,
  checkProposal,
  checkProposalBatch,
  isRewritableField,
  verdictFloorFromIssues,
  type GuardOptions,
} from './guards';

export {
  formatTargetRef,
  listRewriteTargets,
  parseTargetRef,
  proposalIdForTarget,
  resolveTarget,
  type TargetResolution,
} from './targets';

export {
  PROFILE_RECORD_ID,
  VERIFICATION_RANK,
  strictestVerdict,
  type EditProposal,
  type IssueSeverity,
  type ProposalDraft,
  type ProposalIssue,
  type ProposalTarget,
  type ResumeForRewrite,
  type RewriteField,
  type RewriteSection,
  type RewriteTargetView,
  type VerdictSource,
  type VerificationStatus,
  type VerificationVerdict,
} from './types';
