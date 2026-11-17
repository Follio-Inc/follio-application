'use client';

import { CircleAlert, Loader2, ShieldCheck, Target } from 'lucide-react';

import type { ResumeAgentAnalysis } from '@/lib/resume-agent/client';

import type { ProposalOutcome } from './use-resume-agent';

/**
 * The Resume Agent's read of one resume against one posting.
 *
 * Deliberately narrow: the requirement chips, scores and keyword coverage are
 * already on screen above this, drawn live from the resume in the editor by
 * `JobMatch`. Repeating them from a server snapshot would give the user two
 * answers that drift apart as they type. What is new here is the agent's
 * summary, its next steps, anything that limited the run, and — in propose
 * mode — what became of the suggestion set.
 *
 * Presentational only — no hooks, no fetching, no state. Renders under
 * `renderToStaticMarkup`.
 */
export function AgentReport({
  analysis,
  proposal = null,
  openSessionId = null,
}: {
  analysis: ResumeAgentAnalysis;
  /** Null in analyze mode, which can never propose. */
  proposal?: ProposalOutcome | null;
  /**
   * The session the review panel currently has open, from the review state
   * itself. Compared against the proposal's own id, so "open for review" is
   * only ever said when this exact set is on screen — closing the review
   * through "Change request" changes what this says.
   */
  openSessionId?: string | null;
}) {
  const { summary, recommendations, limitations } = analysis;

  return (
    <section
      aria-labelledby="agent-report-title"
      className="animate-fade-up space-y-4 rounded-xl border border-border/80 p-4"
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
          aria-hidden
        >
          <Target className="h-4 w-4" />
        </span>
        <div className="min-w-0 space-y-1">
          <h3 id="agent-report-title" className="text-section-title">
            How you fit this role
          </h3>
          {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
        </div>
      </div>

      {proposal && <ProposalStatus proposal={proposal} openSessionId={openSessionId} />}

      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-foreground">What to do next</h4>
        {recommendations.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No specific next steps — your resume already answers what this posting asks for.
          </p>
        ) : (
          <ul className="space-y-2">
            {recommendations.map((recommendation, index) => (
              <li
                key={`${recommendation.requirement}-${index}`}
                className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
              >
                <p className="text-xs font-semibold text-foreground">
                  {recommendation.requirement}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">{recommendation.suggestion}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {limitations.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-foreground">What this analysis could not do</h4>
          <ul className="space-y-1">
            {limitations.map((limitation, index) => (
              <li
                key={`${limitation}-${index}`}
                className="flex items-start gap-1.5 text-xs text-muted-foreground"
              >
                <CircleAlert
                  className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                  aria-hidden
                />
                <span>{limitation}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
        <span>{assurance(proposal)}</span>
      </p>
    </section>
  );
}

/**
 * Never says an edit was made. A saved set is pending the user's approval in
 * the review panel, and that is what the wording has to convey.
 */
function assurance(proposal: ProposalOutcome | null): string {
  if (!proposal || proposal.kind === 'none') {
    return 'This is a read of your resume. Nothing was changed, and no suggestions were saved.';
  }
  return 'Your resume is unchanged. These are suggestions until you review and keep them.';
}

function ProposalStatus({
  proposal,
  openSessionId,
}: {
  proposal: ProposalOutcome;
  openSessionId: string | null;
}) {
  if (proposal.kind === 'none') {
    return (
      <div className="space-y-1 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
        <p className="text-xs font-semibold text-foreground">No changes were saved</p>
        <p className="text-sm text-muted-foreground">
          {proposal.message ??
            'Nothing survived Follio’s checks, so no suggestions were saved. Your resume is unchanged.'}
        </p>
        <p className="text-xs text-muted-foreground">
          Follio drops any rewrite that adds a tool, name, title or number your resume does not
          already show.
        </p>
      </div>
    );
  }

  if (proposal.kind === 'opening') {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-busy>
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />
        Suggestions saved. Opening them for review…
      </p>
    );
  }

  if (proposal.kind === 'unopened') {
    return (
      <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <CircleAlert
            className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden
          />
          Suggestions saved, but not opened
        </p>
        <p className="text-sm text-muted-foreground">{proposal.reason}</p>
        <p className="text-xs text-muted-foreground">
          Your resume is unchanged. Asking again would save a second set.
        </p>
      </div>
    );
  }

  // Saved and still on screen.
  if (openSessionId === proposal.sessionId) {
    return (
      <p className="text-sm text-muted-foreground">
        Suggestions saved and opened for review below. Nothing is applied until you keep it.
      </p>
    );
  }

  // Saved, but the review has since been closed — through "Change request",
  // for instance. The set is still waiting in Recent requests.
  return (
    <p className="text-sm text-muted-foreground">
      Suggestions saved. Reopen them under Recent requests below. Nothing is applied until you keep
      it.
    </p>
  );
}
