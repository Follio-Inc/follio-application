import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';

import { parseFlexibleDate, requireFlexibleDate } from '@/lib/ai-connector/dates';
import {
  addOperation,
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
import type { McpAuthContext, McpToolHandlers } from '@/lib/mcp/server';
import { MCP_TOOLS } from '@/lib/mcp/tools';

import { createTestMcp } from './utils/mcp-client';

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

  it('replaces an earlier summary proposal instead of adding a second one', () => {
    const operations = addOperation(
      [operationFromSummary({ summary: 'Long version' }), operationFromProject({ title: 'A' })],
      operationFromSummary({ summary: 'Short version' })
    );
    expect(operations).toEqual([
      { type: 'update_summary', summary: 'Short version' },
      { type: 'add_project', title: 'A' },
    ]);
  });

  it('keeps an earlier headline when only the summary is revised', () => {
    const operations = addOperation(
      [operationFromSummary({ headline: 'HR Ops', summary: 'Long version' })],
      operationFromSummary({ summary: 'Short version' })
    );
    expect(operations).toEqual([
      { type: 'update_summary', headline: 'HR Ops', summary: 'Short version' },
    ]);
  });

  it('merges a draft that already holds two summary updates into one', () => {
    const operations = addOperation(
      [operationFromSummary({ summary: 'One' }), operationFromSummary({ summary: 'Two' })],
      operationFromSummary({ headline: 'New headline' })
    );
    expect(operations).toEqual([
      { type: 'update_summary', summary: 'Two', headline: 'New headline' },
    ]);
  });

  it('still adds up roles and projects', () => {
    const first = addOperation([], operationFromProject({ title: 'A' }));
    expect(addOperation(first, operationFromProject({ title: 'B' }))).toHaveLength(2);
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
    clerkId: 'clerk_1',
    scopes: ['follio.read', 'follio.draft', 'follio.apply'],
    clientLabel: 'Claude',
  };

  const handlers: McpToolHandlers = {
    listResumes: async () => ({ resumes: [{ resumeId: 'p1', title: 'Product PM' }] }),
    getResume: async () => ({ handle: 'alex' }),
    createResume: async () => ({ resumeId: 'p2', title: 'New' }),
    cloneResume: async () => ({ resumeId: 'p3', title: 'Stripe PM' }),
    openInBuilder: async () => ({ builderUrl: 'https://follio.app/builder' }),
    renameResume: async (_ctx, input) => ({ renamed: true, input }),
    deleteResumes: async (_ctx, input) => ({ deleted: [], input }),
    listDrafts: async () => [],
    proposeSummary: async () => ({ draftId: 'd1' }),
    proposeExperience: async () => ({ draftId: 'd1' }),
    proposeProject: async () => ({ draftId: 'd1' }),
    applyDraft: async () => ({ status: 'APPLIED' }),
    discardDraft: async () => ({ status: 'DISCARDED' }),
    getResumeLines: async () => ({ headline: { ref: 'H', text: 'Designer' } }),
    suggestResumeEdits: async (_ctx, input) => ({ saved: true, input }),
    applyResumeEdits: async () => ({ message: 'Applied 1 change' }),
    undoResumeEdits: async () => ({ message: 'Undid 1 change' }),
    listResumeEdits: async () => ({ sessions: [] }),
  };

  // Through the real SDK handler, as /api/mcp serves it after the token check.
  const { callTool } = createTestMcp(handlers, ctx);

  it('lists the Follio tools', () => {
    expect(MCP_TOOLS.map((tool) => tool.name)).toEqual([
      'list_resumes',
      'get_resume',
      'create_resume',
      'clone_resume',
      'open_in_builder',
      'rename_resume',
      'delete_resumes',
      'list_drafts',
      'propose_summary',
      'propose_experience',
      'propose_project',
      'apply_draft',
      'discard_draft',
      'get_resume_lines',
      'suggest_resume_edits',
      'apply_resume_edits',
      'undo_resume_edits',
      'list_resume_edits',
    ]);
  });

  it('requires resumeId on every tool except list, create, and delete', () => {
    for (const tool of MCP_TOOLS) {
      // delete_resumes takes a list of resumes, each with its own resumeId.
      if (['list_resumes', 'create_resume', 'delete_resumes'].includes(tool.name)) continue;
      expect(tool.inputSchema.required).toEqual(expect.arrayContaining(['resumeId']));
    }
  });

  it('passes valid line edits through to the handler', async () => {
    const result = await callTool('suggest_resume_edits', {
      resumeId: 'p1',
      request: 'Tighten my bullets',
      changes: [{ ref: 'E1.2', text: 'Cut deploy time 40% with CI caching' }],
    });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('E1.2');
  });

  it('rejects line edits that do not point at a resume line', async () => {
    const result = await callTool('suggest_resume_edits', {
      resumeId: 'p1',
      request: 'Tighten my bullets',
      changes: [{ ref: 'experience 1', text: 'Something' }],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('get_resume_lines');
  });

  it('needs the apply permission to write or undo line edits', async () => {
    const limited = { ...ctx, scopes: ['follio.read', 'follio.draft'] };
    for (const name of ['apply_resume_edits', 'undo_resume_edits']) {
      const result = await callTool(name, { resumeId: 'p1', sessionId: 's1' }, limited);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('follio.apply');
    }
  });

  // initialize and notifications are covered in mcp-protocol.test.ts.

  it('creates a blank resume without resumeId', async () => {
    const result = await callTool('create_resume', { title: 'Stripe PM' });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('p2');
  });

  it('refuses to clone without a source resumeId', async () => {
    const result = await callTool('clone_resume', { title: 'Copy' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('list_resumes');
  });

  it('opens a resume in the builder and returns the link', async () => {
    const result = await callTool('open_in_builder', { resumeId: 'p1' });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('/builder');
  });

  it('refuses to open in the builder without a resumeId', async () => {
    const result = await callTool('open_in_builder', {});
    expect(result.isError).toBe(true);
  });

  it('renames a resume when given resumeId and a title', async () => {
    const result = await callTool('rename_resume', { resumeId: 'p1', title: 'Stripe PM' });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Stripe PM');
  });

  it('refuses to rename without a new title', async () => {
    const result = await callTool('rename_resume', { resumeId: 'p1' });
    expect(result.isError).toBe(true);
  });

  it('needs the apply permission to rename a resume', async () => {
    const limited = { ...ctx, scopes: ['follio.read', 'follio.draft'] };
    const result = await callTool('rename_resume', { resumeId: 'p1', title: 'New' }, limited);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('follio.apply');
  });

  it('needs the apply permission to delete resumes', async () => {
    const limited = { ...ctx, scopes: ['follio.read', 'follio.draft'] };
    const result = await callTool(
      'delete_resumes',
      { resumes: [{ resumeId: 'p1', confirmTitle: 'Product PM' }] },
      limited
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('follio.apply');
  });

  it('refuses to delete a resume without its title', async () => {
    const result = await callTool('delete_resumes', { resumes: [{ resumeId: 'p1' }] });
    expect(result.isError).toBe(true);
  });

  it('marks delete_resumes as destructive', () => {
    const tool = MCP_TOOLS.find((t) => t.name === 'delete_resumes');
    expect(tool?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(tool?.requiredScope).toBe('follio.apply');
  });

  it('refuses get_resume without a resumeId', async () => {
    const result = await callTool('get_resume', {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('list_resumes');
  });

  it('calls get_resume', async () => {
    const result = await callTool('get_resume', { resumeId: 'p1' });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('alex');
  });

  it('blocks apply_draft without the apply scope', async () => {
    const result = await callTool(
      'apply_draft',
      { resumeId: 'p1', draftId: 'd1' },
      { ...ctx, scopes: ['follio.read', 'follio.draft'] }
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('follio.apply');
  });

  it('validates propose_experience arguments', async () => {
    const result = await callTool('propose_experience', { resumeId: 'p1', company: 'Acme' });
    expect(result.isError).toBe(true);
  });

  it('turns a handler error into a tool error', async () => {
    const failing = createTestMcp(
      {
        ...handlers,
        getResume: async () => {
          throw new Error('Resume not found');
        },
      },
      ctx
    );
    const result = await failing.callTool('get_resume', { resumeId: 'p1' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Resume not found');
  });
});
