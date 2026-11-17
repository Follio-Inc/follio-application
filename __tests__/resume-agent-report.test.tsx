/**
 * Analyze Fit UI — the report, and the pure decisions behind the action.
 *
 * Scope note: the repo's Vitest environment is `node` with no jsdom and no
 * React Testing Library, so these render components to static HTML and call
 * pure helpers directly. They do **not** exercise clicks, effects, or async
 * React state. The duplicate-submission guard inside `useResumeAgent` is
 * covered only through `canAnalyze`, the pure decision the button reads.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AgentReport } from '@/app/(dashboard)/builder/components/ai-edit/agent-report';
import { AiEditComposer } from '@/app/(dashboard)/builder/components/ai-edit/ai-edit-composer';
import {
  analyzeBlockedReason,
  canAnalyze,
  describeFailure,
} from '@/app/(dashboard)/builder/components/ai-edit/use-resume-agent';
import {
  ResumeAgentNetworkError,
  ResumeAgentRequestError,
  type ResumeAgentAnalysis,
} from '@/lib/resume-agent/client';
import { RESUME_EDIT_LIMITS } from '@/lib/resume-edit/types';

function analysis(overrides: Partial<ResumeAgentAnalysis> = {}): ResumeAgentAnalysis {
  return {
    resumeId: 'p1',
    summary: 'Python and PostgreSQL are well evidenced; Kubernetes is not on the resume.',
    strengths: [
      {
        term: 'Python',
        importance: 'required',
        match: 'exact',
        evidence: 'shown',
        where: ['experience'],
        via: null,
      },
    ],
    missingRequirements: [{ term: 'Kubernetes', kind: 'tool', importance: 'required' }],
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

function html(value: ResumeAgentAnalysis): string {
  return renderToStaticMarkup(<AgentReport analysis={value} />);
}

// ---------------------------------------------------------------------------

describe('AgentReport content', () => {
  it('shows the agent’s summary', () => {
    const markup = html(analysis());

    expect(markup).toContain('How you fit this role');
    expect(markup).toContain('Kubernetes is not on the resume');
  });

  it('shows every recommendation with the requirement it answers', () => {
    const markup = html(
      analysis({
        recommendations: [
          { requirement: 'Kubernetes', suggestion: 'Only add it if you have used it.' },
          { requirement: 'PostgreSQL', suggestion: 'Say which version and scale.' },
          { requirement: 'Python', suggestion: 'Lead the summary with it.' },
        ],
      })
    );

    for (const term of ['Kubernetes', 'PostgreSQL', 'Python']) {
      expect(markup).toContain(term);
    }
    for (const advice of [
      'Only add it if you have used it.',
      'Say which version and scale.',
      'Lead the summary with it.',
    ]) {
      expect(markup).toContain(advice);
    }
    // A real list, not stacked divs.
    expect(markup.match(/<li/g) ?? []).toHaveLength(3);
  });

  it('says so plainly when there are no next steps', () => {
    const markup = html(analysis({ recommendations: [] }));

    expect(markup).toContain('No specific next steps');
    expect(markup).not.toContain('<li');
  });

  it('shows limitations when the run reported any', () => {
    const markup = html(
      analysis({
        limitations: [
          'The posting did not yield specific requirements.',
          'Dropped 1 recommendation naming a requirement this posting does not list.',
        ],
      })
    );

    expect(markup).toContain('What this analysis could not do');
    expect(markup).toContain('did not yield specific requirements');
    expect(markup).toContain('Dropped 1 recommendation');
  });

  it('renders no limitations section when the list is empty', () => {
    const markup = html(analysis({ limitations: [] }));

    expect(markup).not.toContain('What this analysis could not do');
  });

  it('does not repeat the requirement chips JobMatch already shows', () => {
    const markup = html(
      analysis({
        strengths: [
          {
            term: 'Terraform',
            importance: 'required',
            match: 'exact',
            evidence: 'shown',
            where: ['skills'],
            via: null,
          },
        ],
        missingRequirements: [{ term: 'GraphQL', kind: 'tool', importance: 'preferred' }],
        recommendations: [],
      })
    );

    // Neither the strengths nor the gaps are drawn here: the live JobMatch
    // above owns that display, and two copies would drift apart.
    expect(markup).not.toContain('Terraform');
    expect(markup).not.toContain('GraphQL');
    expect(markup).not.toContain('Not on your resume');
  });

  it('never shows proposal language, even if the payload carries proposal fields', () => {
    const markup = html(
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
        proposalMessage: 'Saved 1 suggestion.',
      })
    );

    expect(markup).not.toContain('session-1');
    expect(markup).not.toContain('A rewritten summary');
    expect(markup).not.toContain('Saved 1 suggestion');
    expect(markup).not.toContain('Old summary');
    expect(markup).not.toMatch(/\bproposed\b/i);
    // No control that could act on a proposal, either.
    expect(markup).not.toContain('<button');
    // It says the opposite, plainly.
    expect(markup).toContain('Nothing was changed, and no suggestions were saved');
  });
});

describe('AgentReport markup', () => {
  it('is a labelled section with a real heading', () => {
    const markup = html(analysis());

    expect(markup).toContain('<section');
    expect(markup).toContain('aria-labelledby="agent-report-title"');
    expect(markup).toContain('id="agent-report-title"');
    expect(markup).toMatch(/<h3[^>]*>How you fit this role<\/h3>/);
  });

  it('escapes text rather than rendering it as markup', () => {
    const markup = html(
      analysis({
        summary: '<img src=x onerror="alert(1)">',
        recommendations: [{ requirement: '<b>Rust</b>', suggestion: '5 > 3 && 2 < 4' }],
      })
    );

    // No tag is produced and no handler lands in attribute position: the
    // angle brackets and quotes are entities, so the text is inert.
    expect(markup).not.toContain('<img');
    expect(markup).not.toContain('onerror="');
    expect(markup).not.toContain('<b>Rust</b>');
    expect(markup).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(markup).toContain('&lt;b&gt;Rust&lt;/b&gt;');
    expect(markup).toContain('5 &gt; 3 &amp;&amp; 2 &lt; 4');
  });

  it('hides decorative icons from assistive technology', () => {
    const markup = html(analysis({ limitations: ['Something failed.'] }));

    expect(markup).toContain('aria-hidden="true"');
  });
});

describe('analyzeBlockedReason', () => {
  const ok = 'x'.repeat(RESUME_EDIT_LIMITS.jobMinChars);

  it('asks for a posting when the box is empty', () => {
    expect(analyzeBlockedReason('')).toBe('Paste the job description first.');
    expect(analyzeBlockedReason('    \n  ')).toBe('Paste the job description first.');
  });

  it('blocks a posting below the shared minimum', () => {
    const short = 'x'.repeat(RESUME_EDIT_LIMITS.jobMinChars - 1);

    expect(analyzeBlockedReason(short)).toMatch(
      new RegExp(`at least ${RESUME_EDIT_LIMITS.jobMinChars} characters`)
    );
  });

  it('blocks a posting above the shared maximum', () => {
    const long = 'x'.repeat(RESUME_EDIT_LIMITS.jobMaxChars + 1);

    expect(analyzeBlockedReason(long)).toMatch(/too long/i);
  });

  it('allows a posting exactly at each bound', () => {
    expect(analyzeBlockedReason(ok)).toBeNull();
    expect(analyzeBlockedReason('x'.repeat(RESUME_EDIT_LIMITS.jobMaxChars))).toBeNull();
  });

  it('measures the trimmed text, as the server does', () => {
    expect(analyzeBlockedReason(`   ${ok}   `)).toBeNull();
    expect(
      analyzeBlockedReason(`   ${'x'.repeat(RESUME_EDIT_LIMITS.jobMinChars - 1)}   `)
    ).not.toBeNull();
  });
});

describe('canAnalyze', () => {
  const ok = 'x'.repeat(RESUME_EDIT_LIMITS.jobMinChars);

  it('allows a valid posting when nothing is running', () => {
    expect(canAnalyze(ok, false)).toBe(true);
  });

  it('refuses while a run is in flight, so one click cannot spend two analyses', () => {
    expect(canAnalyze(ok, true)).toBe(false);
  });

  it('refuses an invalid posting whether or not a run is in flight', () => {
    expect(canAnalyze('too short', false)).toBe(false);
    expect(canAnalyze('too short', true)).toBe(false);
  });
});

describe('describeFailure', () => {
  it('keeps a typed request error’s safe copy and its status', () => {
    const error = new ResumeAgentRequestError(
      429,
      "You've used today's resume analyses. Try again tomorrow.",
      "You've used today's resume analyses. Try again tomorrow."
    );

    expect(describeFailure(error)).toEqual({
      message: "You've used today's resume analyses. Try again tomorrow.",
      httpStatus: 429,
    });
  });

  it('keeps the status for a timeout, so it is distinguishable from a limit', () => {
    const error = new ResumeAgentRequestError(504, 'Did not finish in time.', null);

    expect(describeFailure(error).httpStatus).toBe(504);
  });

  it('passes a network failure through with no status', () => {
    const result = describeFailure(new ResumeAgentNetworkError());

    expect(result.httpStatus).toBeNull();
    expect(result.message).toMatch(/offline/i);
  });

  it('falls back for a thrown non-error', () => {
    expect(describeFailure({ weird: true })).toEqual({
      message: 'The analysis could not be completed. Try again in a moment.',
      httpStatus: null,
    });
  });

  it('falls back for an Error with no message', () => {
    expect(describeFailure(new Error('   ')).message).toMatch(/could not be completed/i);
  });
});

describe('composer prop contract', () => {
  it('still accepts the original props with no agent wiring', () => {
    // Creating the element does not invoke the component, so no hooks or
    // builder store are needed. This pins the backward-compatible contract:
    // every caller written before the Resume Agent still typechecks.
    const element = <AiEditComposer experiences={[]} onSubmit={() => {}} />;

    expect(element.props.onAnalyze).toBeUndefined();
    expect(element.props.analyzeBusy).toBeUndefined();
    expect(typeof element.props.onSubmit).toBe('function');
  });

  it('accepts the agent wiring when the panel supplies it', () => {
    const element = (
      <AiEditComposer experiences={[]} onSubmit={() => {}} onAnalyze={() => {}} analyzeBusy />
    );

    expect(typeof element.props.onAnalyze).toBe('function');
    expect(element.props.analyzeBusy).toBe(true);
  });
});
