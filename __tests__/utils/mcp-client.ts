/**
 * Sends MCP messages through the real SDK handler, the way /api/mcp serves them after the
 * token check, and reads back the JSON-RPC reply (plain JSON or a one-event SSE stream).
 */

import {
  createFollioMcpHandler,
  toAuthInfo,
  type McpAuthContext,
  type McpToolHandlers,
} from '@/lib/mcp/server';

export const LEGACY_VERSION = '2025-06-18';
export const MODERN_VERSION = '2026-07-28';

/** `_meta` a 2026-07-28 client sends with every request. */
export const MODERN_META = {
  'io.modelcontextprotocol/protocolVersion': MODERN_VERSION,
  'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1' },
  'io.modelcontextprotocol/clientCapabilities': {},
};

export interface McpReply {
  status: number;
  contentType: string | null;
  /** The parsed JSON-RPC message, or null for an empty (202) reply. Tests read it loosely. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: Record<string, any> | null;
}

async function readReply(response: Response): Promise<McpReply> {
  const contentType = response.headers.get('content-type');
  const text = await response.text();
  let body: McpReply['body'] = null;
  if (text) {
    if (contentType?.includes('text/event-stream')) {
      const data = text.split('\n').find((line) => line.startsWith('data: '));
      body = data ? JSON.parse(data.slice('data: '.length)) : null;
    } else {
      body = JSON.parse(text);
    }
  }
  return { status: response.status, contentType, body };
}

export function createTestMcp(handlers: McpToolHandlers, ctx: McpAuthContext) {
  const handler = createFollioMcpHandler(handlers);

  async function send(
    message: unknown,
    options: { headers?: Record<string, string>; context?: McpAuthContext; accept?: string } = {}
  ): Promise<McpReply> {
    const request = new Request('http://localhost:3000/api/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: options.accept ?? 'application/json, text/event-stream',
        ...options.headers,
      },
      body: JSON.stringify(message),
    });
    const response = await handler.fetch(request, {
      authInfo: toAuthInfo('flio_test', options.context ?? ctx),
    });
    return readReply(response);
  }

  /** A tools/call on a handshake (2025) revision; returns the tool result. */
  async function callTool(name: string, args: unknown, context?: McpAuthContext) {
    const reply = await send(
      { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name, arguments: args } },
      { headers: { 'mcp-protocol-version': LEGACY_VERSION }, context }
    );
    if (!reply.body || !('result' in reply.body)) {
      throw new Error(`Expected a tool result, got ${JSON.stringify(reply.body)}`);
    }
    return reply.body.result as { isError?: boolean; content: Array<{ text: string }> };
  }

  return { send, callTool };
}
