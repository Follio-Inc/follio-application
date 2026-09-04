import { z } from 'zod';

import {
  ApplyDraftSchema,
  ProposeExperienceSchema,
  ProposeProjectSchema,
  ProposeSummarySchema,
} from '@/lib/ai-connector/operations';

export type JsonSchema = Record<string, unknown>;

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  requiredScope: 'follio.read' | 'follio.draft' | 'follio.apply';
}

function objectSchema(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

export const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'get_profile',
    description:
      "Read the user's active Follio profile: name, headline, summary, experience, education, skills, and projects.",
    inputSchema: objectSchema({}),
    requiredScope: 'follio.read',
  },
  {
    name: 'list_drafts',
    description: 'List pending AI edit drafts. These have not been applied to the live Follio yet.',
    inputSchema: objectSchema({}),
    requiredScope: 'follio.read',
  },
  {
    name: 'propose_summary',
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
  },
  {
    name: 'propose_experience',
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
  },
  {
    name: 'propose_project',
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
  },
  {
    name: 'apply_draft',
    description:
      "Apply a pending draft to the user's live Follio. ONLY call this after the user explicitly confirms the changes in this conversation. If they have not confirmed, summarize the draft instead.",
    inputSchema: objectSchema(
      {
        draftId: { type: 'string' },
      },
      ['draftId']
    ),
    requiredScope: 'follio.apply',
  },
  {
    name: 'discard_draft',
    description: 'Discard a pending draft without applying it.',
    inputSchema: objectSchema(
      {
        draftId: { type: 'string' },
      },
      ['draftId']
    ),
    requiredScope: 'follio.draft',
  },
];

export const toolInputSchemas = {
  get_profile: z.object({}).passthrough(),
  list_drafts: z.object({}).passthrough(),
  propose_summary: ProposeSummarySchema,
  propose_experience: ProposeExperienceSchema,
  propose_project: ProposeProjectSchema,
  apply_draft: ApplyDraftSchema,
  discard_draft: ApplyDraftSchema,
} as const;
