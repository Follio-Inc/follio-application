import { z } from 'zod';

import {
  ApplyDraftSchema,
  ProposeExperienceSchema,
  ProposeProjectSchema,
  ProposeSummarySchema,
} from '@/lib/ai-connector/operations';
import {
  ResumeEditSelectionSchema,
  SuggestResumeEditsSchema,
} from '@/lib/ai-connector/resume-edits';
import {
  CloneResumeSchema,
  CreateResumeSchema,
  DeleteResumesSchema,
  MAX_RESUMES_PER_DELETE,
  RESUME_ID_DESCRIPTION,
  RenameResumeSchema,
  ResumeRefSchema,
} from '@/lib/ai-connector/resume-target';
import { RESUME_EDIT_LIMITS } from '@/lib/resume-edit/types';

import type { AiConnectorScope } from '@/lib/ai-connector/scopes';

import { RESUME_LIST_VIEW_URI } from './apps/pages';

export type JsonSchema = Record<string, unknown>;

export interface McpToolAnnotations {
  title: string;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

export interface McpToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  annotations: McpToolAnnotations;
  requiredScope: AiConnectorScope;
  /** The ui:// page hosts like claude.ai show with this tool's result (see lib/mcp/apps). */
  ui?: string;
}

function objectSchema(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

const resumeIdProperty: JsonSchema = {
  type: 'string',
  description: RESUME_ID_DESCRIPTION,
};

function withResumeId(
  properties: Record<string, JsonSchema> = {},
  required: string[] = []
): JsonSchema {
  return objectSchema({ resumeId: resumeIdProperty, ...properties }, ['resumeId', ...required]);
}

function defineTool(
  tool: Omit<McpToolDefinition, 'annotations'> & {
    readOnly: boolean;
    destructive?: boolean;
  }
): McpToolDefinition {
  const { readOnly, destructive = false, ...rest } = tool;
  return {
    ...rest,
    annotations: {
      title: rest.title,
      readOnlyHint: readOnly,
      destructiveHint: readOnly ? false : destructive,
      idempotentHint: false,
      openWorldHint: false,
    },
  };
}

// our plain list of tools, no MCP code in it. Each entry just describes a tool
export const MCP_TOOLS: McpToolDefinition[] = [
  defineTool({
    name: 'list_resumes',
    title: 'List resumes',
    description:
      "List the user's Follio resumes (id, title, handle, headline). Call this first. Then pass resumeId on every other tool. Never guess which resume they meant, and never use isActive as a default.",
    inputSchema: objectSchema({}),
    requiredScope: 'follio.read',
    readOnly: true,
    ui: RESUME_LIST_VIEW_URI, // where we define the tool.ui
  }),
  defineTool({
    name: 'get_resume',
    title: 'Read a resume',
    description:
      'Read one resume: name, headline, summary, experience, education, skills, and projects. Requires resumeId from list_resumes.',
    inputSchema: withResumeId(),
    requiredScope: 'follio.read',
    readOnly: true,
  }),
  defineTool({
    name: 'create_resume',
    title: 'Create a resume',
    description:
      'Create a new blank Follio resume. Optional title. Returns resumeId — pass that on later tools. Does not change the original resumes or the resume open in the Follio builder. The new resume starts private.',
    inputSchema: objectSchema({
      title: { type: 'string', description: 'Name for the new resume, e.g. "Stripe PM".' },
    }),
    requiredScope: 'follio.draft',
    readOnly: false,
  }),
  defineTool({
    name: 'clone_resume',
    title: 'Clone a resume',
    description:
      'Copy one resume into a new resume. Requires resumeId of the source. Optional title for the copy. Returns the new resumeId — use that for later edits. The original is unchanged. Does not switch the resume open in the Follio builder. The copy starts private.',
    inputSchema: withResumeId({
      title: { type: 'string', description: 'Name for the copy, e.g. "Stripe PM".' },
    }),
    requiredScope: 'follio.draft',
    readOnly: false,
  }),
  defineTool({
    name: 'open_in_builder',
    title: 'Open a resume in Follio',
    description:
      'Make one resume the resume the Follio website builder shows, and get the builder link (builderUrl). Use when the user wants to open or edit a resume on Follio themselves. Requires resumeId from list_resumes. Does not change the resume itself.',
    inputSchema: withResumeId(),
    requiredScope: 'follio.draft',
    readOnly: false,
  }),
  defineTool({
    name: 'rename_resume',
    title: 'Rename a resume',
    description:
      "Change the title of one resume. Requires resumeId from list_resumes and the new title. Only the title changes: the content, handle, and links stay the same. Titles must be unique among the user's resumes; if the title is taken, nothing changes, so ask the user for a different one.",
    inputSchema: withResumeId(
      {
        title: { type: 'string', description: 'The new title, e.g. "Stripe PM".' },
      },
      ['title']
    ),
    requiredScope: 'follio.apply',
    readOnly: false,
  }),
  defineTool({
    name: 'delete_resumes',
    title: 'Delete resumes',
    description: `Permanently delete one or more of the user's resumes and everything in them. This cannot be undone. ONLY call this after the user explicitly confirms, in this conversation, exactly which resumes to delete. Pass each resume's resumeId from list_resumes and its exact title as confirmTitle; if any title does not match, nothing is deleted. Up to ${MAX_RESUMES_PER_DELETE} at a time, and the user always keeps at least one resume. If the resume open in the builder or the portfolio's resume is deleted, the result says which resume replaced it: tell the user.`,
    inputSchema: objectSchema(
      {
        resumes: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_RESUMES_PER_DELETE,
          description: 'The resumes to delete, each with its exact title.',
          items: objectSchema(
            {
              resumeId: resumeIdProperty,
              confirmTitle: {
                type: 'string',
                description:
                  'The exact title of this resume, as list_resumes shows it and the user confirmed.',
              },
            },
            ['resumeId', 'confirmTitle']
          ),
        },
      },
      ['resumes']
    ),
    requiredScope: 'follio.apply',
    readOnly: false,
    destructive: true,
  }),
  defineTool({
    name: 'list_drafts',
    title: 'List drafts',
    description:
      'List pending AI edit drafts for one resume. These have not been applied to the live Follio yet.',
    inputSchema: withResumeId(),
    requiredScope: 'follio.read',
    readOnly: true,
  }),
  defineTool({
    name: 'propose_summary',
    title: 'Propose headline or summary',
    description:
      'Propose a headline and/or summary update on one resume. Saves to a draft, replacing any headline or summary proposed earlier in it, so call it again to revise. Does not change the live Follio until apply_draft.',
    inputSchema: withResumeId({
      headline: { type: 'string', description: 'Short professional headline' },
      summary: { type: 'string', description: 'About / summary paragraph' },
    }),
    requiredScope: 'follio.draft',
    readOnly: false,
  }),
  defineTool({
    name: 'propose_experience',
    title: 'Propose a role',
    description:
      'Propose adding a work experience to one resume. Saves to a draft. Does not change the live Follio until apply_draft.',
    inputSchema: withResumeId(
      {
        company: { type: 'string' },
        role: { type: 'string' },
        startDate: { type: 'string', description: 'YYYY-MM or YYYY-MM-DD' },
        endDate: { type: 'string', description: 'YYYY-MM or YYYY-MM-DD. Omit if current.' },
        isCurrent: { type: 'boolean' },
        location: { type: 'string' },
        bullets: { type: 'array', items: { type: 'string' } },
      },
      ['company', 'role', 'startDate']
    ),
    requiredScope: 'follio.draft',
    readOnly: false,
  }),
  defineTool({
    name: 'propose_project',
    title: 'Propose a project',
    description:
      'Propose adding a project to one resume. Saves to a draft. Does not change the live Follio until apply_draft.',
    inputSchema: withResumeId(
      {
        title: { type: 'string' },
        description: { type: 'string' },
        url: { type: 'string' },
        techStack: { type: 'array', items: { type: 'string' } },
        highlights: { type: 'array', items: { type: 'string' } },
      },
      ['title']
    ),
    requiredScope: 'follio.draft',
    readOnly: false,
  }),
  defineTool({
    name: 'apply_draft',
    title: 'Apply a draft',
    description:
      "Apply a pending draft to that resume's live Follio. ONLY call this after the user explicitly confirms the changes in this conversation. If they have not confirmed, summarize the draft instead.",
    inputSchema: withResumeId(
      {
        draftId: { type: 'string' },
      },
      ['draftId']
    ),
    requiredScope: 'follio.apply',
    readOnly: false,
    destructive: true,
  }),
  defineTool({
    name: 'discard_draft',
    title: 'Discard a draft',
    description: 'Discard a pending draft on one resume without applying it.',
    inputSchema: withResumeId(
      {
        draftId: { type: 'string' },
      },
      ['draftId']
    ),
    requiredScope: 'follio.draft',
    readOnly: false,
  }),
  defineTool({
    name: 'get_resume_lines',
    title: 'Read resume lines',
    description:
      'Read the editable lines of one resume, each with a ref: "H" (headline), "S" (summary), "E1.2" (role 1, bullet 2). Also returns writingGuide (the step-by-step playbooks Follio uses for each kind of edit) and scores (writing checks with the lines that fail them). Call this before suggest_resume_edits.',
    inputSchema: withResumeId(),
    requiredScope: 'follio.read',
    readOnly: true,
  }),
  defineTool({
    name: 'suggest_resume_edits',
    title: 'Suggest line edits',
    description: `Suggest line edits on one resume by ref: rewrite a line, add a bullet after one (ref "E1.2+", or "E1.0+" to put it first), or remove a bullet (remove: true). Saves them for review; the resume does not change. Follio removes edits that add tools, names, titles, or numbers the resume and the user never stated, turns unstated numbers into a [__] blank, adds at most ${RESUME_EDIT_LIMITS.maxNewBulletsPerRole} bullets per role, and keeps at least ${RESUME_EDIT_LIMITS.minBulletsPerRole} bullets in every role. Show the user each before/after, then call apply_resume_edits once they confirm.`,
    inputSchema: withResumeId(
      {
        request: {
          type: 'string',
          description: 'What the user asked for, in their words.',
        },
        userFacts: {
          type: 'string',
          description:
            'Facts the user told you in this conversation that the resume does not show yet (numbers, tools, results). Only what they actually said.',
        },
        jobDescription: {
          type: 'string',
          description: 'Job posting to tailor to, if any. Used for emphasis, never as facts.',
        },
        changes: {
          type: 'array',
          items: objectSchema(
            {
              ref: {
                type: 'string',
                description: 'A ref from get_resume_lines. End it with + to add a bullet after it.',
              },
              text: {
                type: 'string',
                description: 'The full new text for that line. Omit when removing.',
              },
              remove: { type: 'boolean', description: 'true to remove this bullet' },
              reason: { type: 'string', description: 'One short line on why' },
            },
            ['ref']
          ),
        },
      },
      ['request', 'changes']
    ),
    requiredScope: 'follio.draft',
    readOnly: false,
  }),
  defineTool({
    name: 'apply_resume_edits', //apply/undo resume edits are for editing just 1 line/bullet, but apply draft is for adding a whole new section.
    title: 'Apply line edits',
    description:
      'Write suggested line edits to that resume. ONLY call this after the user confirms in this conversation. Omit changeIds to apply every open suggestion in the session. Lines with a [__] blank are not applied. Every applied change can be undone.',
    inputSchema: withResumeId(
      {
        sessionId: { type: 'string' },
        changeIds: { type: 'array', items: { type: 'string' } },
      },
      ['sessionId']
    ),
    requiredScope: 'follio.apply',
    readOnly: false,
    destructive: true,
  }),
  defineTool({
    name: 'undo_resume_edits',
    title: 'Undo line edits',
    description:
      'Undo applied line edits on one resume. Omit changeIds to undo everything applied from the session. Lines the user has edited since are kept as they are.',
    inputSchema: withResumeId(
      {
        sessionId: { type: 'string' },
        changeIds: { type: 'array', items: { type: 'string' } },
      },
      ['sessionId']
    ),
    requiredScope: 'follio.apply',
    readOnly: false,
    destructive: true,
  }),
  defineTool({
    name: 'list_resume_edits',
    title: 'List line edits',
    description:
      'List recent suggestion sets for one resume, from this chat and from Follio, with each change and its status.',
    inputSchema: withResumeId(),
    requiredScope: 'follio.read',
    readOnly: true,
  }),
];

export const toolInputSchemas = {
  list_resumes: z.object({}).passthrough(),
  get_resume: ResumeRefSchema,
  create_resume: CreateResumeSchema,
  clone_resume: CloneResumeSchema,
  open_in_builder: ResumeRefSchema,
  rename_resume: RenameResumeSchema,
  delete_resumes: DeleteResumesSchema,
  list_drafts: ResumeRefSchema,
  propose_summary: ProposeSummarySchema.and(ResumeRefSchema),
  propose_experience: ProposeExperienceSchema.and(ResumeRefSchema),
  propose_project: ProposeProjectSchema.and(ResumeRefSchema),
  apply_draft: ApplyDraftSchema.and(ResumeRefSchema),
  discard_draft: ApplyDraftSchema.and(ResumeRefSchema),
  get_resume_lines: ResumeRefSchema,
  suggest_resume_edits: SuggestResumeEditsSchema.and(ResumeRefSchema),
  apply_resume_edits: ResumeEditSelectionSchema.and(ResumeRefSchema),
  undo_resume_edits: ResumeEditSelectionSchema.and(ResumeRefSchema),
  list_resume_edits: ResumeRefSchema,
} as const;

export type McpToolName = keyof typeof toolInputSchemas;
