import { NextRequest } from 'next/server';

import {
  corsEmpty,
  corsJson,
  MCP_CORS_HEADERS,
  unauthorizedMcpResponse,
} from '@/lib/ai-connector/cors';
import { extractBearerToken } from '@/lib/ai-connector/bearer';
import { publicOriginFromHeaders } from '@/lib/ai-connector/public-origin';
import { isAllowedMcpOrigin } from '@/lib/mcp/origin';
import { createFollioMcpHandler, toAuthInfo } from '@/lib/mcp/server';
import { aiConnectorHandlers, authenticateConnectorToken } from '@/services/ai-connector.service';
import { logger } from '@/lib/logger';
import { getBaseUrl } from '@/lib/utils';

const mcpLogger = logger.child({ source: 'mcp' });

export const dynamic = 'force-dynamic';

/**
 * The MCP protocol itself (both the 2026-07-28 revision and the earlier handshake ones) is
 * served by the official SDK. This route only checks who is calling first.
 */
const mcpHandler = createFollioMcpHandler(aiConnectorHandlers, (error) =>
  mcpLogger.error('MCP request failed', error)
);

/** Adds the CORS and no-cache headers this endpoint has always sent. */
function withMcpHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(MCP_CORS_HEADERS)) {
    headers.set(key, value);
  }
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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
    return corsJson(
      { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Origin is not allowed' } },
      { status: 403 }
    );
  }

  const origin = publicOriginFromHeaders(request.headers);
  const token = extractBearerToken(request);
  if (!token) {
    return unauthorizedMcpResponse('Connect Follio with OAuth, then retry.', origin);
  }

  const auth = await authenticateConnectorToken(token);
  if (!auth) {
    return unauthorizedMcpResponse(
      'This Follio connection is invalid or expired. Reconnect Follio.',
      origin
    );
  }

  const authInfo = toAuthInfo(token, {
    userId: auth.userId,
    clerkId: auth.clerkId,
    scopes: auth.scopes,
    clientLabel: auth.clientLabel,
  });

  try {
    return withMcpHeaders(await mcpHandler.fetch(request, { authInfo }));
  } catch (error) {
    mcpLogger.error('MCP request failed', error, { userId: auth.userId });
    return corsJson(
      { jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal error' } },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
