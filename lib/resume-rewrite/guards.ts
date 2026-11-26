/**
 * Deterministic guards on a rewrite proposal.
 *
 * This is the part of verification that does not depend on a model agreeing
 * with it. Every check here is a comparison between the proposed text, the
 * text it replaces, and what the resume actually says — so an LLM that
 * returns "approved" for a bullet containing an invented 40% cannot make the
 * 40% supported. `verdictFloorFromIssues` turns what these find into a verdict
 * *floor*, and the Verification Agent may only ever make a verdict stricter.
 *
 * What this cannot do, stated plainly because the alternative is a false
 * sense of safety:
 *
 *   - It cannot tell whether a rewrite means the same thing. "Supported the
 *     migration" and "Owned the migration" share every token this module can
 *     extract. Semantic drift is what the Verification Agent is for.
 *   - Its outcome check (./outcomes.ts) recognises result *constructions*. An
 *     outcome asserted in a shape those patterns do not match will pass here,
 *     and the Verification Agent's claim comparison is the second line.
 *   - Its extractors miss things. A metric written entirely in words, a
 *     lowercase product name in the middle of a sentence, a qualification
 *     implied rather than named — none of those are caught here.
 *   - "Unsupported" means *not written on this resume*. It is never evidence
 *     that the user did not do the thing, and no message here says it is.
 *
 * So this is a floor, not a proof. It is still worth having, because the
 * failures it catches — a confident invented number, and a benefit clause
 * stapled onto a true sentence — are the two that actually happen.
 */

import {
  buildResumeEvidence,
  canonicalizeForEquality,
  evidenceMentions,
  extractNumericClaims,
  extractProperNouns,
  normalizeText,
  stripHtml,
  type ResumeEvidence,
} from './evidence';
import { findUnsupportedOutcomeClaims } from './outcomes';
import { formatTargetRef, resolveTarget } from './targets';
import {
  strictestVerdict,
  type ProposalDraft,
  type ProposalIssue,
  type ProposalTarget,
  type ResumeForRewrite,
  type RewriteField,
  type RewriteSection,
  type VerificationStatus,
} from './types';

// ============================================================================
// SCOPE
// ============================================================================

/** The only section/field pairs Phase 3A may rewrite. */
const REWRITABLE: Record<RewriteSection, readonly RewriteField[]> = {
  summary: ['summary'],
  experience: ['bullets'],
  project: ['highlights', 'description'],
};

/** Is this target inside the rewritable scope at all? */
export function isRewritableField(target: ProposalTarget): boolean {
  const allowed = REWRITABLE[target.section];
  return Array.isArray(allowed) && allowed.includes(target.field);
}

// ============================================================================
// CLAIM PATTERNS
// ============================================================================

/**
 * Phrases that assert a management relationship or a team size. Introducing
 * one of these is a factual claim about the user's responsibilities, not a
 * stylistic improvement.
 */
const MANAGEMENT_CLAIM_PATTERNS: RegExp[] = [
  /\bteam of \d+/i,
  /\b\d+\s+(?:direct reports?|engineers?|developers?|designers?|analysts?|interns?|people)\b/i,
  /\b(?:managed|led|supervised|mentored|coached|ran)\s+(?:a|an|the)?\s*(?:team|group|squad|org|organisation|organization|department)\b/i,
  /\bdirect reports?\b/i,
  /\bhead of\b/i,
  /\bpeople manager\b/i,
  /\bhiring manager\b/i,
  /\bpromoted to\b/i,
];

/** Softer ownership verbs. Only flagged when the resume shows no leadership. */
const OWNERSHIP_VERBS = /\b(?:led|spearheaded|directed|headed|oversaw|championed)\b/i;

/** Any sign the resume already describes leadership of some kind. */
const LEADERSHIP_EVIDENCE =
  /\b(?:lead|leads|leading|led|manage|managed|managing|manager|supervis|mentor|owner|ownership|head of|director|principal|staff engineer)\b/i;

const CERTIFICATION_PATTERN =
  /\b(?:certified|certification|certificate|licence|license|licensed|accredited|chartered|pmp|cpa|cfa|csm|cissp|six sigma|scrum master)\b/i;

const QUALIFICATION_PATTERN =
  /\b(?:bachelor(?:'?s)?|master(?:'?s)?|mba|phd|ph\.d|doctorate|undergraduate degree|graduate degree)\b/i;

/** Seniority words whose appearance is a claim about title or level. */
const SENIORITY_WORDS = [
  'senior',
  'principal',
  'staff',
  'lead',
  'head',
  'director',
  'vp',
  'chief',
  'architect',
  'manager',
];

/** `at Acme` — an employer attribution. */
const EMPLOYER_ATTRIBUTION = /\bat\s+([A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*)?)/g;

// ============================================================================
// LENGTH
// ============================================================================

const MAX_BULLET_CHARS = 320;
const MAX_SUMMARY_CHARS = 1200;

function maxCharsFor(target: ProposalTarget): number {
  return target.field === 'summary' || target.field === 'description'
    ? MAX_SUMMARY_CHARS
    : MAX_BULLET_CHARS;
}

// ============================================================================
// CHECKS
// ============================================================================

export interface GuardOptions {
  /** The live resume. Every check compares against this, never against a copy. */
  resume: ResumeForRewrite;
  /** Built once per batch when checking several proposals. */
  evidence?: ResumeEvidence;
  /**
   * Job-description keywords known to be absent from this resume. Any of them
   * appearing in a rewrite is a skill claim the resume does not support.
   */
  unsupportedKeywords?: string[];
  /** The other proposals in the same batch, for duplicate and conflict checks. */
  siblings?: ProposalDraft[];
}

function issue(
  code: string,
  severity: ProposalIssue['severity'],
  detail: string,
  evidence?: string
): ProposalIssue {
  return evidence ? { code, severity, detail, evidence } : { code, severity, detail };
}

/** Phrases matching a pattern in `text` that do not match it in `baseline`. */
function introducedMatches(pattern: RegExp, text: string, baseline: string): string[] {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const global = new RegExp(pattern.source, flags);
  const found = stripHtml(text).match(global) ?? [];
  const existing = new Set((stripHtml(baseline).match(global) ?? []).map((m) => m.toLowerCase()));
  return [...new Set(found.filter((match) => !existing.has(match.toLowerCase())))];
}

/**
 * Run every deterministic check on one proposal.
 *
 * Order matters only in that a proposal whose target does not resolve is not
 * checked further: without the resume's own text there is nothing to compare
 * against, and a second complaint about a proposal that cannot be applied at
 * all is noise.
 */
export function checkProposal(draft: ProposalDraft, options: GuardOptions): ProposalIssue[] {
  const { resume, siblings = [], unsupportedKeywords = [] } = options;
  const evidence = options.evidence ?? buildResumeEvidence(resume);
  const issues: ProposalIssue[] = [];

  // ── 1. The target is in scope and exists ──────────────────────────────────

  if (!isRewritableField(draft.target)) {
    issues.push(
      issue(
        'protected-field',
        'blocking',
        `"${draft.target.section}.${draft.target.field}" is a factual identifier and cannot be ` +
          'rewritten in this phase. Employer names, titles, dates, education and certifications ' +
          'are left exactly as the user wrote them.'
      )
    );
    return issues;
  }

  const resolution = resolveTarget(resume, draft.target);
  if (!resolution.ok) {
    issues.push(
      issue('target-missing', 'blocking', resolution.error, formatTargetRef(draft.target))
    );
    return issues;
  }

  const liveText = resolution.view.text;

  // ── 2. The original text is really what is there ──────────────────────────

  if (canonicalizeForEquality(draft.originalText) !== canonicalizeForEquality(liveText)) {
    issues.push(
      issue(
        'original-text-mismatch',
        'blocking',
        'The original text in this proposal is not what the resume says at that location, so ' +
          'applying it would overwrite text nobody reviewed.',
        liveText.slice(0, 200)
      )
    );
    // Everything below compares against the original, so there is no sound
    // comparison left to make.
    return issues;
  }

  const proposed = stripHtml(draft.proposedText);
  const original = stripHtml(liveText);

  // ── 3. The proposal says something ────────────────────────────────────────

  if (!proposed) {
    issues.push(
      issue('empty-proposal', 'blocking', 'The proposed text is empty, so it removes content.')
    );
    return issues;
  }

  if (canonicalizeForEquality(proposed) === canonicalizeForEquality(original)) {
    issues.push(
      issue(
        'no-meaningful-change',
        'blocking',
        'The proposed text is the same as the original once case and punctuation are ignored.'
      )
    );
  }

  const limit = maxCharsFor(draft.target);
  if (proposed.length > limit) {
    issues.push(
      issue(
        'too-long',
        'revision',
        `The proposed text is ${proposed.length} characters, past the ${limit} this field ` +
          'should hold on a conventional resume.'
      )
    );
  }

  // ── 4. Numbers ────────────────────────────────────────────────────────────

  const originalNumbers = extractNumericClaims(original);
  const proposedNumbers = extractNumericClaims(proposed);

  for (const claim of proposedNumbers) {
    if (originalNumbers.has(claim)) continue;
    if (evidence.numbers.has(claim)) continue;
    issues.push(
      issue(
        'unsupported-number',
        'blocking',
        `The rewrite introduces the figure "${claim}", which does not appear anywhere on this ` +
          'resume. Ask the user for the number instead of supplying one.',
        claim
      )
    );
  }

  for (const claim of originalNumbers) {
    if (proposedNumbers.has(claim)) continue;
    issues.push(
      issue(
        'removed-metric',
        'revision',
        `The original stated "${claim}" and the rewrite drops it, losing a measurable result.`,
        claim
      )
    );
  }

  // ── 5. Names: employers, products, technologies ───────────────────────────

  const originalNames = extractProperNouns(original);
  const proposedNames = extractProperNouns(proposed);

  for (const name of proposedNames) {
    if (originalNames.has(name)) continue;
    if (evidence.names.has(name) || evidence.haystack.includes(name)) continue;
    issues.push(
      issue(
        'unsupported-proper-noun',
        'blocking',
        `The rewrite introduces "${name}", which this resume never mentions. It may be a real ` +
          'part of the user’s work, but it is not written here, so it cannot be added for them.',
        name
      )
    );
  }

  for (const name of originalNames) {
    if (proposedNames.has(name)) continue;
    if (normalizeText(proposed).includes(name)) continue;
    issues.push(
      issue(
        'removed-proper-noun',
        'revision',
        `The original named "${name}" and the rewrite drops it, losing specific detail.`,
        name
      )
    );
  }

  for (const match of introducedMatches(EMPLOYER_ATTRIBUTION, proposed, original)) {
    const employer = match.replace(/^at\s+/i, '').trim();
    if (evidenceMentions(evidence, employer)) continue;
    issues.push(
      issue(
        'unsupported-employer',
        'blocking',
        `The rewrite attributes this work to "${employer}", which is not an employer on this ` +
          'resume.',
        match
      )
    );
  }

  // ── 6. Titles and seniority ───────────────────────────────────────────────

  const proposedLower = normalizeText(proposed);
  const originalLower = normalizeText(original);
  for (const word of SENIORITY_WORDS) {
    const introduced =
      new RegExp(`\\b${word}\\b`).test(proposedLower) &&
      !new RegExp(`\\b${word}\\b`).test(originalLower);
    if (!introduced) continue;
    if (new RegExp(`\\b${word}\\b`).test(evidence.haystack)) continue;
    issues.push(
      issue(
        'unsupported-title',
        'blocking',
        `The rewrite introduces the seniority word "${word}", which this resume does not use.`,
        word
      )
    );
  }

  // ── 7. Qualifications and certifications ──────────────────────────────────

  for (const match of introducedMatches(CERTIFICATION_PATTERN, proposed, original)) {
    if (CERTIFICATION_PATTERN.test(evidence.haystack)) continue;
    issues.push(
      issue(
        'unsupported-certification',
        'blocking',
        `The rewrite introduces "${match}", a credential this resume does not list.`,
        match
      )
    );
  }

  for (const match of introducedMatches(QUALIFICATION_PATTERN, proposed, original)) {
    if (QUALIFICATION_PATTERN.test(evidence.haystack)) continue;
    issues.push(
      issue(
        'unsupported-qualification',
        'blocking',
        `The rewrite introduces "${match}", an academic qualification this resume does not list.`,
        match
      )
    );
  }

  // ── 8. Leadership and responsibility ──────────────────────────────────────

  for (const pattern of MANAGEMENT_CLAIM_PATTERNS) {
    for (const match of introducedMatches(pattern, proposed, original)) {
      if (pattern.test(evidence.haystack)) continue;
      issues.push(
        issue(
          'unsupported-leadership',
          'blocking',
          `The rewrite claims "${match}". Nothing on this resume describes managing people or a ` +
            'team, so that responsibility cannot be added.',
          match
        )
      );
    }
  }

  if (!LEADERSHIP_EVIDENCE.test(evidence.haystack)) {
    for (const match of introducedMatches(OWNERSHIP_VERBS, proposed, original)) {
      issues.push(
        issue(
          'overstated-leadership',
          'revision',
          `The rewrite opens with "${match}", which claims ownership the resume does not ` +
            'otherwise describe. Use a verb that matches what the original says was done.',
          match
        )
      );
    }
  }

  // ── 8b. Outcomes the resume does not establish ────────────────────────────
  //
  // The check that was missing when Phase 3A first ran for real. See
  // ./outcomes.ts: a benefit clause stapled onto a true sentence introduces no
  // name and no number, so every check above passes it, and it is still a
  // claim the user never made.
  //
  // Severity turns on whether the sentence survives deleting the clause. A
  // trailing ", enhancing data retrieval speed" can simply go, so the rewrite
  // is revisable. A benefit welded into the main clause cannot be struck
  // without rewriting around it, and whether it is true at all is something
  // only the user knows — so that one is routed to them.

  for (const finding of findUnsupportedOutcomeClaims({
    proposed,
    original,
    evidence,
  })) {
    const { claim, unsupportedTerms } = finding;
    const subject = claim.object ? `"${claim.trigger} ${claim.object}"` : `"${claim.trigger}"`;

    issues.push(
      issue(
        'unsupported-outcome',
        claim.removable ? 'revision' : 'clarify',
        `The rewrite adds an outcome the original does not claim: ${subject}. Nothing on this ` +
          `resume establishes it — ${unsupportedTerms.map((term) => `"${term}"`).join(', ')} ` +
          'appears nowhere in the user’s own text. An explanation of why the sentence is ' +
          'stronger is not evidence that the outcome happened. ' +
          (claim.removable
            ? 'Remove the clause, or ask the user whether the outcome is real and how they ' +
              'would describe it.'
            : 'The claim is part of the main clause, so it cannot simply be struck: ask the ' +
              'user whether it happened rather than asserting it for them.'),
        claim.phrase
      )
    );
  }

  // ── 9. Keywords ───────────────────────────────────────────────────────────

  for (const keyword of unsupportedKeywords) {
    const normalized = normalizeText(keyword);
    if (!normalized) continue;
    if (!proposedLower.includes(normalized)) continue;
    if (evidence.haystack.includes(normalized)) continue;
    issues.push(
      issue(
        'unsupported-skill',
        'blocking',
        `The rewrite works the job-description keyword "${keyword}" into the text, but nothing ` +
          'on this resume evidences it. A keyword can only be surfaced where the resume ' +
          'already supports it.',
        keyword
      )
    );
  }

  for (const keyword of draft.keywordsAddressed ?? []) {
    const normalized = normalizeText(keyword);
    if (!normalized) continue;
    if (!evidenceMentions(evidence, keyword)) {
      issues.push(
        issue(
          'unsupported-keyword',
          'blocking',
          `This proposal claims to address "${keyword}", which this resume never mentions.`,
          keyword
        )
      );
    } else if (!proposedLower.includes(normalized)) {
      issues.push(
        issue(
          'keyword-not-added',
          'info',
          `This proposal claims to address "${keyword}" but the proposed text does not contain it.`,
          keyword
        )
      );
    }
  }

  // ── 10. Cited evidence really exists ──────────────────────────────────────

  for (const quote of draft.sourceEvidence ?? []) {
    if (evidenceMentions(evidence, quote)) continue;
    issues.push(
      issue(
        'unsupported-evidence-citation',
        'revision',
        'This proposal cites resume text as its evidence that does not appear on the resume.',
        quote.slice(0, 160)
      )
    );
  }

  // ── 11. Duplicates and conflicts ──────────────────────────────────────────

  const others = siblings.filter((other) => other.proposalId !== draft.proposalId);

  if (others.some((other) => other.targetRef === draft.targetRef)) {
    issues.push(
      issue(
        'duplicate-target',
        'blocking',
        `More than one proposal rewrites "${draft.targetRef}". Only one rewrite per resume ` +
          'element can be applied, so neither can be trusted as the intended one.',
        draft.targetRef
      )
    );
  }

  const canonicalProposed = canonicalizeForEquality(proposed);
  if (others.some((other) => canonicalizeForEquality(other.proposedText) === canonicalProposed)) {
    issues.push(
      issue(
        'conflicting-proposal',
        'revision',
        'Another proposal in this batch proposes identical replacement text for a different ' +
          'resume element, which would duplicate the same line in two places.'
      )
    );
  }

  // ── 12. Things only the user can settle ───────────────────────────────────

  if ((draft.uncertainties ?? []).some((note) => String(note).trim())) {
    issues.push(
      issue(
        'author-flagged-uncertainty',
        'clarify',
        'The rewrite agent flagged something it could not settle from the resume alone, so this ' +
          'proposal needs the user before it can be applied.',
        (draft.uncertainties ?? []).filter(Boolean)[0]
      )
    );
  }

  if (originalNumbers.size === 0 && proposedNumbers.size === 0) {
    issues.push(
      issue(
        'metric-opportunity',
        'info',
        'Neither the original nor the rewrite states a measurable result. Asking the user for a ' +
          'figure would strengthen it; inventing one would not.'
      )
    );
  }

  return issues;
}

/** Run the checks across a whole batch, so duplicates and conflicts are seen. */
export function checkProposalBatch(
  drafts: ProposalDraft[],
  options: Omit<GuardOptions, 'siblings'>
): Map<string, ProposalIssue[]> {
  const evidence = options.evidence ?? buildResumeEvidence(options.resume);
  const results = new Map<string, ProposalIssue[]>();

  for (const draft of drafts) {
    results.set(draft.proposalId, checkProposal(draft, { ...options, evidence, siblings: drafts }));
  }

  return results;
}

// ============================================================================
// VERDICTS
// ============================================================================

/** Which verdict each severity forces. `info` forces nothing. */
const SEVERITY_FLOOR: Record<ProposalIssue['severity'], VerificationStatus | null> = {
  blocking: 'rejected',
  revision: 'revision_required',
  clarify: 'needs_user_input',
  info: null,
};

/**
 * The strictest verdict the deterministic checks require.
 *
 * `approved` here means only "nothing in code objected". It is not an
 * endorsement, which is why the Verification Agent still runs and why its
 * verdict can only make this stricter.
 */
export function verdictFloorFromIssues(issues: ProposalIssue[]): VerificationStatus {
  let floor: VerificationStatus = 'approved';
  for (const item of issues) {
    const required = SEVERITY_FLOOR[item.severity];
    if (required) floor = strictestVerdict(floor, required);
  }
  return floor;
}

/** Issues at or above `revision`, i.e. the ones a rewrite must address. */
export function blockingIssues(issues: ProposalIssue[]): ProposalIssue[] {
  return issues.filter((item) => item.severity === 'blocking' || item.severity === 'revision');
}
