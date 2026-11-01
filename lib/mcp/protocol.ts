import {
  MCP_INSTRUCTIONS,
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
  type JsonRpcId,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from './jsonrpc';
import { listMcpTools, MCP_TOOLS, toolInputSchemas, type McpToolName } from './tools';
import {
  CURRENT_PROTOCOL_VERSION,
  decodeMcpHeaderValue,
  isKnownProtocolVersion,
  isLegacyProtocolVersion,
  isModernProtocolVersion,
  JSON_RPC_HEADER_MISMATCH,
  JSON_RPC_UNSUPPORTED_PROTOCOL,
  modernProtocolVersions,
  negotiateLegacyVersion,
  OLDEST_LEGACY_PROTOCOL_VERSION,
  protocolVersionFromParams,
  SERVER_INFO_META_KEY,
} from './versions';

export interface McpAuthContext {
  userId: string;
  clerkId: string;
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
  getResumeLines: (ctx: McpAuthContext) => Promise<unknown>;
  suggestResumeEdits: (ctx: McpAuthContext, input: unknown) => Promise<unknown>;
  applyResumeEdits: (ctx: McpAuthContext, input: unknown) => Promise<unknown>;
  undoResumeEdits: (ctx: McpAuthContext, input: unknown) => Promise<unknown>;
  listResumeEdits: (ctx: McpAuthContext) => Promise<unknown>;
}

/** Headers the Streamable HTTP transport mirrors from the JSON-RPC body. */
export interface McpRequestHeaders {
  protocolHeader?: string | null;
  mcpMethodHeader?: string | null;
  mcpNameHeader?: string | null;
}

export interface McpDispatchResult {
  body: JsonRpcResponse | null;
  status: number;
  protocolVersion: string;
}

const TOOL_LIST_TTL_MS = 5 * 60 * 1000;
const DISCOVER_TTL_MS = 60 * 60 * 1000;

const TOOL_CALLS: Record<
  McpToolName,
  (handlers: McpToolHandlers, ctx: McpAuthContext, args: unknown) => Promise<unknown>
> = {
  get_profile: (handlers, ctx) => handlers.getProfile(ctx),
  list_drafts: (handlers, ctx) => handlers.listDrafts(ctx),
  propose_summary: (handlers, ctx, args) => handlers.proposeSummary(ctx, args),
  propose_experience: (handlers, ctx, args) => handlers.proposeExperience(ctx, args),
  propose_project: (handlers, ctx, args) => handlers.proposeProject(ctx, args),
  apply_draft: (handlers, ctx, args) => handlers.applyDraft(ctx, args),
  discard_draft: (handlers, ctx, args) => handlers.discardDraft(ctx, args),
  get_resume_lines: (handlers, ctx) => handlers.getResumeLines(ctx),
  suggest_resume_edits: (handlers, ctx, args) => handlers.suggestResumeEdits(ctx, args),
  apply_resume_edits: (handlers, ctx, args) => handlers.applyResumeEdits(ctx, args),
  undo_resume_edits: (handlers, ctx, args) => handlers.undoResumeEdits(ctx, args),
  list_resume_edits: (handlers, ctx) => handlers.listResumeEdits(ctx),
};

function toolResult(payload: unknown, isError = false) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  return {
    content: [{ type: 'text', text }],
    ...(isError ? { isError: true } : {}),
  };
}

function serverInfoMeta() {
  return {
    [SERVER_INFO_META_KEY]: {
      name: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
    },
  };
}

function modernResult(id: JsonRpcId, fields: Record<string, unknown>): JsonRpcResponse {
  const { _meta: extraMeta, ...rest } = fields;
  const extra =
    extraMeta && typeof extraMeta === 'object' ? (extraMeta as Record<string, unknown>) : {};
  return jsonRpcResult(id, {
    resultType: 'complete',
    ...rest,
    _meta: {
      ...extra,
      ...serverInfoMeta(),
    },
  });
}

function unsupportedProtocol(id: JsonRpcId, requested: string): JsonRpcResponse {
  return jsonRpcError(id, JSON_RPC_UNSUPPORTED_PROTOCOL, 'Unsupported protocol version', {
    supported: modernProtocolVersions(),
    requested,
  });
}

function headerMismatch(id: JsonRpcId, message: string): JsonRpcResponse {
  return jsonRpcError(id, JSON_RPC_HEADER_MISMATCH, message);
}

function initializeResult(requestedVersion: unknown) {
  return {
    protocolVersion: negotiateLegacyVersion(requestedVersion),
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

function discoverResult() {
  return {
    supportedVersions: modernProtocolVersions(),
    capabilities: {
      tools: { listChanged: false },
    },
    instructions: MCP_INSTRUCTIONS,
    ttlMs: DISCOVER_TTL_MS,
    cacheScope: 'public' as const,
  };
}

async function callTool(
  name: string,
  rawArgs: unknown,
  ctx: McpAuthContext,
  handlers: McpToolHandlers
): Promise<Record<string, unknown>> {
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

  const schema = toolInputSchemas[name as McpToolName];
  if (!schema) {
    return toolResult(`Unknown tool: ${name}`, true);
  }

  const parsed = schema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return toolResult(
      `Invalid arguments: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`,
      true
    );
  }

  const call = TOOL_CALLS[name as McpToolName];
  if (!call) {
    return toolResult(`Unknown tool: ${name}`, true);
  }
  return toolResult(await call(handlers, ctx, parsed.data));
}

function isModernRequest(request: JsonRpcRequest, http: McpRequestHeaders): boolean {
  const header = http.protocolHeader ?? null;
  if (header && isModernProtocolVersion(header)) return true;
  const bodyVersion = protocolVersionFromParams(request.params);
  return Boolean(bodyVersion && isModernProtocolVersion(bodyVersion));
}

function validateModernHeaders(
  request: JsonRpcRequest,
  http: McpRequestHeaders
): JsonRpcResponse | null {
  const id = request.id ?? null;
  const headerVersion = http.protocolHeader ?? null;
  const bodyVersion = protocolVersionFromParams(request.params);

  if (!headerVersion || !http.mcpMethodHeader) {
    return headerMismatch(
      id,
      'MCP-Protocol-Version and Mcp-Method headers are required for this protocol revision'
    );
  }

  if (!isModernProtocolVersion(headerVersion)) {
    return unsupportedProtocol(id, headerVersion);
  }

  if (headerVersion !== bodyVersion) {
    return headerMismatch(
      id,
      'MCP-Protocol-Version header does not match io.modelcontextprotocol/protocolVersion'
    );
  }

  if (http.mcpMethodHeader !== request.method) {
    return headerMismatch(
      id,
      `Mcp-Method header value '${http.mcpMethodHeader}' does not match body method '${request.method}'`
    );
  }

  if (request.method === 'tools/call') {
    const params = (request.params ?? {}) as { name?: unknown };
    const bodyName = typeof params.name === 'string' ? params.name : '';
    const headerName = http.mcpNameHeader ? decodeMcpHeaderValue(http.mcpNameHeader) : '';
    if (!headerName || headerName !== bodyName) {
      return headerMismatch(
        id,
        `Mcp-Name header value '${headerName}' does not match body value '${bodyName}'`
      );
    }
  }

  return null;
}

async function dispatchModern(
  request: JsonRpcRequest,
  http: McpRequestHeaders,
  ctx: McpAuthContext,
  handlers: McpToolHandlers
): Promise<McpDispatchResult> {
  const id = request.id ?? null;
  const protocolVersion =
    (http.protocolHeader && isModernProtocolVersion(http.protocolHeader)
      ? http.protocolHeader
      : null) ?? CURRENT_PROTOCOL_VERSION;

  const headerError = validateModernHeaders(request, http);
  if (headerError) {
    return { body: headerError, status: 400, protocolVersion };
  }

  try {
    switch (request.method) {
      case 'server/discover':
        return {
          body: modernResult(id, discoverResult()),
          status: 200,
          protocolVersion,
        };
      case 'tools/list':
        return {
          body: modernResult(id, {
            tools: listMcpTools(),
            ttlMs: TOOL_LIST_TTL_MS,
            cacheScope: 'public',
          }),
          status: 200,
          protocolVersion,
        };
      case 'tools/call': {
        const params = (request.params ?? {}) as { name?: unknown; arguments?: unknown };
        if (typeof params.name !== 'string') {
          return {
            body: jsonRpcError(id, JSON_RPC_INVALID_PARAMS, 'tools/call requires a tool name'),
            status: 200,
            protocolVersion,
          };
        }
        const result = await callTool(params.name, params.arguments ?? {}, ctx, handlers);
        return { body: modernResult(id, result), status: 200, protocolVersion };
      }
      default:
        if (isNotification(request)) {
          return { body: null, status: 202, protocolVersion };
        }
        return {
          body: jsonRpcError(id, JSON_RPC_METHOD_NOT_FOUND, `Unknown method: ${request.method}`),
          status: 404,
          protocolVersion,
        };
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Internal error';
    if (request.method === 'tools/call') {
      return {
        body: modernResult(id, toolResult(messageText, true)),
        status: 200,
        protocolVersion,
      };
    }
    return {
      body: jsonRpcError(id, JSON_RPC_INTERNAL_ERROR, messageText),
      status: 500,
      protocolVersion,
    };
  }
}

async function dispatchLegacy(
  request: JsonRpcRequest,
  http: McpRequestHeaders,
  ctx: McpAuthContext,
  handlers: McpToolHandlers
): Promise<McpDispatchResult> {
  const id = request.id ?? null;
  const headerVersion = http.protocolHeader ?? null;
  const protocolVersion =
    headerVersion && isLegacyProtocolVersion(headerVersion)
      ? headerVersion
      : OLDEST_LEGACY_PROTOCOL_VERSION;

  try {
    switch (request.method) {
      case 'initialize': {
        const params = (request.params ?? {}) as { protocolVersion?: unknown };
        const result = initializeResult(params.protocolVersion);
        return {
          body: jsonRpcResult(id, result),
          status: 200,
          protocolVersion: result.protocolVersion,
        };
      }
      case 'notifications/initialized':
      case 'notifications/cancelled':
        return { body: null, status: 202, protocolVersion };
      case 'ping':
        return { body: jsonRpcResult(id, {}), status: 200, protocolVersion };
      case 'tools/list':
        return {
          body: jsonRpcResult(id, { tools: listMcpTools() }),
          status: 200,
          protocolVersion,
        };
      case 'tools/call': {
        const params = (request.params ?? {}) as { name?: unknown; arguments?: unknown };
        if (typeof params.name !== 'string') {
          return {
            body: jsonRpcError(id, JSON_RPC_INVALID_PARAMS, 'tools/call requires a tool name'),
            status: 200,
            protocolVersion,
          };
        }
        const result = await callTool(params.name, params.arguments ?? {}, ctx, handlers);
        return { body: jsonRpcResult(id, result), status: 200, protocolVersion };
      }
      case 'server/discover':
        return {
          body: modernResult(id, discoverResult()),
          status: 200,
          protocolVersion: CURRENT_PROTOCOL_VERSION,
        };
      default:
        if (isNotification(request)) return { body: null, status: 202, protocolVersion };
        return {
          body: jsonRpcError(id, JSON_RPC_METHOD_NOT_FOUND, `Unknown method: ${request.method}`),
          status: 200,
          protocolVersion,
        };
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Internal error';
    if (request.method === 'tools/call') {
      return {
        body: jsonRpcResult(id, toolResult(messageText, true)),
        status: 200,
        protocolVersion,
      };
    }
    return {
      body: jsonRpcError(id, JSON_RPC_INTERNAL_ERROR, messageText),
      status: 500,
      protocolVersion,
    };
  }
}

export async function dispatchMcpMessage(
  message: unknown,
  http: McpRequestHeaders,
  ctx: McpAuthContext,
  handlers: McpToolHandlers
): Promise<McpDispatchResult> {
  if (!isJsonRpcRequest(message)) {
    return {
      body: jsonRpcError(null, JSON_RPC_INVALID_REQUEST, 'Invalid JSON-RPC request'),
      status: 400,
      protocolVersion: OLDEST_LEGACY_PROTOCOL_VERSION,
    };
  }

  const request = message as JsonRpcRequest;
  if (isModernRequest(request, http)) {
    return dispatchModern(request, http, ctx, handlers);
  }

  return dispatchLegacy(request, http, ctx, handlers);
}

export async function dispatchMcpBody(
  body: unknown,
  http: McpRequestHeaders,
  ctx: McpAuthContext,
  handlers: McpToolHandlers
): Promise<McpDispatchResult & { payload: unknown }> {
  const header = http.protocolHeader ?? null;
  if (header && !isKnownProtocolVersion(header)) {
    return {
      body: unsupportedProtocol(null, header),
      payload: unsupportedProtocol(null, header),
      status: 400,
      protocolVersion: CURRENT_PROTOCOL_VERSION,
    };
  }

  if (Array.isArray(body)) {
    if (header && isModernProtocolVersion(header)) {
      const error = jsonRpcError(
        null,
        JSON_RPC_INVALID_REQUEST,
        'JSON-RPC batches are not supported for this protocol revision'
      );
      return { body: error, payload: error, status: 400, protocolVersion: header };
    }

    const responses = [];
    let protocolVersion =
      header && isLegacyProtocolVersion(header) ? header : OLDEST_LEGACY_PROTOCOL_VERSION;
    for (const item of body) {
      const result = await dispatchMcpMessage(item, http, ctx, handlers);
      protocolVersion = result.protocolVersion;
      if (result.body) responses.push(result.body);
    }
    if (responses.length === 0) {
      return { body: null, payload: null, status: 202, protocolVersion };
    }
    const payload = responses.length === 1 ? responses[0] : responses;
    return { body: responses[0] ?? null, payload, status: 200, protocolVersion };
  }

  const result = await dispatchMcpMessage(body, http, ctx, handlers);
  return { ...result, payload: result.body };
}

/** Legacy entry point used by unit tests. Speaks the handshake revision. */
export async function handleMcpMessage(
  message: unknown,
  ctx: McpAuthContext,
  handlers: McpToolHandlers
): Promise<JsonRpcResponse | null> {
  const result = await dispatchMcpMessage(message, {}, ctx, handlers);
  return result.body;
}
