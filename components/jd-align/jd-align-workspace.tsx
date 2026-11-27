'use client';

import { Loader2 } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';

import { Button } from '@/components/ui/button';
import { explainAlignInput } from '@/services/ai/jd-align/limits';
import { alignmentFits, type JdAlignResult } from '@/services/ai/jd-align/types';

import { AlignThreads } from './align-threads';
import { AnnotatedDocument, type DocumentMark } from './annotated-document';
import { MatchMetrics } from './match-metrics';

interface JdAlignWorkspaceProps {
  initialResume: string;
  resumeTitle: string | null;
}

function errorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = (payload as { error: unknown }).error;
    if (typeof error === 'string' && error.trim()) return error;
    if (error && typeof error === 'object' && 'message' in error) {
      const message = (error as { message: unknown }).message;
      if (typeof message === 'string' && message.trim()) return message;
    }
  }
  if (status === 503) return 'Matching is unavailable right now.';
  return 'Matching failed. Try again in a moment.';
}

function CountChip({
  tone,
  count,
  label,
}: {
  tone: 'matched' | 'missing';
  count: number;
  label: string;
}) {
  const toneClass =
    tone === 'matched'
      ? 'border-emerald-700/15 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100'
      : 'border-rose-700/15 bg-rose-500/10 text-rose-900 dark:text-rose-100';
  const dot = tone === 'matched' ? 'bg-emerald-500' : 'bg-rose-500';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {count} {label}
    </span>
  );
}

/**
 * Resume on the left, job description on the right.
 * After Match, the posting is marked in green where the resume supports it
 * and red where it does not. Hovering a green mark draws lines to the words.
 */
export function JdAlignWorkspace({ initialResume, resumeTitle }: JdAlignWorkspaceProps) {
  const [resumeText, setResumeText] = useState(initialResume);
  const [jobText, setJobText] = useState('');
  const [result, setResult] = useState<JdAlignResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const resumePaneRef = useRef<HTMLDivElement>(null);
  const jdPaneRef = useRef<HTMLDivElement>(null);
  const resumeInputRef = useRef<HTMLTextAreaElement>(null);
  const jdInputRef = useRef<HTMLTextAreaElement>(null);
  const requestId = useRef(0);
  const clearTimer = useRef<number | null>(null);
  const pendingFocus = useRef<'resume' | 'job' | null>(null);

  const inputProblem = explainAlignInput(resumeText, jobText);
  const canMatch = inputProblem == null && !loading;
  const usingFollio = initialResume.trim().length > 0 && resumeText === initialResume;
  const active = result?.aspects.find((aspect) => aspect.id === activeId) ?? null;

  const setHover = useCallback((id: string | null) => {
    if (clearTimer.current) {
      window.clearTimeout(clearTimer.current);
      clearTimer.current = null;
    }
    if (id) {
      setActiveId(id);
      return;
    }
    clearTimer.current = window.setTimeout(() => setActiveId(null), 90);
  }, []);

  useEffect(() => {
    return () => {
      if (clearTimer.current) window.clearTimeout(clearTimer.current);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const discard = useCallback(() => {
    requestId.current += 1;
    setLoading(false);
    setResult(null);
    setActiveId(null);
    setNotice(null);
    setError(null);
  }, []);

  const editResume = (value: string) => {
    discard();
    setResumeText(value);
  };

  const editJob = (value: string) => {
    discard();
    setJobText(value);
  };

  const beginEdit = (side: 'resume' | 'job') => {
    pendingFocus.current = side;
    discard();
  };

  useEffect(() => {
    if (result) return;
    const side = pendingFocus.current;
    if (!side) return;
    pendingFocus.current = null;
    const field = side === 'resume' ? resumeInputRef.current : jdInputRef.current;
    field?.focus();
  }, [result]);

  useLayoutEffect(() => {
    if (!active || active.status !== 'matched' || active.evidence.length === 0) return;
    const pane = resumePaneRef.current;
    const mark = pane?.querySelector('[data-align-role="resume"]');
    if (!pane || !mark) return;

    const paneBox = pane.getBoundingClientRect();
    const markBox = mark.getBoundingClientRect();
    const visible = markBox.bottom > paneBox.top + 8 && markBox.top < paneBox.bottom - 8;
    if (visible) return;

    const top = markBox.top - paneBox.top + pane.scrollTop;
    const next = top - pane.clientHeight / 2 + markBox.height / 2;
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth';
    pane.scrollTo({ top: Math.max(0, next), behavior });
  }, [active]);

  const run = useCallback(async () => {
    const problem = explainAlignInput(resumeText, jobText);
    if (problem) {
      setNotice(problem);
      return;
    }

    const id = ++requestId.current;
    const resume = resumeText;
    const job = jobText;
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch('/api/jd-align', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeText: resume, jobDescription: job }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (id !== requestId.current) return;

      if (!response.ok) {
        setError(errorMessage(payload, response.status));
        return;
      }
      if (!alignmentFits(payload, resume, job)) {
        setError('Matching returned something we could not draw. Try again.');
        return;
      }
      setResult(payload);
      setActiveId(null);
      if (payload.aspects.length === 0) {
        setNotice('No specific requirements could be marked in the posting.');
      }
    } catch {
      if (id !== requestId.current) return;
      setError('Matching failed. Try again in a moment.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [jobText, resumeText]);

  const caption = (() => {
    if (loading) return 'Reading the posting, counting keywords, and scoring the fit.';
    if (notice) return notice;
    const started = resumeText.trim().length > 0 || jobText.trim().length > 0;
    if (started && inputProblem && !result) return inputProblem;
    if (result) {
      return 'Hover a green mark. A line will find the words on your resume that support it.';
    }
    return 'Paste a posting on the right. Match scores keywords, gives a recruiter’s read, and marks what your resume supports.';
  })();

  const jdMarks: DocumentMark[] = (result?.aspects ?? []).map((aspect) => ({
    id: aspect.id,
    aspectId: aspect.id,
    start: aspect.start,
    end: aspect.end,
    status: aspect.status,
    role: 'jd' as const,
    label: aspect.label,
    note: aspect.note,
    evidenceQuote: aspect.evidence[0]?.quote,
  }));

  const resumeMarks: DocumentMark[] = active
    ? active.evidence.map((evidence) => ({
        id: evidence.id,
        aspectId: active.id,
        start: evidence.start,
        end: evidence.end,
        status: 'matched' as const,
        role: 'resume' as const,
        label: active.label,
        note: active.note,
      }))
    : [];

  return (
    <div className="flex h-full min-h-0 flex-col px-4 py-4 sm:px-6 sm:py-5">
      <header className="mb-4 flex shrink-0 flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Compare to a job</h1>
          {active ? (
            <p className="mt-1 min-h-10 text-sm leading-5" aria-live="polite">
              <span
                className={
                  active.status === 'matched'
                    ? 'font-medium text-emerald-800 dark:text-emerald-200'
                    : 'font-medium text-rose-800 dark:text-rose-200'
                }
              >
                {active.label}
              </span>
              <span className="text-muted-foreground"> — {active.note}</span>
            </p>
          ) : (
            <p className="mt-1 min-h-10 text-sm leading-5 text-muted-foreground" aria-live="polite">
              {caption}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {result ? (
            <>
              <CountChip tone="matched" count={result.matchedCount} label="matched" />
              <CountChip tone="missing" count={result.missingCount} label="missing" />
            </>
          ) : null}
          <Button type="button" onClick={() => void run()} disabled={!canMatch} aria-busy={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Matching…
              </>
            ) : result ? (
              'Match again'
            ) : (
              'Match'
            )}
          </Button>
        </div>
      </header>

      {error ? (
        <p role="alert" className="mb-3 shrink-0 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className={loading ? 'pointer-events-none opacity-60' : undefined}>
          <MatchMetrics keywords={result.keywords} expert={result.expert} />
        </div>
      ) : null}

      <div
        ref={stageRef}
        className={`relative grid min-h-0 flex-1 grid-cols-1 grid-rows-2 gap-3 lg:grid-cols-2 lg:grid-rows-1 lg:gap-x-14 ${
          loading ? 'opacity-80' : ''
        }`}
        aria-busy={loading}
        onClick={(event) => {
          if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
          const target = event.target;
          if (target instanceof Element && target.closest('[data-align-role="jd"]')) return;
          setHover(null);
        }}
      >
        <AlignThreads
          stageRef={stageRef}
          resumePaneRef={resumePaneRef}
          jdPaneRef={jdPaneRef}
          activeAspectId={active?.status === 'matched' ? active.id : null}
        />
        <Sheet
          label="Resume"
          labelledBy="resume-sheet"
          scrollRef={resumePaneRef}
          meta={
            usingFollio ? (
              <span className="truncate text-xs text-muted-foreground">
                From {resumeTitle?.trim() || 'your Follio'}
              </span>
            ) : initialResume.trim() ? (
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                onClick={() => editResume(initialResume)}
              >
                Use my resume
              </button>
            ) : null
          }
          onEdit={result ? () => beginEdit('resume') : null}
        >
          <AnnotatedDocument
            text={resumeText}
            placeholder="Paste a resume. Yours from Follio is placed here when you have one."
            editing={!result}
            marks={resumeMarks}
            activeAspectId={activeId}
            textareaRef={resumeInputRef}
            onChange={editResume}
            onMetaEnter={() => void run()}
            onHoverAspect={setHover}
          />
        </Sheet>
        <Sheet
          label="Job description"
          labelledBy="job-sheet"
          scrollRef={jdPaneRef}
          meta={
            result?.roleHint ? (
              <span className="truncate text-xs text-muted-foreground">{result.roleHint}</span>
            ) : null
          }
          onEdit={result ? () => beginEdit('job') : null}
        >
          <AnnotatedDocument
            text={jobText}
            placeholder="Paste the job description. The posting itself, not a link."
            editing={!result}
            marks={jdMarks}
            activeAspectId={activeId}
            textareaRef={jdInputRef}
            onChange={editJob}
            onMetaEnter={() => void run()}
            onHoverAspect={setHover}
          />
        </Sheet>
      </div>
    </div>
  );
}

function Sheet({
  label,
  labelledBy,
  scrollRef,
  meta,
  onEdit,
  children,
}: {
  label: string;
  labelledBy: string;
  scrollRef: RefObject<HTMLDivElement | null>;
  meta: ReactNode;
  onEdit: (() => void) | null;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-2 pt-4">
        <div className="flex min-w-0 items-baseline gap-3">
          <h2
            id={labelledBy}
            className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground"
          >
            {label}
          </h2>
          {meta}
        </div>
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="shrink-0 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Edit
          </button>
        ) : null}
      </div>
      <div ref={scrollRef as Ref<HTMLDivElement>} className="min-h-0 flex-1 overflow-y-auto">
        {children}
      </div>
    </section>
  );
}
