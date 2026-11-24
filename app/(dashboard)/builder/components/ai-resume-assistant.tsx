'use client';

/**
 * AI Resume Assistant — Builder CONTENT panel section.
 *
 * Four entry points into the Phase 1 Resume Agent, rendered as a collapsible
 * card above the pinned Header section. This component owns no evaluation
 * logic of its own: every action opens the shared `AnalyzeResumeDialog`, which
 * is the single caller of `POST /api/resumes/[resumeId]/agent`. Keyword
 * analysis is the job-description run presented keyword-first — not a separate
 * agent and not a separate endpoint.
 *
 * Billing: nothing runs on mount. The dialog is not mounted with a resume
 * until the user clicks an action, so loading /builder costs nothing. Of the
 * four actions only General runs immediately on open; the other three need a
 * job description or a role from the user first.
 *
 * Resume identity: the Builder's `draftProfile.id` is the Prisma `Profile.id`
 * (`FullProfile extends Omit<Profile, 'resumeDesign'>`), which is exactly the
 * id the agent route looks up with `db.profile.findFirst({ id, userId })`.
 * They are the same identifier, so it is passed straight through — no mapping,
 * nothing hardcoded, and the route still re-checks ownership against the
 * session.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, FileSearch, FileText, Sparkles, Tags, Target } from 'lucide-react';
import { useState } from 'react';

import { AnalyzeResumeDialog } from '@/app/(dashboard)/resumes/analyze-resume-dialog';
import { cn } from '@/lib/utils';

import { useBuilderStore } from './builder-store-provider';

import type { AnalysisFocus } from '@/app/(dashboard)/resumes/analyze-resume-dialog';
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
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeFocus, setActiveFocus] = useState<AnalysisFocus>('general');
  /** Non-null only while the dialog is open — nothing fetches before that. */
  const [analyzingResume, setAnalyzingResume] = useState<{ id: string; title: string } | null>(
    null
  );

  // The resume currently loaded in the Builder. Read from the store rather
  // than passed in, so switching resumes targets the new one automatically.
  const resumeId = useBuilderStore((state) => state.draftProfile.id);
  const resumeTitle = useBuilderStore((state) => state.draftProfile.resumeTitle);

  const startAnalysis = (focus: AnalysisFocus) => {
    if (!resumeId) return;
    setActiveFocus(focus);
    setAnalyzingResume({ id: resumeId, title: resumeTitle || 'Untitled resume' });
  };

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

                <p className="mt-3 text-xs text-muted-foreground">
                  Read-only — analysis never changes your resume. It reads the last saved version,
                  so save your edits first to have them included.
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
    </section>
  );
}
