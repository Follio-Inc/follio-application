import {
  MCP_INSTRUCTIONS,
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
} from '@/lib/ai-connector/constants';
import { hasScope, type AiConnectorScope } from '@/lib/ai-connector/scopes';

import {
  isJsonRpcRequest,
  isNotification,
  JSON_RPC_INTERNAL_ERROR,
  JSON_RPC_INVALID_PARAMS,
  JSON_RPC_INVALID_REQUEST,
  JSON_RPC_METHOD_NOT_FOUND,
  jsonRpcError,
  jsonRpcResult,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from './jsonrpc';
import { MCP_TOOLS, toolInputSchemas } from './tools';

export interface McpAuthContext {
  userId: string;
  scopes: string[];
  clientLabel: string | null;
}

export interface McpToolHandlers {
  getProfile: (ctx: McpAuthContext) => Promise<unknown>;
  listDrafts: (ctx: McpAuthContext) => Promise<unknown>;
  proposeSummary: (ctx: McpAuthContext, input: unknown) => Promise<unknown>;
  proposeExperience: (ctx: McpAuthContext, input: unknown) => Promise<unknown>;
  proposeProject: (ctx: McpAuthContext, input: unknown) => Promise<unknown>;
  applyDraft: (ctx: McpAuthContext, input: unknown) => Promise<unknown>;
  discardDraft: (ctx: McpAuthContext, input: unknown) => Promise<unknown>;
}

function toolResult(payload: unknown, isError = false) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  return {
    content: [{ type: 'text', text }],
    ...(isError ? { isError: true } : {}),
  };
}

function initializeResult(requestedVersion: unknown) {
  const protocolVersion =
    typeof requestedVersion === 'string' && requestedVersion.length > 0
      ? requestedVersion
      : MCP_PROTOCOL_VERSION;

  return {
    protocolVersion,
    capabilities: {
      tools: { listChanged: false },
    },
    serverInfo: {
      name: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
    },
    instructions: MCP_INSTRUCTIONS,
  };
}

async function callTool(
  name: string,
  rawArgs: unknown,
  ctx: McpAuthContext,
  handlers: McpToolHandlers
): Promise<unknown> {
  const definition = MCP_TOOLS.find((tool) => tool.name === name);
  if (!definition) {
    return toolResult(`Unknown tool: ${name}`, true);
  }

  if (!hasScope(ctx.scopes, definition.requiredScope as AiConnectorScope)) {
    return toolResult(
      `This connection does not include the “${definition.requiredScope}” permission.`,
      true
    );
  }

  const schema = toolInputSchemas[name as keyof typeof toolInputSchemas];
  const parsed = schema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return toolResult(
      `Invalid arguments: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`,
      true
    );
  }

  switch (name) {
    case 'get_profile':
      return toolResult(await handlers.getProfile(ctx));
    case 'list_drafts':
      return toolResult(await handlers.listDrafts(ctx));
    case 'propose_summary':
      return toolResult(await handlers.proposeSummary(ctx, parsed.data));
    case 'propose_experience':
      return toolResult(await handlers.proposeExperience(ctx, parsed.data));
    case 'propose_project':
      return toolResult(await handlers.proposeProject(ctx, parsed.data));
    case 'apply_draft':
      return toolResult(await handlers.applyDraft(ctx, parsed.data));
    case 'discard_draft':
      return toolResult(await handlers.discardDraft(ctx, parsed.data));
    default:
      return toolResult(`Unknown tool: ${name}`, true);
  }
}

export async function handleMcpMessage(
  message: unknown,
  ctx: McpAuthContext,
  handlers: McpToolHandlers
): Promise<JsonRpcResponse | null> {
  if (!isJsonRpcRequest(message)) {
    return jsonRpcError(null, JSON_RPC_INVALID_REQUEST, 'Invalid JSON-RPC request');
  }

  const request = message as JsonRpcRequest;
  const id = request.id ?? null;

  try {
    switch (request.method) {
      case 'initialize': {
        const params = (request.params ?? {}) as { protocolVersion?: unknown };
        return jsonRpcResult(id, initializeResult(params.protocolVersion));
      }
      case 'notifications/initialized':
      case 'notifications/cancelled':
        return null;
      case 'ping':
        return jsonRpcResult(id, {});
      case 'tools/list':
        return jsonRpcResult(id, {
          tools: MCP_TOOLS.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        });
      case 'tools/call': {
        const params = (request.params ?? {}) as { name?: unknown; arguments?: unknown };
        if (typeof params.name !== 'string') {
          return jsonRpcError(id, JSON_RPC_INVALID_PARAMS, 'tools/call requires a tool name');
        }
        const result = await callTool(params.name, params.arguments ?? {}, ctx, handlers);
        return jsonRpcResult(id, result);
      }
      default:
        if (isNotification(request)) return null;
        return jsonRpcError(id, JSON_RPC_METHOD_NOT_FOUND, `Unknown method: ${request.method}`);
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Internal error';
    if (request.method === 'tools/call') {
      return jsonRpcResult(id, toolResult(messageText, true));
    }
    return jsonRpcError(id, JSON_RPC_INTERNAL_ERROR, messageText);
  }
}
