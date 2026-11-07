import { NextRequest, NextResponse } from 'next/server';

import {
  corsEmpty,
  corsJson,
  MCP_CORS_HEADERS,
  unauthorizedMcpResponse,
} from '@/lib/ai-connector/cors';
import { extractBearerToken } from '@/lib/ai-connector/bearer';
import {
  JSON_RPC_INTERNAL_ERROR,
  JSON_RPC_INVALID_REQUEST,
  JSON_RPC_PARSE_ERROR,
  jsonRpcError,
} from '@/lib/mcp/jsonrpc';
import { isAllowedMcpOrigin, prefersEventStream } from '@/lib/mcp/origin';
import { dispatchMcpBody } from '@/lib/mcp/protocol';
import { aiConnectorHandlers, authenticateConnectorToken } from '@/services/ai-connector.service';
import { logger } from '@/lib/logger';
import { getBaseUrl } from '@/lib/utils';

const mcpLogger = logger.child({ source: 'mcp' });

export const dynamic = 'force-dynamic';

function mcpHeaders(protocolVersion: string, extra?: HeadersInit) {
  const headers = new Headers(extra);
  headers.set('MCP-Protocol-Version', protocolVersion);
  headers.set('Cache-Control', 'no-store');
  return headers;
}

function mcpJson(body: unknown, status: number, protocolVersion: string) {
  return corsJson(body, { status, headers: mcpHeaders(protocolVersion) });
}

function mcpSse(body: unknown, protocolVersion: string) {
  const headers = mcpHeaders(protocolVersion, MCP_CORS_HEADERS);
  headers.set('Content-Type', 'text/event-stream; charset=utf-8');
  headers.set('X-Accel-Buffering', 'no');
  const stream = `event: message\ndata: ${JSON.stringify(body)}\n\n`;
  return new NextResponse(stream, { status: 200, headers });
}

export async function OPTIONS() {
  return corsEmpty(204);
}

export async function GET() {
  return corsJson(
    { error: 'method_not_allowed', error_description: 'Use POST for MCP Streamable HTTP.' },
    { status: 405, headers: { Allow: 'POST, OPTIONS' } }
  );
}

export async function DELETE() {
  return corsJson(
    { error: 'method_not_allowed', error_description: 'This server does not use MCP sessions.' },
    { status: 405, headers: { Allow: 'POST, OPTIONS' } }
  );
}

export async function POST(request: NextRequest) {
  if (!isAllowedMcpOrigin(request.headers.get('origin'), getBaseUrl())) {
    return corsJson(jsonRpcError(null, JSON_RPC_INVALID_REQUEST, 'Origin is not allowed'), {
      status: 403,
    });
  }

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
    return corsJson(jsonRpcError(null, JSON_RPC_PARSE_ERROR, 'Parse error'), { status: 400 });
  }

  const ctx = {
    userId: auth.userId,
    clerkId: auth.clerkId,
    scopes: auth.scopes,
    clientLabel: auth.clientLabel,
  };

  const http = {
    protocolHeader: request.headers.get('mcp-protocol-version'),
    mcpMethodHeader: request.headers.get('mcp-method'),
    mcpNameHeader: request.headers.get('mcp-name'),
  };

  try {
    const result = await dispatchMcpBody(body, http, ctx, aiConnectorHandlers);
    if (result.status === 202 || result.payload == null) {
      const empty = corsEmpty(202);
      empty.headers.set('MCP-Protocol-Version', result.protocolVersion);
      empty.headers.set('Cache-Control', 'no-store');
      return empty;
    }

    if (result.status === 200 && prefersEventStream(request.headers.get('accept'))) {
      return mcpSse(result.payload, result.protocolVersion);
    }

    return mcpJson(result.payload, result.status, result.protocolVersion);
  } catch (error) {
    mcpLogger.error('MCP request failed', error, { userId: auth.userId });
    return mcpJson(
      jsonRpcError(null, JSON_RPC_INTERNAL_ERROR, 'Internal error'),
      500,
      request.headers.get('mcp-protocol-version') || '2025-03-26'
    );
  }
}
