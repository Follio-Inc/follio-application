import { describe, expect, it } from 'vitest';

import { claudeCustomConnectorUrl } from '@/lib/ai-connector/connect-links';
import { MCP_INSTRUCTIONS } from '@/lib/ai-connector/constants';
import { isMcpResource } from '@/lib/ai-connector/oauth-metadata';
import { isAllowedMcpOrigin } from '@/lib/mcp/origin';
import type { McpAuthContext, McpToolHandlers } from '@/lib/mcp/server';
import { MCP_TOOLS } from '@/lib/mcp/tools';
import { absoluteUrl } from '@/lib/utils';

import { createTestMcp, LEGACY_VERSION, MODERN_META, MODERN_VERSION } from './utils/mcp-client';

const ctx: McpAuthContext = {
  userId: 'user_1',
  clerkId: 'clerk_1',
  scopes: ['follio.read', 'follio.draft', 'follio.apply'],
  clientLabel: 'Claude',
};

const handlers: McpToolHandlers = {
  listResumes: async () => ({ resumes: [{ resumeId: 'p1' }] }),
  getResume: async () => ({ handle: 'alex' }),
  createResume: async () => ({ resumeId: 'p2' }),
  cloneResume: async () => ({ resumeId: 'p3' }),
  listDrafts: async () => [],
  proposeSummary: async () => ({ draftId: 'd1' }),
  proposeExperience: async () => ({ draftId: 'd1' }),
  proposeProject: async () => ({ draftId: 'd1' }),
  applyDraft: async () => ({ status: 'APPLIED' }),
  discardDraft: async () => ({ status: 'DISCARDED' }),
  getResumeLines: async () => ({ headline: { ref: 'H', text: 'Designer' } }),
  suggestResumeEdits: async () => ({ saved: true }),
  applyResumeEdits: async () => ({ message: 'Applied 1 change' }),
  undoResumeEdits: async () => ({ message: 'Undid 1 change' }),
  listResumeEdits: async () => ({ sessions: [] }),
};

const { send } = createTestMcp(handlers, ctx);
const legacy = { 'mcp-protocol-version': LEGACY_VERSION };
const modern = (method: string, name?: string) => ({
  'mcp-protocol-version': MODERN_VERSION,
  'mcp-method': method,
  ...(name ? { 'mcp-name': name } : {}),
});

describe('handshake revisions (2025)', () => {
  it('answers initialize with the Follio server and its instructions', async () => {
    const reply = await send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: LEGACY_VERSION,
        capabilities: {},
        clientInfo: { name: 'test', version: '1' },
      },
    });
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({
      result: {
        protocolVersion: LEGACY_VERSION,
        serverInfo: { name: 'follio' },
        instructions: MCP_INSTRUCTIONS,
      },
    });
  });

  it('does not claim to speak a future revision during initialize', async () => {
    const reply = await send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2099-01-01',
        capabilities: {},
        clientInfo: { name: 't', version: '1' },
      },
    });
    expect(reply.body?.result.protocolVersion).not.toBe('2099-01-01');
  });

  it('lists every tool with the JSON Schema written in tools.ts', async () => {
    const reply = await send({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, { headers: legacy });
    const tools = reply.body?.result.tools as Array<Record<string, unknown>>;
    expect(tools.map((tool) => tool.name)).toEqual(MCP_TOOLS.map((tool) => tool.name));
    for (const tool of MCP_TOOLS) {
      expect(tools.find((t) => t.name === tool.name)).toMatchObject({
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      });
    }
  });

  it('acknowledges notifications with an empty 202', async () => {
    const reply = await send(
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { headers: legacy }
    );
    expect(reply.status).toBe(202);
    expect(reply.body).toBeNull();
  });

  it('answers an unknown tool with a JSON-RPC error', async () => {
    const reply = await send(
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'nope', arguments: {} } },
      { headers: legacy }
    );
    expect(reply.body?.error).toBeDefined();
  });
});

describe('2026-07-28 revision', () => {
  it('answers server/discover with the revision and instructions', async () => {
    const reply = await send(
      {
        jsonrpc: '2.0',
        id: 'discover-1',
        method: 'server/discover',
        params: { _meta: MODERN_META },
      },
      { headers: modern('server/discover') }
    );
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({
      result: {
        resultType: 'complete',
        supportedVersions: expect.arrayContaining([MODERN_VERSION]),
        instructions: MCP_INSTRUCTIONS,
        _meta: {
          'io.modelcontextprotocol/serverInfo': { name: 'follio', version: '1.3.0' },
        },
      },
    });
  });

  it('calls a tool when the headers match the body', async () => {
    const reply = await send(
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'get_resume', arguments: { resumeId: 'p1' }, _meta: MODERN_META },
      },
      { headers: modern('tools/call', 'get_resume') }
    );
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ result: { resultType: 'complete' } });
    expect(reply.body?.result.content[0].text).toContain('alex');
  });

  it('accepts a base64 Mcp-Name header', async () => {
    const encoded = `=?base64?${Buffer.from('get_resume').toString('base64')}?=`;
    const reply = await send(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'get_resume', arguments: { resumeId: 'p1' }, _meta: MODERN_META },
      },
      { headers: modern('tools/call', encoded) }
    );
    expect(reply.status).toBe(200);
  });

  it('rejects a header that does not match the body', async () => {
    const reply = await send(
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'get_resume', arguments: { resumeId: 'p1' }, _meta: MODERN_META },
      },
      { headers: modern('tools/call', 'apply_draft') }
    );
    expect(reply.status).toBe(400);
    expect(reply.body).toMatchObject({ error: { code: -32020 } });
  });
});

describe('protocol errors', () => {
  it('rejects a protocol revision it does not speak', async () => {
    const reply = await send(
      { jsonrpc: '2.0', id: 5, method: 'tools/list' },
      { headers: { 'mcp-protocol-version': '1900-01-01' } }
    );
    expect(reply.status).toBe(400);
    expect(reply.body?.error.message).toContain('1900-01-01');
  });
});

describe('tool catalog', () => {
  it('gives every tool a title and a read or write hint', () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.title.length).toBeGreaterThan(0);
      expect(typeof tool.annotations.readOnlyHint).toBe('boolean');
      expect(typeof tool.annotations.destructiveHint).toBe('boolean');
      if (tool.annotations.readOnlyHint) {
        expect(tool.annotations.destructiveHint).toBe(false);
      }
    }
    expect(MCP_TOOLS.find((tool) => tool.name === 'get_resume')?.annotations.readOnlyHint).toBe(
      true
    );
    expect(MCP_TOOLS.find((tool) => tool.name === 'apply_draft')?.annotations.destructiveHint).toBe(
      true
    );
  });
});

describe('transport guards', () => {
  it('allows missing, same-app, and localhost origins', () => {
    expect(isAllowedMcpOrigin(null, 'https://follio.app')).toBe(true);
    expect(isAllowedMcpOrigin('https://follio.app', 'https://follio.app')).toBe(true);
    expect(isAllowedMcpOrigin('http://localhost:3000', 'https://follio.app')).toBe(true);
    expect(isAllowedMcpOrigin('https://evil.example', 'https://follio.app')).toBe(false);
  });
});

describe('connector links and resource', () => {
  it('builds a Claude add-connector link', () => {
    const url = new URL(claudeCustomConnectorUrl('https://follio.app/api/mcp'));
    expect(url.origin).toBe('https://claude.ai');
    expect(url.searchParams.get('modal')).toBe('add-custom-connector');
    expect(url.searchParams.get('connectorName')).toBe('Follio');
    expect(url.searchParams.get('connectorUrl')).toBe('https://follio.app/api/mcp');
  });

  it('accepts the Follio MCP resource and rejects a different one', () => {
    expect(isMcpResource(undefined)).toBe(true);
    expect(isMcpResource(absoluteUrl('/api/mcp'))).toBe(true);
    expect(isMcpResource(`${absoluteUrl('/api/mcp')}/`)).toBe(true);
    expect(isMcpResource('https://www.follio.me/api/mcp')).toBe(true);
    expect(isMcpResource('https://follio.me/api/mcp')).toBe(true);
    expect(isMcpResource('https://evil.example/api/mcp')).toBe(false);
    expect(isMcpResource('https://www.follio.me/api/other')).toBe(false);
  });
});
