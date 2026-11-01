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
import { RESUME_EDIT_LIMITS } from '@/lib/resume-edit/types';

import type { AiConnectorScope } from '@/lib/ai-connector/scopes';

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
}

function objectSchema(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
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

export const MCP_TOOLS: McpToolDefinition[] = [
  defineTool({
    name: 'get_profile',
    title: 'Read Follio',
    description:
      "Read the user's active Follio profile: name, headline, summary, experience, education, skills, and projects.",
    inputSchema: objectSchema({}),
    requiredScope: 'follio.read',
    readOnly: true,
  }),
  defineTool({
    name: 'list_drafts',
    title: 'List drafts',
    description: 'List pending AI edit drafts. These have not been applied to the live Follio yet.',
    inputSchema: objectSchema({}),
    requiredScope: 'follio.read',
    readOnly: true,
  }),
  defineTool({
    name: 'propose_summary',
    title: 'Propose headline or summary',
    description:
      'Propose a headline and/or summary update. Saves to a draft. Does not change the live Follio until apply_draft.',
    inputSchema: objectSchema(
      {
        headline: { type: 'string', description: 'Short professional headline' },
        summary: { type: 'string', description: 'About / summary paragraph' },
      },
      []
    ),
    requiredScope: 'follio.draft',
    readOnly: false,
  }),
  defineTool({
    name: 'propose_experience',
    title: 'Propose a role',
    description:
      'Propose adding a work experience. Saves to a draft. Does not change the live Follio until apply_draft.',
    inputSchema: objectSchema(
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
      'Propose adding a project. Saves to a draft. Does not change the live Follio until apply_draft.',
    inputSchema: objectSchema(
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
      "Apply a pending draft to the user's live Follio. ONLY call this after the user explicitly confirms the changes in this conversation. If they have not confirmed, summarize the draft instead.",
    inputSchema: objectSchema(
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
    description: 'Discard a pending draft without applying it.',
    inputSchema: objectSchema(
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
      'Read the editable lines of the active resume, each with a ref: "H" (headline), "S" (summary), "E1.2" (role 1, bullet 2). Also returns writingGuide (the step-by-step playbooks Follio uses for each kind of edit) and scores (writing checks with the lines that fail them). Call this before suggest_resume_edits.',
    inputSchema: objectSchema({}),
    requiredScope: 'follio.read',
    readOnly: true,
  }),
  defineTool({
    name: 'suggest_resume_edits',
    title: 'Suggest line edits',
    description: `Suggest line edits by ref: rewrite a line, add a bullet after one (ref "E1.2+", or "E1.0+" to put it first), or remove a bullet (remove: true). Saves them for review; the resume does not change. Follio removes edits that add tools, names, titles, or numbers the resume and the user never stated, turns unstated numbers into a [__] blank, adds at most ${RESUME_EDIT_LIMITS.maxNewBulletsPerRole} bullets per role, and keeps at least ${RESUME_EDIT_LIMITS.minBulletsPerRole} bullets in every role. Show the user each before/after, then call apply_resume_edits once they confirm.`,
    inputSchema: objectSchema(
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
    name: 'apply_resume_edits',
    title: 'Apply line edits',
    description:
      "Write suggested line edits to the user's live resume. ONLY call this after the user confirms in this conversation. Omit changeIds to apply every open suggestion in the session. Lines with a [__] blank are not applied. Every applied change can be undone.",
    inputSchema: objectSchema(
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
      'Undo applied line edits. Omit changeIds to undo everything applied from the session. Lines the user has edited since are kept as they are.',
    inputSchema: objectSchema(
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
      'List recent suggestion sets for the active resume, from this chat and from Follio, with each change and its status.',
    inputSchema: objectSchema({}),
    requiredScope: 'follio.read',
    readOnly: true,
  }),
];

export function listMcpTools() {
  return MCP_TOOLS.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
  }));
}

export const toolInputSchemas = {
  get_profile: z.object({}).passthrough(),
  list_drafts: z.object({}).passthrough(),
  propose_summary: ProposeSummarySchema,
  propose_experience: ProposeExperienceSchema,
  propose_project: ProposeProjectSchema,
  apply_draft: ApplyDraftSchema,
  discard_draft: ApplyDraftSchema,
  get_resume_lines: z.object({}).passthrough(),
  suggest_resume_edits: SuggestResumeEditsSchema,
  apply_resume_edits: ResumeEditSelectionSchema,
  undo_resume_edits: ResumeEditSelectionSchema,
  list_resume_edits: z.object({}).passthrough(),
} as const;

export type McpToolName = keyof typeof toolInputSchemas;
