/**
 * Phase 3B.2 — the review dialog's wiring.
 *
 * The decisions live in `lib/resume-proposals/client.ts` and are tested
 * against real state in `rewrite-proposals-client.test.ts`. What is left are
 * the guarantees that only exist in the component, where no DOM environment
 * can reach them: that generating needs a press, that history makes no model
 * call, that the apply request carries no content, and that a response for a
 * resume the user has left cannot populate the dialog for the new one.
 *
 * Source assertions follow the convention already used by
 * `__tests__/builder-ai-assistant.test.ts` and `platform-resume-lab.test.ts`,
 * for the same reason those do: a mock would hide the thing being guaranteed.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { RewriteProposalsDialog } from '@/app/(dashboard)/builder/components/rewrite-proposals-dialog';

const ROOT = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(path.join(ROOT, relativePath), 'utf8');
}

/** Drop comments so prose about an endpoint is not mistaken for a call. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const DIALOG_PATH = 'app/(dashboard)/builder/components/rewrite-proposals-dialog.tsx';
const ASSISTANT_PATH = 'app/(dashboard)/builder/components/ai-resume-assistant.tsx';
const ANALYZE_PATH = 'app/(dashboard)/resumes/analyze-resume-dialog.tsx';

const dialog = stripComments(readSource(DIALOG_PATH));
const assistant = stripComments(readSource(ASSISTANT_PATH));

// ============================================================================
// THE MODULE LOADS
// ============================================================================

describe('the review dialog module', () => {
  it('imports cleanly', () => {
    // Cheap, but not nothing: it catches an import cycle or a bad specifier
    // that source assertions would sail straight past. It is also the link
    // that lets the Developer Platform attribute this suite to the feature
    // rather than guessing from the file name.
    expect(typeof RewriteProposalsDialog).toBe('function');
  });
});

// ============================================================================
// SCROLLING AND HEIGHT
// ============================================================================

/**
 * The bug these guard against, written down because the fix looks arbitrary
 * without it.
 *
 * The dialog first shipped with the shared Radix `ScrollArea` wrapping a body
 * that was capped with `max-h-[calc(85vh-9rem)]`. Radix gives its viewport
 * `h-full`, and `height: 100%` against a parent that has only a `max-height`
 * resolves to `auto` — so the viewport grew to its content, scrolled nothing,
 * and the root clipped the overflow with `overflow: hidden`. On a 1366x768
 * laptop the Approve, Reject and Apply buttons sat below that cut with no way
 * to reach them.
 *
 * There is no DOM environment here, so these cannot measure a rendered box.
 * What they can do is hold the class contract that makes the column work, and
 * — more usefully — fail if anyone reintroduces the pattern that broke it.
 */
function classesOf(markerLine: string): string[] {
  // The dialog is prettier-formatted, so a className may sit on its own line
  // after the attribute. Grab the first string literal following the marker.
  const index = dialog.indexOf(markerLine);
  if (index === -1) return [];
  const window = dialog.slice(index, index + 400);
  const match = window.match(/className="([^"]+)"/);
  return match ? match[1].split(/\s+/).filter(Boolean) : [];
}

describe('the dialog is a flex column with a bounded height', () => {
  const content = classesOf('<DialogContent');

  it('bounds itself to the viewport in dynamic viewport units', () => {
    // `dvh` rather than `vh`: on a phone a collapsing browser toolbar makes
    // `vh` taller than what is actually visible, which pushes the footer off.
    expect(content).toContain('max-h-[90dvh]');
    expect(content.some((name) => /^max-h-\[\d+vh\]$/.test(name))).toBe(false);
  });

  it('lays itself out as a column so the body can take the slack', () => {
    expect(content).toContain('flex');
    expect(content).toContain('flex-col');
    // Without this the body would spill past the bounded height instead of
    // scrolling inside it.
    expect(content).toContain('overflow-hidden');
  });

  it('keeps its own padding off, so the header and footer can own their edges', () => {
    expect(content).toContain('p-0');
    expect(content).toContain('gap-0');
  });
});

describe('the body scrolls and nothing else does', () => {
  const body = classesOf('data-testid="rewrite-proposals-scroll"');

  it('is the one scrollable region', () => {
    expect(body).toContain('overflow-y-auto');
    // Keeps a flick past the end from scrolling the Builder behind the dialog.
    expect(body).toContain('overscroll-contain');
  });

  it('can shrink below its content, which is the whole fix', () => {
    // A flex item defaults to `min-height: auto` and refuses to shrink below
    // its content, so `overflow-y-auto` never engages without this.
    expect(body).toContain('min-h-0');
    expect(body).toContain('flex-1');
  });

  it('does not re-cap its own height on top of the column', () => {
    // A second `max-h` here is what produced the original clipped region: it
    // guessed at the header height and got it wrong.
    expect(body.some((name) => name.startsWith('max-h-'))).toBe(false);
    expect(body.some((name) => name.includes('calc('))).toBe(false);
  });
});

describe('the header and the footer stay put', () => {
  it('refuses to compress the header, so the title and close stay visible', () => {
    const header = classesOf('<DialogHeader');
    expect(header).toContain('shrink-0');
    // DialogContent renders its close button at `right-4 top-4`; without the
    // reserved padding a long title runs underneath it.
    expect(header).toContain('pr-12');
  });

  it('pins the batch actions in a footer that never scrolls away', () => {
    const footer = classesOf('data-testid="rewrite-proposals-footer"');
    expect(footer).toContain('shrink-0');
    expect(footer).toContain('border-t');

    const footerBlock = dialog.slice(dialog.indexOf('rewrite-proposals-footer'));
    expect(footerBlock).toContain('History');
    expect(footerBlock).toContain('New');
  });

  it('leaves the per-proposal actions in their cards, reachable by scrolling', () => {
    // One set per proposal, so they cannot live in a single footer. The body
    // scrolling is what makes them reachable.
    const card = dialog.slice(
      dialog.indexOf('function ProposalCard'),
      dialog.indexOf('export function RewriteProposalsDialog')
    );
    expect(card).toContain('Approve');
    expect(card).toContain('Reject');
    expect(card).toContain('Apply to resume');
  });
});

describe('the pattern that broke it cannot come back', () => {
  it('does not wrap the body in Radix ScrollArea', () => {
    // Its viewport is `h-full`, which is `auto` under a `max-height`-only
    // parent — the viewport grows, the root clips, and nothing scrolls.
    expect(dialog).not.toContain('ScrollArea');
    expect(dialog).not.toContain('scroll-area');
  });

  it('never hardcodes an assumed header height', () => {
    expect(dialog).not.toMatch(/max-h-\[calc\(/);
  });
});

// ============================================================================
// THE BUILDER ACTION
// ============================================================================

describe('the AI Resume Assistant keeps its four evaluations and gains a fifth action', () => {
  it('still offers the four read-only evaluations', () => {
    for (const focus of ['general', 'jd', 'role', 'keywords']) {
      expect(assistant).toContain(`focus: '${focus}'`);
    }
    for (const label of [
      'General Resume Evaluation',
      'Job Description Evaluation',
      'Target Role Evaluation',
      'Missing Keywords',
    ]) {
      expect(assistant).toContain(label);
    }
  });

  it('adds Generate AI Improvements as a separate action', () => {
    expect(assistant).toContain('Generate AI Improvements');
    expect(assistant).toContain('startRewrite');
  });

  it('keeps rewriting out of the evaluation list, so an evaluation cannot become one', () => {
    // The four evaluations come from ACTIONS; the rewrite button is rendered
    // on its own and opens a different dialog.
    const actionsBlock = assistant.slice(
      assistant.indexOf('const ACTIONS'),
      assistant.indexOf('export function AiResumeAssistant')
    );
    expect(actionsBlock).not.toMatch(/rewrite|improvement/i);
  });

  it('opens a different dialog for rewriting than for evaluating', () => {
    expect(assistant).toContain('<AnalyzeResumeDialog');
    expect(assistant).toContain('<RewriteProposalsDialog');
  });

  it('mounts the rewrite dialog without a resume until the action is clicked', () => {
    // `resume={rewritingResume}` starts null, and the dialog's `open` is
    // `Boolean(resume)`, so nothing mounts or fetches on page load.
    expect(assistant).toMatch(/setRewritingResume\]?\s*=\s*useState/);
    expect(assistant).toContain('resume={rewritingResume}');
    expect(dialog).toContain('open={Boolean(resume)}');
  });

  it('takes the resume from the Builder store rather than hardcoding one', () => {
    expect(assistant).toContain('useBuilderStore((state) => state.draftProfile.id)');
    expect(assistant).not.toMatch(/resume_[a-z0-9]{6,}/i);
  });
});

// ============================================================================
// GENERATION
// ============================================================================

describe('generating costs money only on a deliberate press', () => {
  it('runs nothing on open — no effect calls generate', () => {
    // The only caller of `generate` is the button's onClick.
    const callers = dialog.match(/generate\(false\)|generate\(true\)/g) ?? [];
    expect(callers.length).toBeGreaterThan(0);
    expect(dialog).toContain('onClick={() => generate(false)}');

    // No useEffect anywhere mentions generate.
    const effects = dialog.match(/useEffect\([\s\S]*?\n  \}, \[[^\]]*\]\);/g) ?? [];
    for (const effect of effects) {
      expect(effect).not.toContain('generate(');
    }
  });

  it('posts to the rewrite-proposals endpoint, not the analysis endpoint', () => {
    expect(dialog).toContain('proposalPaths.collection(forResume)');
    expect(dialog).not.toContain('/agent');
  });

  it('builds the body through the shared builder rather than spreading UI state', () => {
    expect(dialog).toContain('buildGenerateRequest({');
    // A spread of local state could carry a field the strict schema rejects.
    expect(dialog).not.toMatch(/body: JSON\.stringify\(\{\s*\.\.\./);
  });

  it('prevents a duplicate submission while one is running', () => {
    expect(dialog).toContain('if (!resumeId || isGenerating) return;');
    expect(dialog).toContain('disabled={!canSubmit}');
  });

  it('mints a key for a new attempt and reuses it for a retry', () => {
    expect(dialog).toContain('if (!isRetry || !attemptKey.current) {');
    expect(dialog).toContain('attemptKey.current = createIdempotencyKey();');
  });
});

// ============================================================================
// HISTORY
// ============================================================================

describe('reviewing stored suggestions is free', () => {
  it('fetches history and batches with GET, never POST', () => {
    const historyBlock = dialog.slice(
      dialog.indexOf('const loadHistory'),
      dialog.indexOf('const openBatch')
    );
    expect(historyBlock).toContain(
      "fetch(proposalPaths.collection(forResume), { cache: 'no-store' }"
    );
    expect(historyBlock).not.toContain("method: 'POST'");

    const openBlock = dialog.slice(
      dialog.indexOf('const openBatch'),
      dialog.indexOf('const noteFor')
    );
    expect(openBlock).toContain('proposalPaths.batch(forResume, batchId)');
    expect(openBlock).not.toContain("method: 'POST'");
  });

  it('shows every count the backend reports for a batch', () => {
    for (const count of [
      'counts.total',
      'counts.pendingReview',
      'counts.approved',
      'counts.applied',
      'counts.rejected',
      'counts.unavailable',
      'counts.stale',
    ]) {
      expect(dialog).toContain(count);
    }
    expect(dialog).toContain('item.mode');
    expect(dialog).toContain('item.status');
    expect(dialog).toContain('item.createdAt');
  });
});

// ============================================================================
// APPLY
// ============================================================================

describe('applying sends no content', () => {
  it('posts an empty body to the apply endpoint', () => {
    const applyBlock = dialog.slice(dialog.indexOf('const apply = useCallback'));
    expect(applyBlock).toContain('body: JSON.stringify({})');

    // None of the fields the backend would reject may appear in a request.
    for (const forbidden of ['proposedText:', 'targetRef:', 'verificationStatus:', 'decision:']) {
      const requestSection = applyBlock.slice(
        0,
        applyBlock.indexOf('const response = await fetch') + 800
      );
      expect(requestSection).not.toContain(forbidden);
    }
  });

  it('sends only the decision field to the decision endpoint', () => {
    expect(dialog).toContain('body: JSON.stringify({ decision })');
  });

  it('asks the Builder before applying and reports a refusal without calling the API', () => {
    const applyBlock = dialog.slice(dialog.indexOf('const apply = useCallback'));
    const gateIndex = applyBlock.indexOf('onBeforeApply?.(proposal)');
    const fetchIndex = applyBlock.indexOf('await fetch(');
    expect(gateIndex).toBeGreaterThan(-1);
    expect(gateIndex).toBeLessThan(fetchIndex);
    expect(applyBlock).toContain('if (!gate.ok) {');
  });

  it('never applies automatically after an approval', () => {
    const decideBlock = dialog.slice(
      dialog.indexOf('const decide = useCallback'),
      dialog.indexOf('const apply = useCallback')
    );
    expect(decideBlock).not.toContain('apply(');
    expect(decideBlock).not.toContain('proposalPaths.apply');
  });

  it('disables a card’s controls while its own request is in flight', () => {
    expect(dialog).toContain('busy={busyProposalId === proposal.id}');
    expect(dialog).toContain('if (!resumeId || busyProposalId) return;');
    expect(dialog).toContain('disabled={busy}');
  });

  it('offers apply from the server’s flag rather than its own reasoning', () => {
    expect(dialog).toContain('canApply(proposal)');
    // No re-derivation of the state machine in the component.
    expect(dialog).not.toMatch(/state === 'APPROVED' && .*decision === 'APPROVED'/);
  });
});

// ============================================================================
// CONFLICTS AND STALENESS
// ============================================================================

describe('a conflict is read from its structure, not its wording', () => {
  it('uses the parsed failure rather than matching on the message', () => {
    expect(dialog).toContain('readApiFailure(response.status, body)');
    expect(dialog).toContain('if (failure.isConflict)');
    // No string sniffing anywhere.
    expect(dialog).not.toMatch(/message\.includes\(|\.match\(\/stale/i);
  });

  it('refetches the proposal after a conflict', () => {
    expect(dialog).toContain('await refreshProposal(proposal)');
    const refreshBlock = dialog.slice(
      dialog.indexOf('const refreshProposal'),
      dialog.indexOf('const decide = useCallback')
    );
    expect(refreshBlock).toContain(
      'proposalPaths.proposal(resumeId, proposal.batchId, proposal.id)'
    );
  });

  it('explains a stale suggestion and says the user’s text is kept', () => {
    expect(dialog).toContain('Your current text is kept');
    expect(dialog).toContain('generate fresh suggestions');
  });
});

// ============================================================================
// RESUME SWITCHING
// ============================================================================

describe('proposals never cross resumes', () => {
  it('clears everything when the selected resume changes', () => {
    const effect = dialog.slice(dialog.indexOf('activeResumeId.current = resumeId;'));
    for (const cleared of [
      'setBatch(null)',
      'setProposals([])',
      'setHistory(null)',
      'setError(null)',
      'attemptKey.current = null',
    ]) {
      expect(effect).toContain(cleared);
    }
    expect(dialog).toContain('}, [resumeId]);');
  });

  it('drops a response that arrives for a resume the user has left', () => {
    // Both guards, in every async path: a newer request, and a different
    // resume.
    const guards = dialog.match(/activeResumeId\.current !== forResume/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(3);
    expect(dialog).toContain('requestSeq.current !== seq');
  });

  it('aborts an in-flight generation when the resume changes', () => {
    expect(dialog).toContain('inFlight.current?.abort();');
    expect(dialog).toContain('signal: controller.signal');
  });
});

// ============================================================================
// PRIVACY
// ============================================================================

describe('nothing internal reaches the screen', () => {
  it('renders no run id, prompt or agent telemetry', () => {
    expect(dialog).not.toContain('rootRunId}');
    expect(dialog).not.toMatch(/instructions|systemPrompt|chain-of-thought/i);
    expect(dialog).not.toContain('agentsUsed');
  });

  it('logs nothing', () => {
    expect(dialog).not.toContain('console.log');
    expect(dialog).not.toContain('console.error');
  });

  it('leaves the read-only evaluation dialog untouched', () => {
    const analyze = stripComments(readSource(ANALYZE_PATH));
    expect(analyze).not.toContain('rewrite-proposals');
    expect(analyze).not.toContain('rewrite: true');
  });
});
