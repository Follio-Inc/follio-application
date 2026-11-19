import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authenticateConnectorToken = vi.fn();

vi.mock('@/services/ai-connector.service', () => ({
  authenticateConnectorToken: (token: string) => authenticateConnectorToken(token),
  aiConnectorHandlers: {
    listResumes: async () => ({ resumes: [{ resumeId: 'p1', title: 'Product PM' }] }),
  },
}));

const { POST, GET } = await import('@/app/api/mcp/route');

function mcpRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/api/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const listResumes = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name: 'list_resumes', arguments: {} },
};

/** The JSON-RPC message from a JSON or one-event SSE reply. */
async function replyBody(response: Response) {
  const text = await response.text();
  const data = text.split('\n').find((line) => line.startsWith('data: '));
  return JSON.parse(data ? data.slice('data: '.length) : text);
}

describe('POST /api/mcp', () => {
  beforeEach(() => {
    authenticateConnectorToken.mockReset();
  });

  it('asks for OAuth when there is no token', async () => {
    const response = await POST(mcpRequest(listResumes));
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('resource_metadata=');
    expect(authenticateConnectorToken).not.toHaveBeenCalled();
  });

  it('asks to reconnect when the token is invalid or expired', async () => {
    authenticateConnectorToken.mockResolvedValue(null);
    const response = await POST(mcpRequest(listResumes, { authorization: 'Bearer flio_bad' }));
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('Reconnect Follio');
  });

  it('refuses a browser origin that is not Follio or localhost', async () => {
    const response = await POST(
      mcpRequest(listResumes, { authorization: 'Bearer flio_ok', origin: 'https://evil.example' })
    );
    expect(response.status).toBe(403);
  });

  it("serves the caller's tools through the SDK, with CORS and no-cache headers", async () => {
    authenticateConnectorToken.mockResolvedValue({
      userId: 'user_1',
      clerkId: 'clerk_1',
      scopes: ['follio.read'],
      clientLabel: 'Claude',
    });
    const response = await POST(mcpRequest(listResumes, { authorization: 'Bearer flio_ok' }));

    expect(authenticateConnectorToken).toHaveBeenCalledWith('flio_ok');
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await replyBody(response);
    expect(body.result.content[0].text).toContain('Product PM');
  });
});

describe('GET /api/mcp', () => {
  it('says to use POST', async () => {
    const response = await GET();
    expect(response.status).toBe(405);
  });
});
