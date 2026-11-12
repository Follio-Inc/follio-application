import {
  createMcpHandler,
  McpServer,
  type AuthInfo,
  type CallToolResult,
  type StandardSchemaWithJSON,
} from '@modelcontextprotocol/server';
import type { z } from 'zod';

import {
  MCP_INSTRUCTIONS,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
} from '@/lib/ai-connector/constants';
import { hasScope } from '@/lib/ai-connector/scopes';

import { MCP_TOOLS, toolInputSchemas, type JsonSchema, type McpToolName } from './tools';

/** Who is calling, from their Follio connector token (checked in the route). */
export interface McpAuthContext {
  userId: string;
  clerkId: string;
  scopes: string[];
  clientLabel: string | null;
}

/** The work behind each tool. The app passes `aiConnectorHandlers`; tests pass fakes. */
export interface McpToolHandlers {
  listResumes: (ctx: McpAuthContext) => Promise<unknown>;
  getResume: (ctx: McpAuthContext, input: unknown) => Promise<unknown>;
  createResume: (ctx: McpAuthContext, input: unknown) => Promise<unknown>;
  cloneResume: (ctx: McpAuthContext, input: unknown) => Promise<unknown>;
  listDrafts: (ctx: McpAuthContext, input: unknown) => Promise<unknown>;
  proposeSummary: (ctx: McpAuthContext, input: unknown) => Promise<unknown>;
  proposeExperience: (ctx: McpAuthContext, input: unknown) => Promise<unknown>;
  proposeProject: (ctx: McpAuthContext, input: unknown) => Promise<unknown>;
  applyDraft: (ctx: McpAuthContext, input: unknown) => Promise<unknown>;
  discardDraft: (ctx: McpAuthContext, input: unknown) => Promise<unknown>;
  getResumeLines: (ctx: McpAuthContext, input: unknown) => Promise<unknown>;
  suggestResumeEdits: (ctx: McpAuthContext, input: unknown) => Promise<unknown>;
  applyResumeEdits: (ctx: McpAuthContext, input: unknown) => Promise<unknown>;
  undoResumeEdits: (ctx: McpAuthContext, input: unknown) => Promise<unknown>;
  listResumeEdits: (ctx: McpAuthContext, input: unknown) => Promise<unknown>;
}

//CONNECTING TO THE SDK. this file became necessary when we imlpemented MCP SDK

const TOOL_CALLS: Record<
  McpToolName,
  (handlers: McpToolHandlers, ctx: McpAuthContext, args: unknown) => Promise<unknown>
> = {
  list_resumes: (handlers, ctx) => handlers.listResumes(ctx),
  get_resume: (handlers, ctx, args) => handlers.getResume(ctx, args),
  create_resume: (handlers, ctx, args) => handlers.createResume(ctx, args),
  clone_resume: (handlers, ctx, args) => handlers.cloneResume(ctx, args),
  list_drafts: (handlers, ctx, args) => handlers.listDrafts(ctx, args),
  propose_summary: (handlers, ctx, args) => handlers.proposeSummary(ctx, args),
  propose_experience: (handlers, ctx, args) => handlers.proposeExperience(ctx, args),
  propose_project: (handlers, ctx, args) => handlers.proposeProject(ctx, args),
  apply_draft: (handlers, ctx, args) => handlers.applyDraft(ctx, args),
  discard_draft: (handlers, ctx, args) => handlers.discardDraft(ctx, args),
  get_resume_lines: (handlers, ctx, args) => handlers.getResumeLines(ctx, args),
  suggest_resume_edits: (handlers, ctx, args) => handlers.suggestResumeEdits(ctx, args),
  apply_resume_edits: (handlers, ctx, args) => handlers.applyResumeEdits(ctx, args),
  undo_resume_edits: (handlers, ctx, args) => handlers.undoResumeEdits(ctx, args),
  list_resume_edits: (handlers, ctx, args) => handlers.listResumeEdits(ctx, args),
};

function toolResult(payload: unknown, isError = false): CallToolResult {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  return {
    content: [{ type: 'text', text }],
    ...(isError ? { isError: true } : {}),
  };
}

/**
 * The SDK takes schemas that can both validate input and describe themselves as JSON Schema.
 * The app's Zod 3 schemas can validate (Standard Schema) but not convert, so this pairs each
 * with the JSON Schema `tools.ts` already writes by hand. Clients see that schema unchanged.
 */
function toolInput<T extends z.ZodTypeAny>(
  schema: T,
  jsonSchema: JsonSchema
): StandardSchemaWithJSON<z.input<T>, z.output<T>> {
  return {
    '~standard': {
      ...schema['~standard'],
      jsonSchema: { input: () => jsonSchema, output: () => jsonSchema },
    },
  };
}

/** One MCP server for one request, with every Follio tool bound to the caller. */
export function createFollioMcpServer(ctx: McpAuthContext, handlers: McpToolHandlers): McpServer {
  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    { instructions: MCP_INSTRUCTIONS }
  );

  // where server.register tool happens to expose the tool to AI
  for (const tool of MCP_TOOLS) {
    const name = tool.name as McpToolName;
    server.registerTool(
      name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: toolInput(toolInputSchemas[name], tool.inputSchema),
        annotations: tool.annotations,
      },
      // The SDK has already checked the input against the schema.
      async (args: unknown) => {
        if (!hasScope(ctx.scopes, tool.requiredScope)) {
          return toolResult(
            `This connection does not include the “${tool.requiredScope}” permission.`,
            true
          );
        }
        try {
          return toolResult(await TOOL_CALLS[name](handlers, ctx, args));
        } catch (error) {
          return toolResult(error instanceof Error ? error.message : 'Internal error', true);
        }
      }
    );
  }

  return server;
}

/** Carries the caller's Follio context through the SDK, which passes AuthInfo to the factory. */
export function toAuthInfo(token: string, ctx: McpAuthContext): AuthInfo {
  return {
    token,
    clientId: ctx.clientLabel ?? 'follio-connector',
    scopes: ctx.scopes,
    extra: { follio: ctx },
  };
}

function contextFromAuthInfo(authInfo: AuthInfo | undefined): McpAuthContext {
  const ctx = authInfo?.extra?.follio as McpAuthContext | undefined;
  // The route always passes AuthInfo after checking the token; never serve tools without it.
  if (!ctx) throw new Error('MCP request reached the server without a Follio connection');
  return ctx;
}

/**
 * The web-standard MCP handler (Request in, Response out). It speaks both the 2026-07-28
 * revision and the earlier handshake revisions, statelessly: a fresh server per request.
 */
export function createFollioMcpHandler(
  handlers: McpToolHandlers,
  onerror?: (error: Error) => void
) {
  return createMcpHandler(
    ({ authInfo }) => createFollioMcpServer(contextFromAuthInfo(authInfo), handlers),
    { onerror }
  );
}
