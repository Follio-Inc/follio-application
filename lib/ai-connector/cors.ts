import { NextResponse } from 'next/server';

import { absoluteUrl } from '@/lib/utils';

import { MCP_PATH } from './constants';

export const MCP_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, MCP-Session-Id, MCP-Protocol-Version',
  'Access-Control-Max-Age': '86400',
};

export function corsJson(body: unknown, init?: { status?: number; headers?: HeadersInit }) {
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(MCP_CORS_HEADERS)) {
    headers.set(key, value);
  }
  headers.set('Content-Type', 'application/json');
  return NextResponse.json(body, { status: init?.status ?? 200, headers });
}

export function corsEmpty(status = 204) {
  return new NextResponse(null, { status, headers: MCP_CORS_HEADERS });
}

export function unauthorizedMcpResponse(message = 'Authentication required') {
  const resourceMetadata = absoluteUrl('/.well-known/oauth-protected-resource');
  const headers = new Headers(MCP_CORS_HEADERS);
  headers.set(
    'WWW-Authenticate',
    `Bearer realm="mcp", resource_metadata="${resourceMetadata}", error="invalid_token", error_description="${message}"`
  );
  return corsJson({ error: 'unauthorized', error_description: message }, { status: 401, headers });
}

export function mcpResourceUrl(): string {
  return absoluteUrl(MCP_PATH);
}
