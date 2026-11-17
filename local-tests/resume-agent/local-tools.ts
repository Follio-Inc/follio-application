/**
 * Test-only data adapters for the Resume Agent.
 *
 * Production's four resume-reading/writing tools go through Prisma. These four
 * read `sample-resume.json` instead. Everything *inside* them — the scoring,
 * the line view, the grounding, the memory keys, the input schemas, the
 * prerequisite guards — is the production code path, imported and called
 * directly.
 *
 * What is genuinely test-only, and nothing else:
 *   - where the resume bytes come from (a file, not a database row)
 *   - ownership (there is one fixture resume, so there is nothing to own)
 *   - the edit session is held in memory instead of being written to Postgres
 *
 * Nothing here is imported by the app.
 */

import { defineTool } from '@/lib/agents/define-tool';
import { toConnectorProfileView } from '@/lib/ai-connector/profile-view';
import {
  BLANKS_NEED_THE_USER,
  REVIEW_IN_FOLLIO,
  suggestionMessage,
  toAssistantSession,
  toResumeLinesView,
} from '@/lib/ai-connector/resume-edits';
import { Errors } from '@/lib/errors';
import { hasPlaceholder, type ResumeEditBrief } from '@/lib/resume-edit/types';
import { evaluateResume } from '@/services/ai/evaluate';
import { groundAssistantEdits } from '@/services/ai/resume-edit/assistant';
import { buildEditFacts, type EditSourceProfile } from '@/services/ai/resume-edit/facts';
import { getResumeInputSchema } from '@/services/agents/resume/tools';
import {
  MEMORY_EVALUATION,
  MEMORY_JOB_DESCRIPTION,
  MEMORY_JOB_REQUIREMENTS,
  MEMORY_SCORED_RESUME_ID,
  scoreResumeAgainstJdInputSchema,
} from '@/services/agents/resume/jd-tools';
import {
  AGENT_VIA,
  MEMORY_PROPOSAL,
  MEMORY_PROPOSAL_ERROR,
  MEMORY_RESUME_LINES,
  MEMORY_RESUME_LINES_ID,
  proposeResumeEditsInputSchema,
  readResumeLinesInputSchema,
  type ProposeResumeEditsResult,
} from '@/services/agents/resume/edit-tools';

import type { AgentTool } from '@/types/agents';
import type { JobRequirement } from '@/services/ai/job-requirements/types';

export const LOCAL_RESUME_ID = 'local-fixture-resume';

/** The in-memory stand-in for a saved ResumeEditSession row. */
export interface LocalEditSession {
  id: string;
  profileId: string;
  brief: ResumeEditBrief;
  changes: ReturnType<typeof groundAssistantEdits>['changes'];
  droppedCount: number;
  failedSections: string[];
  createdAt: string;
}

export interface LocalStore {
  profile: EditSourceProfile;
  /** Sessions a propose run "saved". Never written anywhere. */
  sessions: LocalEditSession[];
}

/**
 * Fill the fields `toConnectorProfileView` expects but the fixture omits.
 * Shape only — no values are invented beyond visibility defaults.
 */
function asConnectorProfile(profile: EditSourceProfile) {
  return {
    handle: 'local-fixture',
    resumeTitle: 'Local fixture resume',
    firstName: 'Local',
    middleName: null,
    lastName: 'Fixture',
    headline: profile.headline,
    summary: profile.summary,
    location: null,
    contactInfo: null,
    workExperiences: profile.workExperiences.map((item) => ({
      id: item.id,
      company: item.company,
      role: item.role,
      location: null,
      startDate: item.startDate ? new Date(item.startDate) : new Date(0),
      endDate: item.endDate ? new Date(item.endDate) : null,
      isCurrent: item.isCurrent,
      bullets: item.bullets,
      isVisible: item.isVisible,
    })),
    educations: profile.educations.map((item, index) => ({
      id: `edu-${index + 1}`,
      institution: item.institution,
      degree: item.degree,
      fieldOfStudy: item.fieldOfStudy,
      startDate: null,
      endDate: null,
      isCurrent: false,
      isVisible: true,
    })),
    skills: profile.skills.map((item, index) => ({
      id: `skill-${index + 1}`,
      name: item.name,
      isVisible: true,
    })),
    skillGroups: [],
    projects: profile.projects.map((item, index) => ({
      id: `project-${index + 1}`,
      title: item.title,
      description: item.description,
      url: null,
      techStack: item.techStack,
      highlights: [],
      isVisible: true,
    })),
  };
}

/**
 * The four tools whose production versions need Prisma, rebuilt over a local
 * file. Input schemas and memory keys are the production ones, so the model
 * sees exactly the same tool contract and `submit_resume_result` reads exactly
 * the same memory.
 */
export function localResumeTools(store: LocalStore): AgentTool[] {
  const facts = () => buildEditFacts(store.profile);

  const getResume = defineTool({
    name: 'get_resume',
    description:
      'Read one of the user’s resumes in full: headline, summary, experience, education, ' +
      'skills and projects. Read-only.',
    inputSchema: getResumeInputSchema,
    execute: async () => ({
      resumeId: LOCAL_RESUME_ID,
      title: 'Local fixture resume',
      isActive: true,
      ...toConnectorProfileView(asConnectorProfile(store.profile)),
    }),
  });

  const scoreResume = defineTool({
    name: 'score_resume_against_jd',
    description:
      "Score one of the user's resumes against the analyzed posting: writing checks, keyword " +
      'coverage, and every requirement marked exact, implied, related or missing with the ' +
      'evidence behind it. Scored by code, not by a model. Requires analyze_job_description ' +
      'first. Read-only — it never changes the resume.',
    inputSchema: scoreResumeAgainstJdInputSchema,
    execute: async ({ resumeId }, ctx) => {
      // Same prerequisite the production tool enforces.
      const analyzedJd = ctx.memory.get<string>(MEMORY_JOB_DESCRIPTION);
      const requirements = ctx.memory.get<JobRequirement[]>(MEMORY_JOB_REQUIREMENTS);
      if (!analyzedJd || !requirements) {
        throw Errors.badRequest(
          'No job posting has been analyzed in this run. Call analyze_job_description first.'
        );
      }

      // Production scorer, production memory keys.
      const evaluation = evaluateResume(facts(), analyzedJd, requirements);
      ctx.memory.set(MEMORY_EVALUATION, evaluation);
      ctx.memory.set(MEMORY_SCORED_RESUME_ID, resumeId);
      return evaluation;
    },
  });

  const readLines = defineTool({
    name: 'read_resume_lines',
    description:
      'Read the editable lines of one resume, each with a ref: "H" (headline), "S" (summary), ' +
      '"E1.2" (role 1, bullet 2). Read-only — it changes nothing. Call this before proposing ' +
      'any edit, so every ref you use is a real line.',
    inputSchema: readResumeLinesInputSchema,
    execute: async ({ resumeId }, ctx) => {
      const lines = toResumeLinesView(facts());
      ctx.memory.set(MEMORY_RESUME_LINES, lines);
      ctx.memory.set(MEMORY_RESUME_LINES_ID, resumeId);
      return lines;
    },
  });

  const proposeEdits = defineTool({
    name: 'propose_resume_edits',
    description:
      'Propose rewrites of the summary and existing experience bullets for the user to review. ' +
      'Saves them as a pending edit session — the resume is NOT changed, and you cannot apply ' +
      'them. Follio drops any rewrite that adds a tool, name, title or number the resume does ' +
      'not show. Call read_resume_lines and analyze_job_description first.',
    inputSchema: proposeResumeEditsInputSchema,
    execute: async ({ resumeId, request, changes }, ctx): Promise<ProposeResumeEditsResult> => {
      // Every production precondition, in production order.
      const prior = ctx.memory.get<ProposeResumeEditsResult>(MEMORY_PROPOSAL);
      if (prior?.sessionId) {
        throw Errors.badRequest(
          `This run already saved proposal ${prior.sessionId} with ${prior.proposed} change(s) ` +
            'for the user to review. Only one proposal per run — call submit_resume_result now.'
        );
      }
      if (ctx.memory.get<string>(MEMORY_PROPOSAL_ERROR)) {
        throw Errors.badRequest(
          'A proposal attempt in this run already failed while saving. Call submit_resume_result.'
        );
      }
      const jobDescription = ctx.memory.get<string>(MEMORY_JOB_DESCRIPTION);
      if (!jobDescription) {
        throw Errors.badRequest(
          'No job posting has been analyzed in this run. Call analyze_job_description first.'
        );
      }
      const linesFor = ctx.memory.get<string>(MEMORY_RESUME_LINES_ID);
      if (!linesFor) {
        throw Errors.badRequest(
          'Call read_resume_lines for this resume first, so every ref points at a real line.'
        );
      }
      const scoredFor = ctx.memory.get<string>(MEMORY_SCORED_RESUME_ID);
      if (!scoredFor) {
        throw Errors.badRequest(
          'This resume has not been scored against the posting yet. Call score_resume_against_jd first.'
        );
      }

      // Production grounding, unchanged. This is the safety claim under test.
      const grounded = groundAssistantEdits(facts(), {
        changes,
        instructions: request,
        jobDescription,
      });

      if (grounded.changes.length === 0) {
        const outcome: ProposeResumeEditsResult = {
          sessionId: null,
          resumeId,
          proposed: 0,
          dropped: grounded.dropped,
          ignored: grounded.ignored,
          needsInput: 0,
          changes: [],
          message: suggestionMessage({
            saved: 0,
            needsInput: 0,
            dropped: grounded.dropped,
            ignored: grounded.ignored,
            nextStep: REVIEW_IN_FOLLIO,
            blankStep: BLANKS_NEED_THE_USER,
          }),
        };
        ctx.memory.set(MEMORY_PROPOSAL, outcome);
        return outcome;
      }

      // Test-only: held in memory rather than written to Postgres.
      const session: LocalEditSession = {
        id: `local-session-${store.sessions.length + 1}`,
        profileId: resumeId,
        brief: {
          jobDescription,
          instructions: request,
          presets: [],
          scope: { kind: 'all' },
          via: AGENT_VIA,
        },
        changes: grounded.changes,
        droppedCount: grounded.dropped,
        failedSections: [],
        createdAt: new Date().toISOString(),
      };
      store.sessions.push(session);

      const needsInput = session.changes.filter((change) => hasPlaceholder(change.after)).length;
      const outcome: ProposeResumeEditsResult = {
        sessionId: session.id,
        resumeId,
        proposed: session.changes.length,
        dropped: grounded.dropped,
        ignored: grounded.ignored,
        needsInput,
        changes: toAssistantSession(session).changes,
        message: suggestionMessage({
          saved: session.changes.length,
          needsInput,
          dropped: grounded.dropped,
          ignored: grounded.ignored,
          // Mirrors production: no apply tool and no userFacts field.
          nextStep: REVIEW_IN_FOLLIO,
          blankStep: BLANKS_NEED_THE_USER,
        }),
      };
      ctx.memory.set(MEMORY_PROPOSAL, outcome);
      return outcome;
    },
  });

  return [getResume, scoreResume, readLines, proposeEdits];
}
