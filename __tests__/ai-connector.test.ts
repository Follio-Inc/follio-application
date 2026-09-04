import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';

import { parseFlexibleDate, requireFlexibleDate } from '@/lib/ai-connector/dates';
import {
  describeOperation,
  operationFromExperience,
  operationFromProject,
  operationFromSummary,
  parseOperations,
  ProposeExperienceSchema,
  ProposeSummarySchema,
  summarizeOperations,
} from '@/lib/ai-connector/operations';
import { isAllowedRedirectUri, redirectUriMatches } from '@/lib/ai-connector/oauth-register';
import { toConnectorProfileView } from '@/lib/ai-connector/profile-view';
import { verifyPkceS256 } from '@/lib/ai-connector/pkce';
import { hasScope, parseScopeString } from '@/lib/ai-connector/scopes';
import { handleMcpMessage } from '@/lib/mcp/protocol';
import { MCP_TOOLS } from '@/lib/mcp/tools';
import type { McpAuthContext, McpToolHandlers } from '@/lib/mcp/protocol';

describe('PKCE S256', () => {
  it('accepts a matching verifier', () => {
    const verifier = 'a'.repeat(43);
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
  });

  it('rejects a mismatched verifier', () => {
    const verifier = 'a'.repeat(43);
    const other = 'b'.repeat(43);
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    expect(verifyPkceS256(other, challenge)).toBe(false);
  });
});

describe('scopes', () => {
  it('defaults to all Follio scopes', () => {
    expect(parseScopeString('')).toEqual(['follio.read', 'follio.draft', 'follio.apply']);
  });

  it('filters unknown scopes', () => {
    expect(parseScopeString('follio.read email')).toEqual(['follio.read']);
  });

  it('checks granted scopes', () => {
    expect(hasScope(['follio.read'], 'follio.read')).toBe(true);
    expect(hasScope(['follio.read'], 'follio.apply')).toBe(false);
  });
});

describe('flexible dates', () => {
  it('parses YYYY-MM as the first of the month', () => {
    expect(parseFlexibleDate('2024-03')?.toISOString()).toBe('2024-03-01T00:00:00.000Z');
  });

  it('parses YYYY-MM-DD', () => {
    expect(parseFlexibleDate('2024-03-15')?.toISOString().startsWith('2024-03-15')).toBe(true);
  });

  it('throws for invalid required dates', () => {
    expect(() => requireFlexibleDate('not-a-date', 'startDate')).toThrow(/startDate/);
  });
});

describe('draft operations', () => {
  it('describes a proposed experience', () => {
    const operation = operationFromExperience({
      company: 'Acme',
      role: 'Engineer',
      startDate: '2024-01',
    });
    expect(describeOperation(operation)).toBe('Add role: Engineer at Acme');
  });

  it('summarizes multiple operations', () => {
    const summary = summarizeOperations([
      operationFromSummary({ headline: 'Product designer' }),
      operationFromProject({ title: 'Follio' }),
    ]);
    expect(summary).toContain('Update headline');
    expect(summary).toContain('Add project: Follio');
  });

  it('rejects an empty summary proposal', () => {
    expect(ProposeSummarySchema.safeParse({}).success).toBe(false);
  });

  it('requires company, role, and start date', () => {
    expect(ProposeExperienceSchema.safeParse({ company: 'Acme' }).success).toBe(false);
  });

  it('parses stored operations and ignores junk', () => {
    expect(parseOperations([{ type: 'add_project', title: 'A' }, { type: 'nope' }])).toEqual([
      { type: 'add_project', title: 'A' },
    ]);
  });
});

describe('profile view', () => {
  it('hides invisible entries and dedupes skills', () => {
    const view = toConnectorProfileView({
      handle: 'alex',
      resumeTitle: 'Resume',
      firstName: 'Alex',
      lastName: 'Rivera',
      headline: 'Designer',
      summary: 'Builds products',
      location: 'NYC',
      contactInfo: { email: 'alex@example.com', phone: null, website: null },
      workExperiences: [
        {
          id: '1',
          company: 'Acme',
          role: 'PM',
          location: null,
          startDate: new Date('2020-01-01T00:00:00.000Z'),
          endDate: null,
          isCurrent: true,
          bullets: ['Shipped v1'],
          isVisible: true,
        },
        {
          id: '2',
          company: 'Hidden Co',
          role: 'Intern',
          location: null,
          startDate: new Date('2018-01-01T00:00:00.000Z'),
          endDate: null,
          isCurrent: false,
          bullets: [],
          isVisible: false,
        },
      ],
      educations: [],
      skills: [{ id: 's1', name: 'Figma', isVisible: true }],
      skillGroups: [{ name: 'Design', skills: [{ name: 'Figma', isVisible: true }] }],
      projects: [],
    });

    expect(view.name).toBe('Alex Rivera');
    expect(view.experiences).toHaveLength(1);
    expect(view.experiences[0].company).toBe('Acme');
    expect(view.skills).toEqual(['Figma']);
  });
});

describe('oauth redirect URIs', () => {
  it('allows https and localhost http', () => {
    expect(isAllowedRedirectUri('https://claude.ai/callback')).toBe(true);
    expect(isAllowedRedirectUri('http://localhost:8787/callback')).toBe(true);
    expect(isAllowedRedirectUri('http://evil.example/callback')).toBe(false);
  });

  it('requires an exact registered match', () => {
    expect(redirectUriMatches(['https://claude.ai/cb'], 'https://claude.ai/cb')).toBe(true);
    expect(redirectUriMatches(['https://claude.ai/cb'], 'https://claude.ai/cb/extra')).toBe(false);
  });
});

describe('MCP protocol', () => {
  const ctx: McpAuthContext = {
    userId: 'user_1',
    scopes: ['follio.read', 'follio.draft', 'follio.apply'],
    clientLabel: 'Claude',
  };

  const handlers: McpToolHandlers = {
    getProfile: async () => ({ handle: 'alex' }),
    listDrafts: async () => [],
    proposeSummary: async () => ({ draftId: 'd1' }),
    proposeExperience: async () => ({ draftId: 'd1' }),
    proposeProject: async () => ({ draftId: 'd1' }),
    applyDraft: async () => ({ status: 'APPLIED' }),
    discardDraft: async () => ({ status: 'DISCARDED' }),
  };

  it('lists the core Follio tools', () => {
    expect(MCP_TOOLS.map((tool) => tool.name)).toEqual([
      'get_profile',
      'list_drafts',
      'propose_summary',
      'propose_experience',
      'propose_project',
      'apply_draft',
      'discard_draft',
    ]);
  });

  it('handles initialize', async () => {
    const response = await handleMcpMessage(
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } },
      ctx,
      handlers
    );
    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2025-03-26',
        serverInfo: { name: 'follio' },
      },
    });
  });

  it('returns no body for initialized notifications', async () => {
    const response = await handleMcpMessage(
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      ctx,
      handlers
    );
    expect(response).toBeNull();
  });

  it('calls get_profile', async () => {
    const response = await handleMcpMessage(
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'get_profile', arguments: {} },
      },
      ctx,
      handlers
    );
    expect(response && 'result' in response).toBe(true);
    if (response && 'result' in response) {
      const result = response.result as { content: Array<{ text: string }>; isError?: boolean };
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('alex');
    }
  });

  it('blocks apply_draft without the apply scope', async () => {
    const response = await handleMcpMessage(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'apply_draft', arguments: { draftId: 'd1' } },
      },
      { ...ctx, scopes: ['follio.read', 'follio.draft'] },
      handlers
    );
    expect(response && 'result' in response).toBe(true);
    if (response && 'result' in response) {
      const result = response.result as { isError?: boolean; content: Array<{ text: string }> };
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('follio.apply');
    }
  });

  it('validates propose_experience arguments', async () => {
    const response = await handleMcpMessage(
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'propose_experience', arguments: { company: 'Acme' } },
      },
      ctx,
      handlers
    );
    expect(response && 'result' in response).toBe(true);
    if (response && 'result' in response) {
      const result = response.result as { isError?: boolean };
      expect(result.isError).toBe(true);
    }
  });
});
