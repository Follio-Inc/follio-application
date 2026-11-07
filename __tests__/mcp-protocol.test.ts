import { describe, expect, it } from 'vitest';

import { claudeCustomConnectorUrl } from '@/lib/ai-connector/connect-links';
import { isMcpResource } from '@/lib/ai-connector/oauth-metadata';
import { isAllowedMcpOrigin, prefersEventStream } from '@/lib/mcp/origin';
import {
  dispatchMcpBody,
  dispatchMcpMessage,
  handleMcpMessage,
  type McpAuthContext,
  type McpToolHandlers,
} from '@/lib/mcp/protocol';
import { MCP_TOOLS } from '@/lib/mcp/tools';
import {
  decodeMcpHeaderValue,
  JSON_RPC_HEADER_MISMATCH,
  JSON_RPC_UNSUPPORTED_PROTOCOL,
  negotiateLegacyVersion,
} from '@/lib/mcp/versions';
import { absoluteUrl } from '@/lib/utils';

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

const MODERN_META = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1' },
  'io.modelcontextprotocol/clientCapabilities': {},
};

describe('protocol versions', () => {
  it('echoes a handshake revision the server speaks', () => {
    expect(negotiateLegacyVersion('2025-06-18')).toBe('2025-06-18');
  });

  it('answers an unknown handshake revision with the newest one it speaks', () => {
    expect(negotiateLegacyVersion('2099-01-01')).toBe('2025-11-25');
  });

  it('does not claim to speak a future revision during initialize', async () => {
    const response = await handleMcpMessage(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2099-01-01' },
      },
      ctx,
      handlers
    );
    expect(response).toMatchObject({
      result: { protocolVersion: '2025-11-25', serverInfo: { name: 'follio' } },
    });
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

describe('modern MCP', () => {
  it('answers server/discover with the revisions it speaks', async () => {
    const result = await dispatchMcpMessage(
      {
        jsonrpc: '2.0',
        id: 'discover-1',
        method: 'server/discover',
        params: { _meta: MODERN_META },
      },
      { protocolHeader: '2026-07-28', mcpMethodHeader: 'server/discover' },
      ctx,
      handlers
    );

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      result: {
        resultType: 'complete',
        supportedVersions: ['2026-07-28'],
        cacheScope: 'public',
        _meta: {
          'io.modelcontextprotocol/serverInfo': { name: 'follio', version: '1.3.0' },
        },
      },
    });
  });

  it('calls a tool when the headers match the body', async () => {
    const result = await dispatchMcpMessage(
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'get_resume', arguments: { resumeId: 'p1' }, _meta: MODERN_META },
      },
      {
        protocolHeader: '2026-07-28',
        mcpMethodHeader: 'tools/call',
        mcpNameHeader: 'get_resume',
      },
      ctx,
      handlers
    );

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      result: { resultType: 'complete' },
    });
    const payload = result.body as { result: { content: Array<{ text: string }> } };
    expect(payload.result.content[0].text).toContain('alex');
  });

  it('accepts a base64 Mcp-Name header', async () => {
    const encoded = `=?base64?${Buffer.from('get_resume').toString('base64')}?=`;
    const result = await dispatchMcpMessage(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'get_resume', arguments: { resumeId: 'p1' }, _meta: MODERN_META },
      },
      {
        protocolHeader: '2026-07-28',
        mcpMethodHeader: 'tools/call',
        mcpNameHeader: encoded,
      },
      ctx,
      handlers
    );
    expect(result.status).toBe(200);
  });

  it('rejects a header that does not match the body', async () => {
    const result = await dispatchMcpMessage(
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'get_resume', arguments: { resumeId: 'p1' }, _meta: MODERN_META },
      },
      {
        protocolHeader: '2026-07-28',
        mcpMethodHeader: 'tools/call',
        mcpNameHeader: 'apply_draft',
      },
      ctx,
      handlers
    );
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      error: { code: JSON_RPC_HEADER_MISMATCH },
    });
  });

  it('rejects a protocol revision it does not speak', async () => {
    const result = await dispatchMcpBody(
      { jsonrpc: '2.0', id: 5, method: 'tools/list' },
      { protocolHeader: '1900-01-01' },
      ctx,
      handlers
    );
    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({
      error: {
        code: JSON_RPC_UNSUPPORTED_PROTOCOL,
        data: { supported: ['2026-07-28'], requested: '1900-01-01' },
      },
    });
  });

  it('rejects JSON-RPC batches on the modern revision', async () => {
    const result = await dispatchMcpBody(
      [{ jsonrpc: '2.0', id: 1, method: 'ping' }],
      { protocolHeader: '2026-07-28' },
      ctx,
      handlers
    );
    expect(result.status).toBe(400);
  });
});

describe('transport guards', () => {
  it('allows missing, same-app, and localhost origins', () => {
    expect(isAllowedMcpOrigin(null, 'https://follio.app')).toBe(true);
    expect(isAllowedMcpOrigin('https://follio.app', 'https://follio.app')).toBe(true);
    expect(isAllowedMcpOrigin('http://localhost:3000', 'https://follio.app')).toBe(true);
    expect(isAllowedMcpOrigin('https://evil.example', 'https://follio.app')).toBe(false);
  });

  it('uses SSE only when the client refuses JSON', () => {
    expect(prefersEventStream(null)).toBe(false);
    expect(prefersEventStream('application/json, text/event-stream')).toBe(false);
    expect(prefersEventStream('text/event-stream')).toBe(true);
  });

  it('decodes a base64 header sentinel', () => {
    const encoded = `=?base64?${Buffer.from('get_resume').toString('base64')}?=`;
    expect(decodeMcpHeaderValue(encoded)).toBe('get_resume');
    expect(decodeMcpHeaderValue('get_resume')).toBe('get_resume');
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
    expect(isMcpResource('https://evil.example/api/mcp')).toBe(false);
  });
});
