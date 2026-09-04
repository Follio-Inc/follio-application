import { NextRequest } from 'next/server';

import { corsEmpty, corsJson, unauthorizedMcpResponse } from '@/lib/ai-connector/cors';
import { extractBearerToken } from '@/lib/ai-connector/bearer';
import { MCP_PROTOCOL_VERSION } from '@/lib/ai-connector/constants';
import { generateOpaqueToken } from '@/lib/ai-connector/crypto';
import { handleMcpMessage } from '@/lib/mcp/protocol';
import { isJsonRpcRequest } from '@/lib/mcp/jsonrpc';
import { aiConnectorHandlers, authenticateConnectorToken } from '@/services/ai-connector.service';
import { logger } from '@/lib/logger';

const mcpLogger = logger.child({ source: 'mcp' });

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return corsEmpty(204);
}

export async function GET() {
  return corsJson(
    { error: 'method_not_allowed', error_description: 'Use POST for MCP Streamable HTTP.' },
    { status: 405, headers: { Allow: 'POST, DELETE, OPTIONS' } }
  );
}

export async function DELETE() {
  return corsEmpty(204);
}

export async function POST(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) {
    return unauthorizedMcpResponse('Connect Follio with OAuth, then retry.');
  }

  const auth = await authenticateConnectorToken(token);
  if (!auth) {
    return unauthorizedMcpResponse(
      'This Follio connection is invalid or expired. Reconnect Follio.'
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return corsJson(
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
      { status: 400 }
    );
  }

  const sessionId = request.headers.get('mcp-session-id') || generateOpaqueToken(16);
  const ctx = {
    userId: auth.userId,
    scopes: auth.scopes,
    clientLabel: auth.clientLabel,
  };

  try {
    if (Array.isArray(body)) {
      const responses = [];
      for (const item of body) {
        const response = await handleMcpMessage(item, ctx, aiConnectorHandlers);
        if (response) responses.push(response);
      }
      if (responses.length === 0) {
        return corsEmpty(202);
      }
      return corsJson(responses.length === 1 ? responses[0] : responses, {
        headers: {
          'MCP-Session-Id': sessionId,
          'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
        },
      });
    }

    const response = await handleMcpMessage(body, ctx, aiConnectorHandlers);
    if (!response) {
      return corsEmpty(202);
    }

    const isInitialize = isJsonRpcRequest(body) && body.method === 'initialize';
    return corsJson(response, {
      headers: {
        ...(isInitialize ? { 'MCP-Session-Id': sessionId } : {}),
        'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
      },
    });
  } catch (error) {
    mcpLogger.error('MCP request failed', error, { userId: auth.userId });
    return corsJson(
      {
        jsonrpc: '2.0',
        id: isJsonRpcRequest(body) ? (body.id ?? null) : null,
        error: { code: -32603, message: 'Internal error' },
      },
      { status: 500 }
    );
  }
}
