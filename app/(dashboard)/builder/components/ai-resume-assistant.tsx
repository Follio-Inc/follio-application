'use client';

/**
 * AI Resume Assistant — Builder CONTENT panel section.
 *
 * Five entry points, rendered as a collapsible card above the pinned Header
 * section. Four are read-only evaluations that open the shared
 * `AnalyzeResumeDialog`, the single caller of
 * `POST /api/resumes/[resumeId]/agent`. Keyword analysis is the
 * job-description run presented keyword-first — not a separate agent and not
 * a separate endpoint.
 *
 * The fifth, **Generate AI Improvements**, is the only one that can lead to a
 * resume being changed, and it is deliberately a different dialog rather than
 * a fifth tab in the evaluation one. Running an evaluation must never be a
 * way to end up with rewrites, so the two paths do not share a code path at
 * all.
 *
 * Billing: nothing runs on mount. Neither dialog is mounted with a resume
 * until the user clicks an action, so loading /builder costs nothing. Of the
 * four evaluations only General runs immediately on open; the others need a
 * job description or a role first. The rewrite dialog runs nothing on open —
 * generating is a separate, explicit press inside it.
 *
 * This component is also where the Builder's draft and an applied suggestion
 * are kept from overwriting each other. It owns that coordination because it
 * is the one place that sits inside the Builder store *and* holds the review
 * dialog; the rules themselves are pure functions in
 * `../lib/apply-proposal-sync`.
 *
 * Resume identity: the Builder's `draftProfile.id` is the Prisma `Profile.id`
 * (`FullProfile extends Omit<Profile, 'resumeDesign'>`), which is exactly the
 * id the agent route looks up with `db.profile.findFirst({ id, userId })`.
 * They are the same identifier, so it is passed straight through — no mapping,
 * nothing hardcoded, and the route still re-checks ownership against the
 * session.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, FileSearch, FileText, Sparkles, Tags, Target, Wand2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { AnalyzeResumeDialog } from '@/app/(dashboard)/resumes/analyze-resume-dialog';
import { notifyProfileUpdated } from '@/lib/events';
import { cn } from '@/lib/utils';

import {
  describeProposalLocation,
  evaluateApplyGate,
  patchForAppliedProposal,
} from '../lib/apply-proposal-sync';
import { useBuilderStore } from './builder-store-provider';
import { RewriteProposalsDialog } from './rewrite-proposals-dialog';

import type { AnalysisFocus } from '@/app/(dashboard)/resumes/analyze-resume-dialog';
import type { ProposalView } from '@/lib/resume-proposals/client';
import type { LucideIcon } from 'lucide-react';

interface AssistantAction {
  focus: AnalysisFocus;
  label: string;
  description: string;
  icon: LucideIcon;
}

const ACTIONS: AssistantAction[] = [
  {
    focus: 'general',
    label: 'General Resume Evaluation',
    description: 'A plain read of what this resume contains.',
    icon: FileText,
  },
  {
    focus: 'jd',
    label: 'Job Description Evaluation',
    description: 'Score this resume against a posting you paste.',
    icon: FileSearch,
  },
  {
    focus: 'role',
    label: 'Target Role Evaluation',
    description: 'Check it against a role such as Technical Program Manager.',
    icon: Target,
  },
  {
    focus: 'keywords',
    label: 'Missing Keywords',
    description: 'Which keywords from a posting are missing or unlisted.',
    icon: Tags,
  },
];

export function AiResumeAssistant() {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeFocus, setActiveFocus] = useState<AnalysisFocus>('general');
  /** Non-null only while the dialog is open — nothing fetches before that. */
  const [analyzingResume, setAnalyzingResume] = useState<{ id: string; title: string } | null>(
    null
  );
  /** Non-null only while the rewrite dialog is open. Nothing runs on open. */
  const [rewritingResume, setRewritingResume] = useState<{ id: string; title: string } | null>(
    null
  );

  // The resume currently loaded in the Builder. Read from the store rather
  // than passed in, so switching resumes targets the new one automatically.
  const resumeId = useBuilderStore((state) => state.draftProfile.id);
  const resumeTitle = useBuilderStore((state) => state.draftProfile.resumeTitle);
  const commitInlineChange = useBuilderStore((state) => state.commitInlineChange);
  const setApplyingProposal = useBuilderStore((state) => state.setApplyingProposal);
  const storeApi = useBuilderStore((state) => state);

  const startAnalysis = (focus: AnalysisFocus) => {
    if (!resumeId) return;
    setActiveFocus(focus);
    setAnalyzingResume({ id: resumeId, title: resumeTitle || 'Untitled resume' });
  };

  const startRewrite = () => {
    if (!resumeId) return;
    setRewritingResume({ id: resumeId, title: resumeTitle || 'Untitled resume' });
  };

  /**
   * Asked before every apply.
   *
   * Reads the store at the moment of the press rather than from a captured
   * render, because the thing being guarded against is a save that started
   * since this component last rendered.
   */
  const guardApply = useCallback(
    (proposal: ProposalView) =>
      evaluateApplyGate(
        {
          isSaving: storeApi.isSaving,
          isInlineEditing: storeApi.isInlineEditing,
          draftProfile: storeApi.draftProfile,
          savedProfile: storeApi.savedProfile,
        },
        proposal
      ),
    [storeApi]
  );

  /**
   * Fold a confirmed write back into the Builder.
   *
   * `commitInlineChange` writes the draft *and* the saved baseline, which is
   * what makes the new text survive the next Save: a draft-only update would
   * look like an unsaved edit, and a baseline-only update would be overwritten
   * by the draft. Only the one field the proposal addressed is touched, so
   * unrelated unsaved edits elsewhere are left alone.
   *
   * `router.refresh()` afterwards re-reads the server profile. It is the
   * follow-up, not the mechanism — the provider only adopts a refreshed
   * profile when the draft is clean, so on its own it would do nothing in
   * exactly the case that matters.
   */
  const handleApplied = useCallback(
    (proposal: ProposalView) => {
      const patch = patchForAppliedProposal(storeApi.draftProfile, proposal);
      if (patch) commitInlineChange(patch);

      notifyProfileUpdated();
      router.refresh();
    },
    [storeApi, commitInlineChange, router]
  );

  const locateProposal = useCallback(
    (proposal: ProposalView) => describeProposalLocation(storeApi.draftProfile, proposal),
    [storeApi]
  );

  return (
    <section id="section-ai-assistant" className="group/section scroll-mt-16">
      <div className="overflow-hidden rounded-xl bg-muted transition-colors duration-150">
        <button
          type="button"
          onClick={() => setIsExpanded((open) => !open)}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors"
          aria-expanded={isExpanded}
        >
          <Sparkles
            className={cn(
              'h-4 w-4 shrink-0 transition-colors duration-150',
              isExpanded ? 'text-primary' : 'text-muted-foreground/70'
            )}
          />
          <span
            className={cn(
              'flex-1 text-sm font-medium transition-colors duration-150',
              isExpanded ? 'text-foreground' : 'text-foreground/90'
            )}
          >
            AI Resume Assistant
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform duration-200',
              isExpanded && '-rotate-180 text-primary'
            )}
          />
        </button>

        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="rounded-b-xl bg-muted px-4 pb-5 pt-1">
                <div className="space-y-2">
                  {ACTIONS.map((action) => (
                    <button
                      key={action.focus}
                      type="button"
                      onClick={() => startAnalysis(action.focus)}
                      disabled={!resumeId}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-lg bg-background px-3 py-2.5 text-left',
                        'transition-colors duration-150 hover:bg-background/70',
                        'disabled:cursor-not-allowed disabled:opacity-50'
                      )}
                    >
                      <action.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1">
                        <span className="block text-sm font-medium text-foreground">
                          {action.label}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {action.description}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>

                {/* Separated from the four evaluations on purpose: this is
                    the only action that can lead to the resume changing. */}
                <div className="mt-3 border-t pt-3">
                  <button
                    type="button"
                    onClick={startRewrite}
                    disabled={!resumeId}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-lg bg-background px-3 py-2.5 text-left',
                      'transition-colors duration-150 hover:bg-background/70',
                      'disabled:cursor-not-allowed disabled:opacity-50'
                    )}
                  >
                    <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="flex-1">
                      <span className="block text-sm font-medium text-foreground">
                        Generate AI Improvements
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        Suggested rewrites you review one by one. Nothing changes until you apply
                        one.
                      </span>
                    </span>
                  </button>
                </div>

                <p className="mt-3 text-xs text-muted-foreground">
                  The four evaluations are read-only. Improvements are suggestions you approve and
                  apply yourself. Both read the last saved version, so save your edits first to have
                  them included.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Mounted with a resume only after a deliberate click. */}
      <AnalyzeResumeDialog
        resume={analyzingResume}
        initialMode={activeFocus}
        onOpenChange={(open) => {
          if (!open) setAnalyzingResume(null);
        }}
      />

      <RewriteProposalsDialog
        resume={rewritingResume}
        onOpenChange={(open) => {
          if (!open) setRewritingResume(null);
        }}
        onBeforeApply={guardApply}
        // Held across the request so the Save button cannot start a write of
        // the older draft while the server is mid-apply, and released however
        // the request ends.
        onApplyingChange={setApplyingProposal}
        onApplied={handleApplied}
        describeLocation={locateProposal}
      />
    </section>
  );
}
