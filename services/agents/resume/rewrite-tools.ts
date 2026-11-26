/**
 * Tools for the Resume Rewrite Agent.
 *
 * Read-only with respect to persistent resume data. Nothing in this module
 * writes to the database; the only state these tools create lives in the
 * run's private memory and dies with the run.
 *
 * The Phase 1 and Phase 2 guards are reused unchanged, so the same three
 * properties hold here:
 *
 *   - the authenticated user comes from `AgentContext`, never from a tool
 *     argument the model wrote;
 *   - every tool is wrapped with `pinnedToSelectedResume` by the agent, so a
 *     model that names a different resume is refused rather than served;
 *   - a tool whose precondition is unmet returns `{ error }` so the model can
 *     adapt, instead of throwing and burning the run.
 *
 * What is new here is `propose_rewrite`, which is the only way a proposal can
 * come into existence. It runs the deterministic guards (lib/resume-rewrite)
 * before it stores anything and **refuses** a proposal carrying a blocking
 * issue — an invented figure, an employer the resume never names, a claim of
 * managing a team. The model does not get to argue with that: the proposal
 * simply does not exist, so there is nothing for a later agent to approve.
 */

import { z } from 'zod';

import { defineTool } from '@/lib/agents/define-tool';
import { buildResumeCorpus } from '@/lib/jd-match/build-resume-corpus';
import { analyzeResumeQuality } from '@/lib/resume-quality/analyze';
import {
  buildResumeEvidence,
  checkProposal,
  formatTargetRef,
  listRewriteTargets,
  parseTargetRef,
  proposalIdForTarget,
  resolveTarget,
  verdictFloorFromIssues,
  type EditProposal,
  type ProposalDraft,
  type ProposalIssue,
  type ResumeForRewrite,
} from '@/lib/resume-rewrite';

import { classifyKeywords, JOB_DESCRIPTION_META_KEY, toProfileForMatch } from './jd-tools';
import { SHARED_EVALUATION_KEY, SHARED_MATCHING_KEY } from './shared-keys';
import { MEMORY_RESUME, type AgentResumeView } from './tools';

import type { AgentToolContext } from '@/types/agents';

// ============================================================================
// MEMORY
// ============================================================================

/** Proposals accepted so far in this run. The result tool reads these back. */
export const MEMORY_PROPOSALS = 'rewriteProposals';

/** The rewritable elements, as last listed. */
export const MEMORY_REWRITE_TARGETS = 'rewriteTargets';

/** JD keywords this resume does not evidence. Computed, cached per run. */
export const MEMORY_UNSUPPORTED_KEYWORDS = 'unsupportedKeywords';

/** How many targets one listing returns. A long resume should not flood context. */
const MAX_TARGETS_RETURNED = 60;

/** How many proposals one rewrite round may produce. */
export const MAX_PROPOSALS_PER_ROUND = 12;

// ============================================================================
// SHARED HELPERS
// ============================================================================

const resumeScopedInput = z.object({
  resumeId: z
    .string()
    .min(1)
    .describe('The id of the resume the user selected, exactly as given in the task.'),
});

type ResumeLookup = { ok: true; resume: AgentResumeView } | { ok: false; error: string };

export function resumeFromMemory(ctx: AgentToolContext): ResumeLookup {
  const resume = ctx.memory.get<AgentResumeView>(MEMORY_RESUME);
  if (!resume) {
    return {
      ok: false,
      error: 'No resume in memory. Call get_resume first, then call this tool again.',
    };
  }
  return { ok: true, resume };
}

/**
 * Job-description keywords this resume does not evidence anywhere.
 *
 * Computed from the pasted job description in trusted context, never from
 * anything the model wrote, and cached in run memory because the computation
 * is identical on every call. Empty when the run has no job description — in
 * which case the keyword guard simply has nothing to check, which is reported
 * as a limitation rather than treated as a pass.
 */
export function unsupportedKeywordsFor(ctx: AgentToolContext, resume: AgentResumeView): string[] {
  const cached = ctx.memory.get<string[]>(MEMORY_UNSUPPORTED_KEYWORDS);
  if (cached) return cached;

  const jd = ctx.meta?.[JOB_DESCRIPTION_META_KEY];
  if (typeof jd !== 'string' || !jd.trim()) {
    ctx.memory.set(MEMORY_UNSUPPORTED_KEYWORDS, []);
    return [];
  }

  const corpus = buildResumeCorpus(toProfileForMatch(resume));
  const { absentFromResume } = classifyKeywords(corpus, jd);
  ctx.memory.set(MEMORY_UNSUPPORTED_KEYWORDS, absentFromResume);
  return absentFromResume;
}

/** The accepted proposals for this run, in the order they were accepted. */
export function proposalsFromMemory(ctx: AgentToolContext): EditProposal[] {
  return ctx.memory.get<EditProposal[]>(MEMORY_PROPOSALS) ?? [];
}

/** `AgentResumeView` is structurally assignable to what the guards need. */
function asRewriteResume(resume: AgentResumeView): ResumeForRewrite {
  return resume;
}

// ============================================================================
// list_rewrite_targets
// ============================================================================

export const listRewriteTargetsTool = defineTool({
  name: 'list_rewrite_targets',
  description:
    'List every piece of resume text that may be rewritten — the professional summary, each ' +
    'work-experience bullet, and each project description or highlight — with the stable ' +
    'targetRef that addresses it and the text as it stands today. Employer names, job titles, ' +
    'dates, education and certifications are deliberately absent: they cannot be rewritten. ' +
    'Use a targetRef from this list verbatim; never construct one.',
  inputSchema: resumeScopedInput,
  execute: async (_input, ctx) => {
    const lookup = resumeFromMemory(ctx);
    if (!lookup.ok) return { error: lookup.error };

    const resume = lookup.resume;
    const targets = listRewriteTargets(asRewriteResume(resume));
    ctx.memory.set(MEMORY_REWRITE_TARGETS, targets);

    // The deterministic analyser already knows which bullets are thin, carry
    // no number, or open with filler. Attaching that here means the model
    // picks targets from computed signals rather than from its impression of
    // the prose.
    const quality = analyzeResumeQuality(resume);
    const weakness = new Map<string, string[]>();
    for (const experience of quality.experiences) {
      experience.bullets.forEach((bullet, index) => {
        const notes: string[] = [];
        if (!bullet.hasMetric) notes.push('no measurable result stated');
        if (!bullet.startsWithActionVerb) notes.push('does not open with an action verb');
        if (bullet.weakPhrases.length > 0) notes.push(`filler: ${bullet.weakPhrases.join(', ')}`);
        if (bullet.length > 0 && bullet.length < 40) notes.push('very short');
        if (notes.length > 0) {
          weakness.set(`experience:${experience.id}:bullets:${index}`, notes);
        }
      });
    }

    return {
      targets: targets.slice(0, MAX_TARGETS_RETURNED).map((target) => ({
        targetRef: target.targetRef,
        section: target.target.section,
        label: target.label,
        text: target.text,
        signals: weakness.get(target.targetRef) ?? [],
      })),
      targetsTotal: targets.length,
      protectedFields:
        'Employer names, job titles, employment dates, education and certifications are not ' +
        'rewritable in this phase and are not listed.',
    };
  },
});

// ============================================================================
// get_rewrite_target
// ============================================================================

export const getRewriteTargetTool = defineTool({
  name: 'get_rewrite_target',
  description:
    'Read one rewritable element exactly as the resume stores it, by its targetRef. Returns the ' +
    'verbatim original text you must quote back when proposing a rewrite, plus what the ' +
    'deterministic analyser observed about it.',
  inputSchema: resumeScopedInput.extend({
    targetRef: z.string().min(1).describe('A targetRef copied verbatim from list_rewrite_targets.'),
  }),
  execute: async ({ targetRef }, ctx) => {
    const lookup = resumeFromMemory(ctx);
    if (!lookup.ok) return { error: lookup.error };

    const target = parseTargetRef(targetRef);
    if (!target) {
      return {
        error:
          `"${targetRef}" is not a valid targetRef. Call list_rewrite_targets and copy one ` +
          'exactly, including every colon.',
      };
    }

    const resolution = resolveTarget(asRewriteResume(lookup.resume), target);
    if (!resolution.ok) return { error: resolution.error };

    const evidence = buildResumeEvidence(asRewriteResume(lookup.resume));

    return {
      targetRef: resolution.view.targetRef,
      section: target.section,
      field: target.field,
      label: resolution.view.label,
      originalText: resolution.view.text,
      statesAFigure: [...evidence.numbers].some((figure) => resolution.view.text.includes(figure)),
      note:
        'Quote originalText back verbatim in propose_rewrite. A proposal whose original text ' +
        'does not match the resume is refused.',
    };
  },
});

// ============================================================================
// get_analysis_findings
// ============================================================================

export const getAnalysisFindingsTool = defineTool({
  name: 'get_analysis_findings',
  description:
    'Read the findings the analysis specialists produced for this resume: the writing-quality ' +
    'evaluation, and the job-description or target-role match when one ran. Use these to decide ' +
    'what is worth rewriting. If no specialist ran, this falls back to computing the ' +
    'deterministic quality report directly, and says so.',
  inputSchema: resumeScopedInput,
  execute: async (_input, ctx) => {
    const lookup = resumeFromMemory(ctx);
    if (!lookup.ok) return { error: lookup.error };

    // Filed under the agent that produced it, so this cannot pick up a
    // finding some other agent planted under the same key.
    const evaluation = ctx.shared?.getFrom<Record<string, unknown>>(
      'resume-evaluation',
      SHARED_EVALUATION_KEY
    );
    const matching = ctx.shared?.getFrom<Record<string, unknown>>(
      'resume-jd-match',
      SHARED_MATCHING_KEY
    );

    const unsupportedKeywords = unsupportedKeywordsFor(ctx, lookup.resume);

    if (evaluation || matching) {
      return {
        source: 'specialist-agents',
        ...(evaluation ? { evaluation } : {}),
        ...(matching ? { matching } : {}),
        keywordsTheResumeDoesNotEvidence: unsupportedKeywords,
        interpretation:
          'A keyword listed here is absent from the text of this resume. It is not evidence the ' +
          'user lacks the experience, and it must not be written into a rewrite.',
      };
    }

    const report = analyzeResumeQuality(lookup.resume);
    return {
      source: 'computed-locally',
      note: 'No specialist findings were published for this run, so this is the deterministic quality report.',
      missingSections: report.missingSections,
      counts: report.counts,
      metricCoveragePercent: report.metricCoveragePercent,
      findings: report.findings.slice(0, 25),
      keywordsTheResumeDoesNotEvidence: unsupportedKeywords,
      basis: report.basis,
    };
  },
});

// ============================================================================
// get_verification_feedback
// ============================================================================

/** What a previous verification round said, as handed to a revision run. */
export interface PriorVerdictSummary {
  proposalId: string;
  targetRef: string;
  status: string;
  reason: string;
  questionableClaims: string[];
  requiredRevisions: string[];
}

export const getVerificationFeedbackTool = defineTool({
  name: 'get_verification_feedback',
  description:
    'Read the Verification Agent’s verdicts on your previous proposals, when this run is a ' +
    'revision. Returns, per proposal, what was rejected or questioned and exactly what a ' +
    'revision has to change. Empty on a first attempt.',
  inputSchema: z.object({}),
  execute: async (_input, ctx) => {
    const input = ctx.memory.get<{ priorVerdicts?: PriorVerdictSummary[]; revisionRound?: number }>(
      '__input'
    );
    const verdicts = input?.priorVerdicts ?? [];

    if (verdicts.length === 0) {
      return {
        revisionRound: input?.revisionRound ?? 0,
        verdicts: [],
        note: 'This is a first attempt — there is no verification feedback yet.',
      };
    }

    return {
      revisionRound: input?.revisionRound ?? 0,
      verdicts,
      note:
        'Address every requiredRevision. A claim listed under questionableClaims is not ' +
        'written on this resume: remove it or ask the user for it. Do not restate it differently.',
    };
  },
});

// ============================================================================
// validate_rewrite_proposal
// ============================================================================

/** The shape of a proposal, shared by the validate and propose tools. */
const proposalInput = resumeScopedInput.extend({
  targetRef: z.string().min(1).describe('A targetRef copied verbatim from list_rewrite_targets.'),
  originalText: z
    .string()
    .min(1)
    .describe('The resume’s current text at that target, quoted verbatim.'),
  proposedText: z.string().min(1).describe('The replacement text.'),
  explanation: z
    .string()
    .min(1)
    .describe('Why the replacement is better, in one or two sentences.'),
  keywordsAddressed: z
    .array(z.string())
    .optional()
    .describe(
      'Job-description keywords or role competencies this rewrite surfaces. Only list ones the ' +
        'resume already evidences.'
    ),
  sourceEvidence: z
    .array(z.string())
    .optional()
    .describe('Quotes from this resume that support every factual claim in the replacement.'),
  uncertainties: z
    .array(z.string())
    .optional()
    .describe(
      'Anything you could not settle from the resume — for example a figure worth adding that ' +
        'the resume does not state. Listing one sends the proposal to the user for input ' +
        'rather than rejecting it.'
    ),
});

/** Build the draft a guard run operates on. Ids are derived, never supplied. */
function draftFrom(
  input: z.infer<typeof proposalInput>,
  target: ReturnType<typeof parseTargetRef>
): ProposalDraft {
  const resolved = target!;
  return {
    proposalId: proposalIdForTarget(resolved),
    target: resolved,
    targetRef: formatTargetRef(resolved),
    originalText: input.originalText,
    proposedText: input.proposedText,
    explanation: input.explanation,
    keywordsAddressed: input.keywordsAddressed ?? [],
    sourceEvidence: input.sourceEvidence ?? [],
    uncertainties: input.uncertainties ?? [],
  };
}

/**
 * Issues that stop a proposal being stored at all.
 *
 * Severity alone is not the rule. `blocking` means the proposal asserts
 * something the resume does not contain, so it must never exist. To that is
 * added `unsupported-outcome`, which is only `revision`/`clarify` severity
 * because a verifier *could* send it back — but the Rewrite Agent should
 * never emit one in the first place, and refusing it here means the agent
 * fixes its own sentence rather than spending a verification round on it.
 *
 * `author-flagged-uncertainty` is deliberately NOT in this set: a proposal
 * that says "I would need a figure from you here" is the designed escape
 * hatch, and refusing it would push the agent back towards guessing.
 */
function refusedAtProposalTime(issues: ProposalIssue[]): ProposalIssue[] {
  return issues.filter(
    (item) => item.severity === 'blocking' || item.code === 'unsupported-outcome'
  );
}

function summarizeIssues(issues: ProposalIssue[]) {
  return issues.map((item) => ({
    code: item.code,
    severity: item.severity,
    detail: item.detail,
    ...(item.evidence ? { evidence: item.evidence } : {}),
  }));
}

export const validateRewriteProposalTool = defineTool({
  name: 'validate_rewrite_proposal',
  description:
    'Check a draft rewrite against the resume without proposing it: does the target exist, does ' +
    'the original text match, and does the replacement introduce any figure, name, credential, ' +
    'responsibility or claimed outcome the resume does not support. Use this when you are ' +
    'unsure, especially before adding any clause about what a piece of work achieved. It ' +
    'stores nothing.',
  inputSchema: proposalInput,
  execute: async (input, ctx) => {
    const lookup = resumeFromMemory(ctx);
    if (!lookup.ok) return { error: lookup.error };

    const target = parseTargetRef(input.targetRef);
    if (!target) {
      return { error: `"${input.targetRef}" is not a valid targetRef.`, wouldBeAccepted: false };
    }

    const resume = asRewriteResume(lookup.resume);
    const draft = draftFrom(input, target);
    const issues = checkProposal(draft, {
      resume,
      unsupportedKeywords: unsupportedKeywordsFor(ctx, lookup.resume),
      siblings: proposalsFromMemory(ctx),
    });

    const refused = refusedAtProposalTime(issues);

    return {
      targetRef: draft.targetRef,
      wouldBeAccepted: refused.length === 0,
      issues: summarizeIssues(issues),
      verdictFloor: verdictFloorFromIssues(issues),
    };
  },
});

// ============================================================================
// propose_rewrite
// ============================================================================

export const proposeRewriteTool = defineTool({
  name: 'propose_rewrite',
  description:
    'Propose one reviewable edit to one resume element. The deterministic guards run first: a ' +
    'proposal that invents a figure, a company, a technology, a credential, a management ' +
    'responsibility, or an outcome the resume does not establish is refused and not stored. ' +
    'Call this once per element you want to improve.',
  inputSchema: proposalInput,
  execute: async (input, ctx) => {
    const lookup = resumeFromMemory(ctx);
    if (!lookup.ok) return { error: lookup.error };

    const existing = proposalsFromMemory(ctx);
    if (existing.length >= MAX_PROPOSALS_PER_ROUND) {
      return {
        accepted: false,
        error:
          `This round already holds ${existing.length} proposals, which is the limit. Submit ` +
          'what you have rather than proposing more.',
      };
    }

    const target = parseTargetRef(input.targetRef);
    if (!target) {
      return {
        accepted: false,
        error:
          `"${input.targetRef}" is not a valid targetRef. Call list_rewrite_targets and copy ` +
          'one exactly.',
      };
    }

    const resume = asRewriteResume(lookup.resume);
    const resolution = resolveTarget(resume, target);
    if (!resolution.ok) return { accepted: false, error: resolution.error };

    const draft = draftFrom(input, target);
    const issues = checkProposal(draft, {
      resume,
      unsupportedKeywords: unsupportedKeywordsFor(ctx, lookup.resume),
      siblings: existing,
    });

    const refused = refusedAtProposalTime(issues);
    if (refused.length > 0) {
      // Refused, not stored. There is deliberately no way to override this
      // from the model side: the proposal never exists, so nothing downstream
      // can approve it.
      const outcome = refused.find((item) => item.code === 'unsupported-outcome');
      return {
        accepted: false,
        targetRef: draft.targetRef,
        issues: summarizeIssues(issues),
        guidance: outcome
          ? 'This rewrite was not stored. It claims an outcome the resume does not establish. ' +
            'Propose the sentence again without the benefit clause — a bullet that says clearly ' +
            'what was built is stronger than one that says it helped in a way nobody measured. ' +
            'If the outcome is probably real, put the question to the user under uncertainties ' +
            'instead of asserting it.'
          : 'This rewrite was not stored. Remove whatever the resume does not support, or list ' +
            'it under uncertainties so the user can supply it, and propose again.',
      };
    }

    const inputMeta = ctx.memory.get<{ revisionRound?: number }>('__input');

    const proposal: EditProposal = {
      ...draft,
      // The resume's own string, so a later application writes exactly what
      // was reviewed rather than the model's transcription of it.
      originalText: resolution.view.text,
      label: resolution.view.label,
      section: target.section,
      revisionRound: inputMeta?.revisionRound ?? 0,
      deterministicIssues: issues,
    };

    ctx.memory.set(MEMORY_PROPOSALS, [...existing, proposal]);

    return {
      accepted: true,
      proposalId: proposal.proposalId,
      targetRef: proposal.targetRef,
      label: proposal.label,
      issues: summarizeIssues(issues),
      proposalsSoFar: existing.length + 1,
      note:
        'Stored for verification. A separate Verification Agent will check it independently; ' +
        'acceptance here is not approval.',
    };
  },
});

// ============================================================================
// REGISTRY
// ============================================================================

/** Resume-scoped tools, in the order the agent registers them. */
export const REWRITE_RESUME_SCOPED_TOOLS = [
  listRewriteTargetsTool,
  getRewriteTargetTool,
  getAnalysisFindingsTool,
  validateRewriteProposalTool,
  proposeRewriteTool,
];
