/**
 * Part 7B — the uncertain-proposal warning, and open-vs-closed review wording.
 *
 * Scope note: the repo's Vitest environment is `node` with no jsdom and no
 * React Testing Library. The store below is plain module code and is tested
 * for real, including its storage failure paths. The React wiring that calls
 * it — unmount cleanup, `useSyncExternalStore`, the Dismiss click — is **not**
 * covered here; that needs a browser environment. See the Part 7B report.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentReport } from '@/app/(dashboard)/builder/components/ai-edit/agent-report';
import {
  __resetUncertainProposals,
  clearUncertainProposal,
  hasUncertainProposal,
  markUncertainProposal,
  subscribeUncertainProposals,
} from '@/app/(dashboard)/builder/components/ai-edit/uncertain-proposals';
import type { ProposalOutcome } from '@/app/(dashboard)/builder/components/ai-edit/use-resume-agent';
import type { ResumeAgentAnalysis } from '@/lib/resume-agent/client';

const STORAGE_KEY = 'follio.uncertain-proposals';
const RESUME_A = 'p1';
const RESUME_B = 'p2';

const AI_EDIT_DIR = join(process.cwd(), 'app', '(dashboard)', 'builder', 'components', 'ai-edit');

function source(file: string): string {
  return readFileSync(join(AI_EDIT_DIR, file), 'utf8');
}

/** A working sessionStorage stand-in, with its contents inspectable. */
function workingStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

/** Private browsing, blocked site data, or a full quota. */
function throwingStorage() {
  return {
    getItem: () => {
      throw new Error('SecurityError: storage is disabled');
    },
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: () => {
      throw new Error('SecurityError: storage is disabled');
    },
  };
}

function useStorage(storage: unknown) {
  vi.stubGlobal('window', { sessionStorage: storage });
  __resetUncertainProposals();
}

afterEach(() => {
  __resetUncertainProposals();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------

describe('uncertain-proposal store', () => {
  let storage: ReturnType<typeof workingStorage>;

  beforeEach(() => {
    storage = workingStorage();
    useStorage(storage);
  });

  it('associates the marker with the exact resume that was proposing', () => {
    markUncertainProposal(RESUME_A);

    expect(hasUncertainProposal(RESUME_A)).toBe(true);
  });

  it('never warns on an unrelated resume', () => {
    markUncertainProposal(RESUME_A);

    expect(hasUncertainProposal(RESUME_B)).toBe(false);
    expect(hasUncertainProposal('')).toBe(false);
  });

  it('tracks several resumes independently', () => {
    markUncertainProposal(RESUME_A);
    markUncertainProposal(RESUME_B);
    clearUncertainProposal(RESUME_A);

    expect(hasUncertainProposal(RESUME_A)).toBe(false);
    expect(hasUncertainProposal(RESUME_B)).toBe(true);
  });

  it('survives the boundary the panel remount destroys', () => {
    // The builder mounts the panel as key={profileId}. A remount tears down
    // every listener and all component state; module scope is what is left.
    const unsubscribe = subscribeUncertainProposals(() => {});
    markUncertainProposal(RESUME_A);
    unsubscribe();

    expect(hasUncertainProposal(RESUME_A)).toBe(true);
  });

  it('survives a reload in the same tab through sessionStorage', () => {
    markUncertainProposal(RESUME_A);
    expect(JSON.parse(storage.map.get(STORAGE_KEY) ?? '[]')).toEqual([RESUME_A]);

    // A reload: module memory is gone, storage is not.
    vi.stubGlobal('window', { sessionStorage: storage });
    __resetUncertainProposals();
    storage.map.set(STORAGE_KEY, JSON.stringify([RESUME_A]));

    expect(hasUncertainProposal(RESUME_A)).toBe(true);
    expect(hasUncertainProposal(RESUME_B)).toBe(false);
  });

  it('dismissal removes the marker from memory and from storage', () => {
    markUncertainProposal(RESUME_A);
    clearUncertainProposal(RESUME_A);

    expect(hasUncertainProposal(RESUME_A)).toBe(false);
    expect(JSON.parse(storage.map.get(STORAGE_KEY) ?? '[]')).toEqual([]);
  });

  it('stores resume ids and nothing else', () => {
    markUncertainProposal(RESUME_A);
    const stored = storage.map.get(STORAGE_KEY) ?? '';

    expect(JSON.parse(stored)).toEqual([RESUME_A]);
    // No proposal text, session id, token or user identifier is written.
    expect(stored).not.toMatch(/session|token|clerk|user|email|Bearer/i);
  });

  it('notifies subscribers on mark and on dismiss, and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeUncertainProposals(listener);

    markUncertainProposal(RESUME_A);
    expect(listener).toHaveBeenCalledTimes(1);

    // A repeat mark changes nothing, so it must not churn subscribers.
    markUncertainProposal(RESUME_A);
    expect(listener).toHaveBeenCalledTimes(1);

    clearUncertainProposal(RESUME_A);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    markUncertainProposal(RESUME_B);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('ignores a dismissal for a resume that was never marked', () => {
    const listener = vi.fn();
    subscribeUncertainProposals(listener);

    clearUncertainProposal(RESUME_A);

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('store degrades safely', () => {
  it('still warns when sessionStorage throws on every call', () => {
    useStorage(throwingStorage());

    expect(() => markUncertainProposal(RESUME_A)).not.toThrow();
    expect(hasUncertainProposal(RESUME_A)).toBe(true);
    expect(() => clearUncertainProposal(RESUME_A)).not.toThrow();
    expect(hasUncertainProposal(RESUME_A)).toBe(false);
  });

  it('ignores a corrupt stored value', () => {
    const storage = workingStorage();
    useStorage(storage);
    storage.map.set(STORAGE_KEY, '{not json');

    expect(hasUncertainProposal(RESUME_A)).toBe(false);
    expect(() => markUncertainProposal(RESUME_A)).not.toThrow();
    expect(hasUncertainProposal(RESUME_A)).toBe(true);
  });

  it('ignores stored entries that are not strings', () => {
    const storage = workingStorage();
    useStorage(storage);
    storage.map.set(STORAGE_KEY, JSON.stringify([RESUME_A, 42, null, { id: RESUME_B }]));

    expect(hasUncertainProposal(RESUME_A)).toBe(true);
    expect(hasUncertainProposal(RESUME_B)).toBe(false);
  });

  it('works with no window at all, as during server rendering', () => {
    vi.stubGlobal('window', undefined);
    __resetUncertainProposals();

    expect(hasUncertainProposal(RESUME_A)).toBe(false);
    expect(() => markUncertainProposal(RESUME_A)).not.toThrow();
    expect(hasUncertainProposal(RESUME_A)).toBe(true);
  });
});

// ---------------------------------------------------------------------------

function analysis(overrides: Partial<ResumeAgentAnalysis> = {}): ResumeAgentAnalysis {
  return {
    resumeId: RESUME_A,
    summary: 'Python is well evidenced; Kubernetes is not on the resume.',
    strengths: [],
    missingRequirements: [],
    recommendations: [
      { requirement: 'Kubernetes', suggestion: 'Only add it if you have used it.' },
    ],
    scores: { requirementMatch: 66, keywordCoverage: 50, writing: 70 },
    limitations: [],
    proposedSessionId: null,
    proposedChanges: [],
    proposalMessage: null,
    ...overrides,
  };
}

function report(proposal: ProposalOutcome | null, openSessionId: string | null = null): string {
  return renderToStaticMarkup(
    <AgentReport analysis={analysis()} proposal={proposal} openSessionId={openSessionId} />
  );
}

const SAVED: ProposalOutcome = { kind: 'opened', sessionId: 'session-1' };

describe('open versus closed review messaging', () => {
  it('says the review is open only when this exact session is the one open', () => {
    const markup = report(SAVED, 'session-1');

    expect(markup).toContain('opened for review below');
    expect(markup).not.toContain('Recent requests');
  });

  it('points at Recent requests once the review has been closed', () => {
    // What "Change request" leaves behind: the set exists, nothing is open.
    const markup = report(SAVED, null);

    expect(markup).toContain('Reopen them under Recent requests below');
    expect(markup).not.toContain('opened for review below');
  });

  it('does not claim a review is open when a different session is open', () => {
    const markup = report(SAVED, 'session-other');

    expect(markup).toContain('Reopen them under Recent requests below');
    expect(markup).not.toContain('opened for review below');
  });

  it('never implies the edits were applied, either way', () => {
    for (const open of ['session-1', null]) {
      const markup = report(SAVED, open);
      expect(markup).toContain('Nothing is applied until you keep it');
      expect(markup).not.toMatch(/applied to your resume|updated your resume|changes were made/i);
    }
  });

  it('leaves analyze-mode wording untouched', () => {
    const markup = report(null, 'session-1');

    expect(markup).toContain('Nothing was changed, and no suggestions were saved');
    expect(markup).not.toContain('Suggestions saved');
    expect(markup).toContain('Kubernetes');
  });

  it('leaves the no-proposal outcome untouched', () => {
    const markup = report({ kind: 'none', message: 'No suggestions were saved.' }, null);

    expect(markup).toContain('No changes were saved');
    expect(markup).not.toContain('Recent requests');
  });

  it('leaves the saved-but-unopened outcome untouched', () => {
    const markup = report(
      { kind: 'unopened', sessionId: 'session-1', reason: 'It was saved, but not opened.' },
      null
    );

    expect(markup).toContain('Suggestions saved, but not opened');
    expect(markup).toContain('Asking again would save a second set');
  });
});

/**
 * Structural checks. These read source text, so they prove a path does not
 * exist rather than that a click behaves.
 */
describe('the warning path cannot change a resume', () => {
  it('the store imports nothing and touches no network', () => {
    const text = source('uncertain-proposals.ts');

    expect(text).not.toMatch(/^import /m);
    expect(text).not.toMatch(/fetch\(|applyResumeEdits|revertResumeEdits|runResumeAgentRequest/);
  });

  it('dismissing only clears the marker and re-runs nothing', () => {
    const text = source('use-resume-agent.ts');
    const line = text.split(/\r?\n/).find((l) => l.includes('const dismissWarning'));

    expect(line).toBeDefined();
    expect(line).toContain('clearUncertainProposal(resumeId)');
    expect(line).not.toMatch(/run\(|propose\(|analyze\(/);
  });

  it('the hook still has no apply or revert path', () => {
    const text = source('use-resume-agent.ts');

    expect(text).not.toMatch(/applyResumeEdits|revertResumeEdits/);
    expect(text).toContain('listResumeEdits');
  });

  it('marks only on paths where the server may have kept going', () => {
    const text = source('use-resume-agent.ts');
    const marks = text.match(/markUncertainProposal\(/g) ?? [];

    // Unmount, explicit cancel, and a failure the agent may have survived.
    expect(marks).toHaveLength(3);
    // Each one is gated on proposalMayExist, so analyze never marks.
    expect(text.match(/proposalMayExist\(/g) ?? []).toHaveLength(4);
  });

  it('the warning text says cancelling does not guarantee the server stopped', () => {
    const text = source('use-resume-agent.ts');

    expect(text).toMatch(/may already have been saved/i);
    expect(text).toMatch(/before asking for another/i);
  });
});
