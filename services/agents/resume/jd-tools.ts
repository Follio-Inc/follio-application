/**
 * Job-description and target-role tools for the Resume Agent.
 *
 * Read-only. Nothing in this module writes to the database, and nothing in it
 * calls an LLM: every number these tools return is computed by the existing
 * deterministic matchers in lib/jd-match and lib/role-profiles. The model's
 * job is to decide *which* of these to run and to explain what came back — not
 * to produce the scores itself.
 *
 * Three properties are enforced in code rather than in the prompt:
 *
 *   - The job description and target role are read from `AgentContext.meta`,
 *     set by `runResumeAgent` from trusted input. The model cannot supply, edit
 *     or re-type them, so it cannot score the resume against a JD the user
 *     never pasted, and an 80k-character JD never has to survive a round trip
 *     through the model.
 *   - Every tool here is resume-scoped and is wrapped with
 *     `pinnedToSelectedResume` by the agent, so it can only ever read the
 *     resume the caller selected.
 *   - A tool whose precondition is unmet returns `{ error }` rather than
 *     throwing. The runtime hands that back to the model, which can then adapt
 *     — that is the intended path when, say, the model tries JD scoring on a
 *     run that has no JD.
 */

import { z } from 'zod';

import { defineTool } from '@/lib/agents/define-tool';
import { buildResumeCorpus, type ProfileForMatch } from '@/lib/jd-match/build-resume-corpus';
import { inferJobTitleHint, scoreResumeAgainstJd } from '@/lib/jd-match/score';
import { extractKeywordCandidates, normalizeToken } from '@/lib/jd-match/tokenize';
import { evaluateRoleCoverage } from '@/lib/role-profiles/evaluate';
import { resolveRoleProfile } from '@/lib/role-profiles/profiles';

import { MEMORY_RESUME, type AgentResumeView } from './tools';

import type { ResumeCorpus } from '@/lib/jd-match/types';
import type { RoleCoverageResult } from '@/lib/role-profiles/types';
import type { AgentToolContext } from '@/types/agents';

// ============================================================================
// TRUSTED RUN INPUTS
// ============================================================================

/** Context key holding the job description the user pasted. Never model-set. */
export const JOB_DESCRIPTION_META_KEY = 'jobDescription';

/** Context key holding the resolved target-role id. Never model-set. */
export const TARGET_ROLE_META_KEY = 'targetRole';

/** Agent-memory keys for deterministic results the result tool reads back. */
export const MEMORY_JD_MATCH = 'jdMatch';
export const MEMORY_JD_KEYWORDS = 'jdKeywords';
export const MEMORY_ROLE_COVERAGE = 'roleCoverage';

function jobDescriptionFromContext(ctx: AgentToolContext): string {
  const value = ctx.meta?.[JOB_DESCRIPTION_META_KEY];
  return typeof value === 'string' ? value.trim() : '';
}

function targetRoleFromContext(ctx: AgentToolContext): string {
  const value = ctx.meta?.[TARGET_ROLE_META_KEY];
  return typeof value === 'string' ? value.trim() : '';
}

// ============================================================================
// RESUME → MATCH CORPUS
// ============================================================================

/**
 * Adapt the agent's resume view to the shape lib/jd-match expects.
 *
 * `toConnectorProfileView` has already dropped anything the user hid, so every
 * item reaching here is visible by construction and the `isVisible` flags are
 * set to true rather than re-derived.
 *
 * Known gap: the connector view carries no certifications, so certification
 * text is invisible to matching. `ProfileForMatch.certifications` is required,
 * hence the empty array. Widening the connector view is out of scope here and
 * is reported to the user as a limitation instead of being papered over.
 */
export function toProfileForMatch(resume: AgentResumeView): ProfileForMatch {
  return {
    id: resume.resumeId,
    handle: resume.handle,
    resumeTitle: resume.resumeTitle,
    headline: resume.headline,
    summary: resume.summary,
    skills: resume.skills.map((name) => ({ name, isVisible: true })),
    workExperiences: resume.experiences.map((item) => ({
      company: item.company,
      role: item.role,
      bullets: item.bullets,
      isVisible: true,
    })),
    projects: resume.projects.map((item) => ({
      title: item.title,
      description: item.description,
      techStack: item.techStack,
      highlights: item.highlights,
      isVisible: true,
      showOnResume: true,
    })),
    educations: resume.education.map((item) => ({
      institution: item.institution,
      degree: item.degree,
      fieldOfStudy: item.fieldOfStudy,
      isVisible: true,
    })),
    certifications: [],
  };
}

/** The resume a tool needs, or an error payload to hand back to the model. */
type ResumeLookup = { ok: true; resume: AgentResumeView } | { ok: false; error: string };

function resumeFromMemory(ctx: AgentToolContext): ResumeLookup {
  const resume = ctx.memory.get<AgentResumeView>(MEMORY_RESUME);
  if (!resume) {
    return {
      ok: false,
      error: 'No resume in memory. Call get_resume first, then call this tool again.',
    };
  }
  return { ok: true, resume };
}

const resumeScopedInput = z.object({
  resumeId: z
    .string()
    .min(1)
    .describe('The id of the resume the user selected, exactly as given in the task.'),
});

// ============================================================================
// score_against_jd
// ============================================================================

const JD_DISCLAIMER =
  'This score is lexical overlap between the resume text and the pasted job description. It is ' +
  'a tailoring aid, not an applicant-tracking-system result and not a hiring prediction.';

export const scoreAgainstJdTool = defineTool({
  name: 'score_against_jd',
  description:
    'Score the selected resume against the job description the user pasted for this run. ' +
    'Returns an overall score out of 100, a match band, the skills evidenced in the resume that ' +
    'the job description also asks for, and job-description keywords absent from the resume. ' +
    'Deterministic — the numbers come from Follio code, not from you. Only works when the user ' +
    'provided a job description.',
  inputSchema: resumeScopedInput,
  execute: async (_input, ctx) => {
    const jobDescription = jobDescriptionFromContext(ctx);
    if (!jobDescription) {
      return {
        error:
          'No job description was provided for this run, so it cannot be scored against one. ' +
          'Report what the resume contains instead, and do not invent a job description.',
      };
    }

    const lookup = resumeFromMemory(ctx);
    if (!lookup.ok) return { error: lookup.error };

    const corpus = buildResumeCorpus(toProfileForMatch(lookup.resume));
    const match = scoreResumeAgainstJd(corpus, jobDescription);

    const result = {
      score: match.score,
      band: match.band,
      label: match.label,
      summary: match.summary,
      jobTitleHint: inferJobTitleHint(jobDescription),
      matchedSkills: match.matchedSkills,
      missingKeywords: match.missingKeywords,
      basis: JD_DISCLAIMER,
    };

    // Stored so the result tool can report the computed figures rather than
    // whatever the model remembers of them.
    ctx.memory.set(MEMORY_JD_MATCH, result);

    return result;
  },
});

// ============================================================================
// find_missing_keywords
// ============================================================================

const KEYWORD_INTERPRETATION =
  'A keyword under "absentFromResume" is absent from the text of this resume. That is not ' +
  'evidence the user lacks the experience — it may simply be unwritten. Keywords under ' +
  '"presentButNotListedAsSkill" already appear somewhere in the resume body but not in the ' +
  'skills section, which is usually a wording fix rather than a gap.';

/**
 * Classify every job-description keyword candidate against the resume.
 *
 * `scoreResumeAgainstJd` already reports `missingKeywords`, but it collapses
 * "nowhere in the resume" and "written in a bullet but never listed as a
 * skill" into one bucket. Those call for different advice, so this re-derives
 * the classification against two haystacks: the skills list, and the whole
 * resume body.
 */
export function classifyKeywords(corpus: ResumeCorpus, jobDescription: string) {
  const candidates = extractKeywordCandidates(jobDescription, corpus.skills);

  const skillsHaystack = normalizeToken(corpus.skills.join(' \n '));
  const bodyHaystack = normalizeToken(
    [corpus.headline, corpus.summary, corpus.bodyText].filter(Boolean).join('\n')
  );

  const matchedInSkills: string[] = [];
  const presentButNotListedAsSkill: string[] = [];
  const absentFromResume: string[] = [];

  for (const candidate of candidates) {
    const norm = normalizeToken(candidate);
    if (!norm) continue;

    if (skillsHaystack.includes(norm)) {
      matchedInSkills.push(candidate);
    } else if (bodyHaystack.includes(norm)) {
      presentButNotListedAsSkill.push(candidate);
    } else {
      absentFromResume.push(candidate);
    }
  }

  return { matchedInSkills, presentButNotListedAsSkill, absentFromResume };
}

export const findMissingKeywordsTool = defineTool({
  name: 'find_missing_keywords',
  description:
    'Compare the job description against the selected resume and sort its keywords into three ' +
    'groups: already listed as a skill, present in the resume body but not listed as a skill, ' +
    'and absent from the resume entirely. Use this when the user wants to know what to add or ' +
    'reword. Deterministic. Only works when the user provided a job description.',
  inputSchema: resumeScopedInput,
  execute: async (_input, ctx) => {
    const jobDescription = jobDescriptionFromContext(ctx);
    if (!jobDescription) {
      return {
        error:
          'No job description was provided for this run, so there are no job-description ' +
          'keywords to compare against. Do not invent any.',
      };
    }

    const lookup = resumeFromMemory(ctx);
    if (!lookup.ok) return { error: lookup.error };

    const corpus = buildResumeCorpus(toProfileForMatch(lookup.resume));
    const groups = classifyKeywords(corpus, jobDescription);

    const result = {
      jobTitleHint: inferJobTitleHint(jobDescription),
      ...groups,
      interpretation: KEYWORD_INTERPRETATION,
    };

    ctx.memory.set(MEMORY_JD_KEYWORDS, result);

    return result;
  },
});

// ============================================================================
// evaluate_against_role
// ============================================================================

export const evaluateAgainstRoleTool = defineTool({
  name: 'evaluate_against_role',
  description:
    'Evaluate the selected resume against the general target role the user chose for this run ' +
    '(for example Technical Program Manager). Returns, for each competency in that role profile, ' +
    'whether the resume shows evidence for it and which phrases that verdict rests on. ' +
    'Deterministic. There is no job posting involved, so it reports competency coverage and ' +
    'never a percentage or ATS score. Only works when the user chose a target role.',
  inputSchema: resumeScopedInput,
  execute: async (_input, ctx) => {
    const targetRole = targetRoleFromContext(ctx);
    if (!targetRole) {
      return {
        error:
          'No target role was chosen for this run, so there is no role to evaluate against. ' +
          'Do not pick one yourself.',
      };
    }

    // Re-resolved rather than trusted: the API validated this id, and this is
    // the second check on the same value.
    const role = resolveRoleProfile(targetRole);
    if (!role) {
      return {
        error: `"${targetRole}" is not a supported target role, so it cannot be evaluated.`,
      };
    }

    const lookup = resumeFromMemory(ctx);
    if (!lookup.ok) return { error: lookup.error };

    const corpus = buildResumeCorpus(toProfileForMatch(lookup.resume));
    const result: RoleCoverageResult = evaluateRoleCoverage(corpus, role);

    ctx.memory.set(MEMORY_ROLE_COVERAGE, result);

    return result;
  },
});

/** Every evaluation tool, in the order they are registered on the agent. */
export const RESUME_EVALUATION_TOOLS = [
  scoreAgainstJdTool,
  findMissingKeywordsTool,
  evaluateAgainstRoleTool,
];
