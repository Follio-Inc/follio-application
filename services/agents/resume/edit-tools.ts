/**
 * Editing tools for the Resume Agent.
 *
 * Part 5A ships the read half only: `read_resume_lines`. It returns the refs
 * ("H", "S", "E1.2") that a later proposal must point at, read through the
 * same path the MCP connector uses, so a ref means the same line everywhere.
 *
 * Nothing here writes. No edit session is created, no resume field changes.
 */

import { z } from 'zod';

// Deep import: the `@/lib/agents` barrel re-exports runAgent -> persist-run -> lib/db.
import { defineTool } from '@/lib/agents/define-tool';
import {
  suggestionMessage,
  toAssistantSession,
  toResumeLinesView,
} from '@/lib/ai-connector/resume-edits';
import {
  requireOwnedResume,
  RESUME_ID_DESCRIPTION,
  ResumeRefSchema,
} from '@/lib/ai-connector/resume-target';
import { Errors } from '@/lib/errors';
import { hasPlaceholder, RESUME_EDIT_LIMITS } from '@/lib/resume-edit/types';
import {
  createAssistantResumeEditSession,
  getEditableResume,
} from '@/services/resume-edit-session.service';

import { MEMORY_JOB_DESCRIPTION, MEMORY_SCORED_RESUME_ID } from './jd-tools';

import type { AgentToolContext } from '@/types/agents';

/** Recorded on every session this agent proposes, so its sets stay identifiable. */
export const AGENT_VIA = 'Follio Resume Agent';

/** Agent-memory key: the line view of the resume most recently read. */
export const MEMORY_RESUME_LINES = 'resumeLines';
/** Agent-memory key: the resolved id those lines belong to. */
export const MEMORY_RESUME_LINES_ID = 'resumeLinesId';
/** Agent-memory key: the result of the proposal this run created. */
export const MEMORY_PROPOSAL = 'resumeProposal';
/**
 * Agent-memory key: set when a proposal attempt threw.
 *
 * The session row is written inside `createAssistantResumeEditSession`, so a
 * throw leaves us unable to tell whether a row exists. Recording it here stops
 * the run proposing again and makes the terminal result say so.
 */
export const MEMORY_PROPOSAL_ERROR = 'resumeProposalError';

/** What `read_resume_lines` returns, as the connector already shapes it. */
export type ResumeLinesView = ReturnType<typeof toResumeLinesView>;

/**
 * Both identifiers, rejected before any database access. They describe one
 * authenticated session and are set by the caller, never by the model.
 */
function requireIdentity(ctx: AgentToolContext): { userId: string; clerkId: string } {
  const userId = ctx.userId?.trim();
  if (!userId) {
    throw Errors.unauthorized('No authenticated user in agent context.');
  }
  const clerkId = ctx.clerkId?.trim();
  if (!clerkId) {
    throw Errors.unauthorized('No Clerk identity in agent context; cannot read a resume.');
  }
  return { userId, clerkId };
}

export const readResumeLinesInputSchema = z.object({
  resumeId: ResumeRefSchema.shape.resumeId.describe(RESUME_ID_DESCRIPTION),
});

export const readResumeLinesTool = defineTool({
  name: 'read_resume_lines',
  description:
    'Read the editable lines of one resume, each with a ref: "H" (headline), "S" (summary), ' +
    '"E1.2" (role 1, bullet 2). Also returns the writing checks and the lines that fail them, ' +
    'plus the playbooks Follio uses for each kind of edit. Read-only — it changes nothing. ' +
    'Call this before proposing any edit, so every ref you use is a real line.',
  inputSchema: readResumeLinesInputSchema,
  execute: async ({ resumeId }, ctx): Promise<ResumeLinesView> => {
    const { userId, clerkId } = requireIdentity(ctx);

    // Ownership twice over: requireOwnedResume resolves the reference only
    // among this user's resumes, and getEditableResume re-checks the resolved
    // id against the Clerk session's active user. Archived resumes are
    // excluded by both.
    const owned = await requireOwnedResume(userId, resumeId);
    const facts = await getEditableResume(clerkId, owned.resumeId);

    // Refs come from buildEditFacts via this view — never generated here.
    // Roles written as paragraphs or nested lists arrive marked read-only.
    const lines = toResumeLinesView(facts);

    ctx.memory.set(MEMORY_RESUME_LINES, lines);
    // Pinned to the resolved id so a later proposal cannot point refs read
    // from one resume at a different one.
    ctx.memory.set(MEMORY_RESUME_LINES_ID, owned.resumeId);

    return lines;
  },
});

// ============================================================================
// propose_resume_edits
// ============================================================================

/**
 * Narrower than the connector's `ref`: this first version rewrites the summary
 * and existing experience bullets only. No headline, no inserts ("E1.2+"), no
 * removals, and nothing that could add an employer, title, date or credential.
 */
const PROPOSABLE_REF = /^(S|E\d+\.[1-9]\d*)$/;

export const proposeResumeEditsInputSchema = z.object({
  resumeId: ResumeRefSchema.shape.resumeId.describe(RESUME_ID_DESCRIPTION),
  request: z
    .string()
    .trim()
    .min(1, 'Say what the user asked for.')
    .max(RESUME_EDIT_LIMITS.instructionsMaxChars)
    .describe('One line on what these rewrites are meant to improve.'),
  changes: z
    .array(
      z.object({
        ref: z
          .string()
          .trim()
          .regex(
            PROPOSABLE_REF,
            'Use "S" for the summary or "E1.2" for role 1, bullet 2, as read_resume_lines reported it.'
          )
          .describe('"S", or "E{role}.{bullet}". Only lines read_resume_lines listed as editable.'),
        text: z
          .string()
          .trim()
          .min(1)
          .max(RESUME_EDIT_LIMITS.summaryMaxChars)
          .describe(
            'The full rewritten line. Use only facts the resume already shows — never add a tool, ' +
              'employer, title, date, credential or number it does not state.'
          ),
        reason: z.string().trim().max(200).optional().describe('One short line on why.'),
      })
    )
    .min(1, 'Send at least one change.')
    .max(RESUME_EDIT_LIMITS.maxChanges)
    .describe('Rewrites of existing lines. Nothing is written to the resume.'),
});

export interface ProposeResumeEditsResult {
  /** Null when nothing survived grounding, so no session was saved. */
  sessionId: string | null;
  resumeId: string;
  /** Changes that survived grounding and are now pending the user's approval. */
  proposed: number;
  /** Removed for claiming something the resume does not show. */
  dropped: number;
  /** Unknown or read-only refs, duplicates, and rewrites identical to the original. */
  ignored: number;
  /** Rewrites holding a [__] the user must fill before they can be applied. */
  needsInput: number;
  changes: Array<Record<string, unknown>>;
  message: string;
}

export const proposeResumeEditsTool = defineTool({
  name: 'propose_resume_edits',
  description:
    'Propose rewrites of the summary and existing experience bullets for the user to review. ' +
    'Saves them as a pending edit session — the resume is NOT changed, and you cannot apply them. ' +
    'Follio drops any rewrite that adds a tool, name, title or number the resume does not show. ' +
    'Call read_resume_lines and analyze_job_description first.',
  inputSchema: proposeResumeEditsInputSchema,
  execute: async ({ resumeId, request, changes }, ctx): Promise<ProposeResumeEditsResult> => {
    const { userId, clerkId } = requireIdentity(ctx);

    // One saved proposal per run. The state is the tool's own stored result,
    // which only this tool writes, so a model that forgets it already proposed
    // cannot create a second review set the user has to untangle. A run that
    // saved nothing (everything dropped) may try again: no row exists yet.
    const prior = ctx.memory.get<ProposeResumeEditsResult>(MEMORY_PROPOSAL);
    if (prior?.sessionId) {
      throw Errors.badRequest(
        `This run already saved proposal ${prior.sessionId} with ${prior.proposed} change(s) ` +
          'for the user to review. Only one proposal per run — call submit_resume_result now.'
      );
    }

    // A previous attempt threw somewhere inside the saving service. Whether a
    // row was written is unknowable from here, so proposing again could leave
    // the user two sets. Stop and let the result report it.
    const failedBefore = ctx.memory.get<string>(MEMORY_PROPOSAL_ERROR);
    if (failedBefore) {
      throw Errors.badRequest(
        'A proposal attempt in this run already failed while saving, and may have left a ' +
          'pending set. Do not propose again in this run — call submit_resume_result and say so.'
      );
    }

    // The posting is the one already analyzed in this run. The model cannot
    // swap in another after the fact, because it never supplies it here.
    const jobDescription = ctx.memory.get<string>(MEMORY_JOB_DESCRIPTION);
    if (!jobDescription) {
      throw Errors.badRequest(
        'No job posting has been analyzed in this run. Call analyze_job_description first.'
      );
    }

    const owned = await requireOwnedResume(userId, resumeId);

    // Refs only mean something against the lines they were read from.
    const linesFor = ctx.memory.get<string>(MEMORY_RESUME_LINES_ID);
    if (!linesFor) {
      throw Errors.badRequest(
        'Call read_resume_lines for this resume first, so every ref points at a real line.'
      );
    }
    if (linesFor !== owned.resumeId) {
      throw Errors.badRequest(
        'The lines in memory belong to a different resume. Call read_resume_lines for this one first.'
      );
    }

    // Propose only against a resume that has actually been scored against this
    // posting, so a rewrite is answering measured gaps rather than a guess.
    const scoredFor = ctx.memory.get<string>(MEMORY_SCORED_RESUME_ID);
    if (!scoredFor) {
      throw Errors.badRequest(
        'This resume has not been scored against the posting yet. Call score_resume_against_jd first.'
      );
    }
    if (scoredFor !== owned.resumeId) {
      throw Errors.badRequest(
        'The scoring in memory belongs to a different resume. Call score_resume_against_jd for this one first.'
      );
    }

    // Grounding, the session row and the rate limit all stay in the existing
    // service. `userFacts` is deliberately not passed: it is treated as truth
    // by grounding, and the agent has no user-stated facts to put there.
    let result: Awaited<ReturnType<typeof createAssistantResumeEditSession>>;
    try {
      result = await createAssistantResumeEditSession(
        clerkId,
        { request, jobDescription, changes },
        AGENT_VIA,
        owned.resumeId
      );
    } catch (error) {
      // The row is created inside that call and the id never reaches us, so a
      // throw here is the one case where a pending set can exist unreported.
      // Mark the run so no second attempt compounds it and the result says so.
      ctx.memory.set(MEMORY_PROPOSAL_ERROR, error instanceof Error ? error.message : String(error));
      throw error;
    }

    const session = result.session;
    const saved = session?.changes.length ?? 0;
    const needsInput =
      session?.changes.filter((change) => hasPlaceholder(change.after)).length ?? 0;

    const outcome: ProposeResumeEditsResult = {
      sessionId: session?.id ?? null,
      resumeId: owned.resumeId,
      proposed: saved,
      dropped: result.dropped,
      ignored: result.ignored,
      needsInput,
      changes: session ? toAssistantSession(session).changes : [],
      message: suggestionMessage({
        saved,
        needsInput,
        dropped: result.dropped,
        ignored: result.ignored,
      }),
    };

    // The terminal tool reports the proposal from here, so the session id and
    // the changes it names are the ones grounding actually produced.
    ctx.memory.set(MEMORY_PROPOSAL, outcome);

    return outcome;
  },
});

export const RESUME_EDIT_AGENT_TOOLS = [readResumeLinesTool, proposeResumeEditsTool];
