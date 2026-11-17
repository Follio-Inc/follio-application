/**
 * Suggest Improvements — the propose request, the session lookup, and the
 * messaging around a proposal's outcome.
 *
 * Scope note: the repo's Vitest environment is `node` with no jsdom and no
 * React Testing Library. These tests exercise pure helpers, static rendering,
 * a mocked `fetch`, and a few source-level structural checks. They do **not**
 * drive clicks, hook effects, or async React state. What that leaves uncovered
 * is listed in the Part 6C report.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentReport } from '@/app/(dashboard)/builder/components/ai-edit/agent-report';
import { AiEditComposer } from '@/app/(dashboard)/builder/components/ai-edit/ai-edit-composer';
import {
  canAnalyze,
  findProposedSession,
  proposalMayExist,
  type ProposalOutcome,
} from '@/app/(dashboard)/builder/components/ai-edit/use-resume-agent';
import { runResumeAgentRequest, type ResumeAgentAnalysis } from '@/lib/resume-agent/client';
import { RESUME_EDIT_LIMITS, type ResumeEditSessionView } from '@/lib/resume-edit/types';

const RESUME_ID = 'p1';
const OTHER_RESUME_ID = 'p2';
const JOB_DESCRIPTION = 'x'.repeat(RESUME_EDIT_LIMITS.jobMinChars + 20);

const AI_EDIT_DIR = join(process.cwd(), 'app', '(dashboard)', 'builder', 'components', 'ai-edit');

function source(file: string): string {
  return readFileSync(join(AI_EDIT_DIR, file), 'utf8');
}

function session(overrides: Partial<ResumeEditSessionView> = {}): ResumeEditSessionView {
  return {
    id: 'session-1',
    profileId: RESUME_ID,
    brief: {
      jobDescription: JOB_DESCRIPTION,
      instructions: 'Tailor my summary',
      presets: [],
      scope: { kind: 'all' },
      via: 'Follio Resume Agent',
    },
    changes: [],
    droppedCount: 0,
    failedSections: [],
    createdAt: '2026-11-16T00:00:00.000Z',
    ...overrides,
  };
}

function analysis(overrides: Partial<ResumeAgentAnalysis> = {}): ResumeAgentAnalysis {
  return {
    resumeId: RESUME_ID,
    summary: 'Python is well evidenced; Kubernetes is not on the resume.',
    strengths: [],
    missingRequirements: [],
    recommendations: [
      { requirement: 'Kubernetes', suggestion: 'Only add it if you have actually used it.' },
    ],
    scores: { requirementMatch: 66, keywordCoverage: 50, writing: 70 },
    limitations: [],
    proposedSessionId: null,
    proposedChanges: [],
    proposalMessage: null,
    ...overrides,
  };
}

function report(proposal: ProposalOutcome | null, value = analysis()): string {
  return renderToStaticMarkup(<AgentReport analysis={value} proposal={proposal} />);
}

// ---------------------------------------------------------------------------

describe('propose-mode request', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        mode: 'propose',
        analysis: analysis({ proposedSessionId: 'session-1' }),
        run: {
          id: 'run-1',
          agentId: 'resume-agent',
          version: 'resume-agent-v1-propose',
          status: 'succeeded',
          steps: 12,
          tokensUsed: { input: 10, output: 5 },
          startedAt: '2026-11-16T00:00:00.000Z',
          finishedAt: '2026-11-16T00:00:12.000Z',
        },
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends mode propose with the posting and instruction, and nothing else', async () => {
    await runResumeAgentRequest(RESUME_ID, {
      jobDescription: JOB_DESCRIPTION,
      instruction: 'Tailor my summary',
      mode: 'propose',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/resumes/p1/agent');
    expect(JSON.parse(String(init.body))).toEqual({
      jobDescription: JOB_DESCRIPTION,
      mode: 'propose',
      instruction: 'Tailor my summary',
    });
  });

  it('returns the real session id the server saved', async () => {
    const result = await runResumeAgentRequest(RESUME_ID, {
      jobDescription: JOB_DESCRIPTION,
      mode: 'propose',
    });

    expect(result.analysis.proposedSessionId).toBe('session-1');
  });
});

describe('findProposedSession', () => {
  it('picks the exact id, not the newest', () => {
    const newest = session({ id: 'session-9', createdAt: '2026-12-01T00:00:00.000Z' });
    const wanted = session({ id: 'session-1' });

    expect(findProposedSession([newest, wanted], 'session-1', RESUME_ID)).toBe(wanted);
  });

  it('refuses a session that belongs to another resume', () => {
    const foreign = session({ id: 'session-1', profileId: OTHER_RESUME_ID });

    expect(findProposedSession([foreign], 'session-1', RESUME_ID)).toBeNull();
  });

  it('refuses the right session once the user has switched resumes', () => {
    // Same row, but the builder has moved on: opening it now would show
    // suggestions for a document that is no longer on screen.
    expect(findProposedSession([session()], 'session-1', OTHER_RESUME_ID)).toBeNull();
  });

  it('returns null when the list does not carry the session', () => {
    // GET /api/resume-edits returns only the five newest.
    const others = ['a', 'b', 'c', 'd', 'e'].map((id) => session({ id }));

    expect(findProposedSession(others, 'session-1', RESUME_ID)).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(findProposedSession([], 'session-1', RESUME_ID)).toBeNull();
  });
});

describe('proposalMayExist', () => {
  it('is false for analyze, which cannot save anything', () => {
    expect(proposalMayExist('analyze', 'cancelled')).toBe(false);
    expect(proposalMayExist('analyze', 504)).toBe(false);
    expect(proposalMayExist('analyze', null)).toBe(false);
  });

  it('is true for a cancelled propose: aborting the fetch does not stop the server', () => {
    expect(proposalMayExist('propose', 'cancelled')).toBe(true);
  });

  it.each([400, 401, 404, 429, 503])('is false for %i, refused before the agent ran', (status) => {
    expect(proposalMayExist('propose', status)).toBe(false);
  });

  it.each([502, 504])('is true for %i, where the agent had already started', (status) => {
    expect(proposalMayExist('propose', status)).toBe(true);
  });

  it('is true for a network failure, which may still have been delivered', () => {
    expect(proposalMayExist('propose', null)).toBe(true);
  });
});

describe('both agent actions share one gate', () => {
  it('allows both when the posting is valid and nothing is running', () => {
    expect(canAnalyze(JOB_DESCRIPTION, false)).toBe(true);
  });

  it('blocks both while either mode is running', () => {
    expect(canAnalyze(JOB_DESCRIPTION, true)).toBe(false);
  });

  it('blocks both for a posting below the minimum', () => {
    expect(canAnalyze('x'.repeat(RESUME_EDIT_LIMITS.jobMinChars - 1), false)).toBe(false);
  });

  it('blocks both for a posting above the maximum', () => {
    expect(canAnalyze('x'.repeat(RESUME_EDIT_LIMITS.jobMaxChars + 1), false)).toBe(false);
  });
});

describe('report messaging by proposal outcome', () => {
  it('says plainly that nothing was saved when grounding dropped everything', () => {
    const markup = report({ kind: 'none', message: 'No suggestions were saved.' });

    expect(markup).toContain('No changes were saved');
    expect(markup).toContain('No suggestions were saved.');
    expect(markup).toContain('Nothing was changed, and no suggestions were saved');
    // The analysis is still there, so the user stays on the composer with
    // something useful rather than an empty review.
    expect(markup).toContain('Kubernetes');
  });

  it('explains why a dropped set was dropped', () => {
    const markup = report({ kind: 'none', message: null });

    expect(markup).toMatch(/does not\s+already show/);
  });

  it('shows a saved set as pending review, never as applied', () => {
    const markup = report({ kind: 'opened', sessionId: 'session-1' });

    expect(markup).toContain('Nothing is applied until you keep it');
    expect(markup).toContain('These are suggestions until you review and keep them');
    expect(markup).not.toMatch(/applied to your resume|updated your resume|changes were made/i);
  });

  it('tells the user where to find a set it could not open', () => {
    const markup = report({
      kind: 'unopened',
      sessionId: 'session-1',
      reason:
        'It was saved, but could not be opened automatically. Find it under Recent requests below.',
    });

    expect(markup).toContain('Suggestions saved, but not opened');
    expect(markup).toContain('Recent requests');
    expect(markup).toContain('Your resume is unchanged');
    // And warns against simply asking again, which would save a second set.
    expect(markup).toContain('Asking again would save a second set');
  });

  it('shows a busy state while the saved set is being fetched', () => {
    const markup = report({ kind: 'opening', sessionId: 'session-1' });

    expect(markup).toContain('Opening them for review');
    expect(markup).toContain('aria-busy="true"');
  });

  it('keeps analyze mode wording unchanged when there is no proposal', () => {
    const markup = report(null);

    expect(markup).toContain('Nothing was changed, and no suggestions were saved');
    expect(markup).not.toContain('Suggestions saved');
  });

  it('never renders the compact proposedChanges payload as review content', () => {
    const markup = report(
      { kind: 'opened', sessionId: 'session-1' },
      analysis({
        proposedSessionId: 'session-1',
        proposedChanges: [
          {
            id: 'S',
            action: 'rewrite',
            where: 'Summary',
            status: 'proposed',
            before: 'Old summary.',
            after: 'A rewritten summary the user never approved.',
            reason: 'Tailored',
          },
        ],
      })
    );

    // The real review UI owns before/after. This compact shape is not a
    // ResumeEditSessionView and is never drawn as one.
    expect(markup).not.toContain('A rewritten summary');
    expect(markup).not.toContain('Old summary');
    expect(markup).not.toContain('<button');
  });

  it('renders no proposal block at all in analyze mode', () => {
    const markup = report(null, analysis({ proposalMessage: 'Saved 1 suggestion.' }));

    expect(markup).not.toContain('Saved 1 suggestion');
  });
});

describe('composer prop contract', () => {
  it('still accepts the original props with no agent wiring', () => {
    // Creating the element does not invoke the component, so no hooks or
    // builder store are needed. This pins the backward-compatible contract.
    const element = <AiEditComposer experiences={[]} onSubmit={() => {}} />;

    expect(element.props.onAnalyze).toBeUndefined();
    expect(element.props.onProposeAgent).toBeUndefined();
    expect(element.props.agentBusyMode).toBeUndefined();
    expect(typeof element.props.onSubmit).toBe('function');
  });

  it('accepts both agent actions and a busy mode', () => {
    const element = (
      <AiEditComposer
        experiences={[]}
        onSubmit={() => {}}
        onAnalyze={() => {}}
        onProposeAgent={() => {}}
        analyzeBusy
        agentBusyMode="propose"
      />
    );

    expect(typeof element.props.onProposeAgent).toBe('function');
    expect(element.props.agentBusyMode).toBe('propose');
  });
});

/**
 * Structural checks. These read source text rather than running anything, so
 * they prove a path does not exist rather than that a click behaves. That is
 * exactly the guarantee wanted here: the agent must have no route to applying
 * an edit, and propose must have exactly one trigger.
 */
describe('no autonomous editing path', () => {
  it('the agent hook never imports apply or revert', () => {
    const text = source('use-resume-agent.ts');

    expect(text).not.toMatch(/applyResumeEdits|revertResumeEdits/);
    // The one edit-session call it makes is the read-only list.
    expect(text).toContain('listResumeEdits');
  });

  it('the agent hook only ever hands a session to the caller, never applies it', () => {
    const text = source('use-resume-agent.ts');

    expect(text).toContain('onProposalSavedRef.current?.(view)');
    expect(text).not.toMatch(/\bkeep\(|\bundo\(/);
  });

  it('propose has exactly one trigger in the panel', () => {
    const panel = source('ai-edit-panel.tsx');
    const triggers = panel.match(/agent\.propose/g) ?? [];

    expect(triggers).toHaveLength(1);
    expect(panel).toContain('onProposeAgent={agent.propose}');
  });

  it('the composer calls propose only from a real button, never on form submit', () => {
    const composer = source('ai-edit-composer.tsx');
    const callIndex = composer.indexOf('onProposeAgent(jobDescription');

    expect(callIndex).toBeGreaterThan(-1);
    // The nearest preceding element declaration is a type="button" control.
    const preceding = composer.slice(0, callIndex);
    expect(preceding.lastIndexOf('type="button"')).toBeGreaterThan(
      preceding.lastIndexOf('type="submit"')
    );
  });

  it('the existing Suggest edits submit button is untouched', () => {
    const composer = source('ai-edit-composer.tsx');

    expect(composer).toContain('<Button type="submit"');
    expect(composer).toContain('Suggest edits');
    // onSubmit still runs through the brief, not through the agent.
    expect(composer).toContain('if (!problem) onSubmit(brief);');
  });
});
