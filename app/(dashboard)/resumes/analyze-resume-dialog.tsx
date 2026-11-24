'use client';

/**
 * "Analyze with AI" dialog.
 *
 * Read-only: it POSTs to the Resume Agent endpoint and renders what comes
 * back. It never writes to the resume and holds no draft state.
 *
 * Three evaluations share one dialog: a general read, a comparison against a
 * pasted job description, and a check against a general target role. The
 * general read still runs automatically when the dialog opens, so the
 * behaviour that existed before the other two modes is unchanged.
 *
 * The resume id is passed in by the card that opened the dialog, so the run
 * always targets the resume the user clicked — the component never looks up
 * an "active" resume of its own.
 *
 * Stale-result protection is keyed on a run counter rather than on the resume
 * id, because the user can now start several runs for the same resume without
 * closing the dialog. Only the newest run may write to state.
 */

import { AlertCircle, Loader2, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { MIN_JD_CHARS } from '@/lib/resume-lens/validate-jd';
import { ROLE_PROFILE_OPTIONS } from '@/lib/role-profiles/profiles';
import { cn } from '@/lib/utils';

type AnalysisMode = 'general' | 'jd' | 'role';

/** Mirrors `resumeAgentResultSchema` in services/agents/resume/resume.agent.ts. */
interface ResumeAnalysis {
  resumeId: string;
  resumeTitle: string;
  name: string;
  summary: string;
  highlights: string[];
  counts: {
    experiences: number;
    education: number;
    skills: number;
    projects: number;
  };
  missingSections: string[];
  limitations: string[];
  mode?: AnalysisMode;
  recommendations?: string[];
  jdMatch?: {
    score: number;
    band: string;
    label: string;
    summary: string;
    jobTitleHint: string | null;
    matchedSkills: string[];
    missingKeywords: string[];
    basis: string;
  };
  keywords?: {
    jobTitleHint: string | null;
    matchedInSkills: string[];
    presentButNotListedAsSkill: string[];
    absentFromResume: string[];
    interpretation: string;
  };
  roleCoverage?: {
    roleLabel: string;
    roleSummary: string;
    band: string;
    label: string;
    competencies: Array<{
      id: string;
      label: string;
      description: string;
      coverage: string;
      evidence: string[];
    }>;
    coveredCount: number;
    totalCompetencies: number;
    matchingTitles: string[];
    provenance: string;
    basis: string;
  };
}

interface AnalyzeResumeDialogProps {
  /** The resume to analyze, or null when the dialog is closed. */
  resume: { id: string; title: string } | null;
  onOpenChange: (open: boolean) => void;
}

const COUNT_LABELS: Array<[keyof ResumeAnalysis['counts'], string]> = [
  ['experiences', 'Experience'],
  ['education', 'Education'],
  ['skills', 'Skills'],
  ['projects', 'Projects'],
];

const MODE_TABS: Array<[AnalysisMode, string]> = [
  ['general', 'General'],
  ['jd', 'Job description'],
  ['role', 'Target role'],
];

function bandTone(band: string): string {
  switch (band) {
    case 'strong':
    case 'broad':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'good':
    case 'partial':
      return 'text-amber-600 dark:text-amber-400';
    default:
      return 'text-muted-foreground';
  }
}

function coverageTone(coverage: string): string {
  switch (coverage) {
    case 'covered':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'partial':
      return 'text-amber-600 dark:text-amber-400';
    default:
      return 'text-muted-foreground';
  }
}

/** A labelled group of keyword chips. Renders nothing when the group is empty. */
function KeywordGroup({
  title,
  hint,
  items,
  variant,
}: {
  title: string;
  hint: string;
  items: string[];
  variant: 'default' | 'secondary' | 'outline';
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="font-medium">{title}</h4>
      <p className="mb-1.5 text-xs text-muted-foreground">{hint}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <Badge key={item} variant={variant}>
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}

export function AnalyzeResumeDialog({ resume, onOpenChange }: AnalyzeResumeDialogProps) {
  const [mode, setMode] = useState<AnalysisMode>('general');
  const [jobDescription, setJobDescription] = useState('');
  const [targetRole, setTargetRole] = useState<string>(ROLE_PROFILE_OPTIONS[0]?.id ?? '');

  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A slow run that finishes after the dialog closes, or after a newer run
  // started, must not call setState and must not show its result under a
  // different question. Only the newest run id may write.
  const latestRunId = useRef(0);

  const runAnalysis = useCallback(
    async (resumeId: string, requestedMode: AnalysisMode, payload: Record<string, unknown>) => {
      const runId = latestRunId.current + 1;
      latestRunId.current = runId;

      setIsLoading(true);
      setError(null);
      setAnalysis(null);

      try {
        const response = await fetch(`/api/resumes/${resumeId}/agent`, {
          method: 'POST',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: requestedMode, ...payload }),
        });

        const body: unknown = await response.json().catch(() => null);

        if (latestRunId.current !== runId) return;

        if (!response.ok) {
          const message =
            body && typeof body === 'object' && 'error' in body
              ? String((body as { error: unknown }).error)
              : 'Could not analyze this resume.';
          setError(
            response.status === 429
              ? `${message} (rate limited)`
              : response.status === 503
                ? 'AI is not configured on this environment.'
                : message
          );
          return;
        }

        const result = (body as { analysis?: ResumeAnalysis } | null)?.analysis;
        if (!result) {
          setError('The analysis came back empty.');
          return;
        }
        setAnalysis(result);
      } catch {
        if (latestRunId.current !== runId) return;
        setError('Could not reach the server. Check your connection and try again.');
      } finally {
        if (latestRunId.current === runId) setIsLoading(false);
      }
    },
    []
  );

  const runCurrentMode = useCallback(() => {
    if (!resume) return;
    if (mode === 'jd') {
      void runAnalysis(resume.id, 'jd', { jobDescription });
    } else if (mode === 'role') {
      void runAnalysis(resume.id, 'role', { targetRole });
    } else {
      void runAnalysis(resume.id, 'general', {});
    }
  }, [resume, mode, jobDescription, targetRole, runAnalysis]);

  // One general run per opened resume, matching the behaviour before the other
  // modes existed. Nothing runs while the dialog is closed, and switching mode
  // does not start a run — the user chooses when with the button.
  useEffect(() => {
    if (!resume) {
      latestRunId.current += 1;
      return;
    }
    setMode('general');
    setJobDescription('');
    void runAnalysis(resume.id, 'general', {});
  }, [resume, runAnalysis]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Invalidate any run still in flight.
      latestRunId.current += 1;
      setAnalysis(null);
      setError(null);
      setIsLoading(false);
    }
    onOpenChange(open);
  };

  const jdTooShort = jobDescription.trim().length < MIN_JD_CHARS;
  const canRun = !isLoading && (mode !== 'jd' || !jdTooShort) && (mode !== 'role' || !!targetRole);

  return (
    <Dialog open={Boolean(resume)} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Resume analysis
          </DialogTitle>
          <DialogDescription>
            {resume ? `A read-only analysis of “${resume.title}”. Nothing is changed.` : null}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(value) => setMode(value as AnalysisMode)}>
          <TabsList className="grid w-full grid-cols-3">
            {MODE_TABS.map(([value, label]) => (
              <TabsTrigger key={value} value={value} disabled={isLoading}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {mode === 'jd' && (
          <div className="space-y-2">
            <Textarea
              value={jobDescription}
              onChange={(event) => setJobDescription(event.target.value)}
              placeholder="Paste the job description text here (not the link)…"
              className="min-h-[120px]"
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              {jdTooShort
                ? `Paste at least ${MIN_JD_CHARS} characters of the posting.`
                : 'Matching runs on your device data in Follio — the posting is not stored.'}
            </p>
          </div>
        )}

        {mode === 'role' && (
          <div className="space-y-2">
            <Select value={targetRole} onValueChange={setTargetRole} disabled={isLoading}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a target role" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_PROFILE_OPTIONS.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Role profiles are written by Follio from common posting language. They are a reading
              aid, not a job posting — so this mode reports evidence, not a match score.
            </p>
          </div>
        )}

        {mode !== 'general' && (
          <Button onClick={runCurrentMode} disabled={!canRun} size="sm">
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Analyze
          </Button>
        )}

        {isLoading && (
          <div className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Reading your resume…
          </div>
        )}

        {error && !isLoading && (
          <div className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="space-y-2">
              <p className="text-destructive">{error}</p>
              {resume && (
                <Button variant="outline" size="sm" onClick={runCurrentMode} disabled={!canRun}>
                  Try again
                </Button>
              )}
            </div>
          </div>
        )}

        {analysis && !isLoading && (
          <ScrollArea className="max-h-[60vh] pr-3">
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap gap-1.5">
                {COUNT_LABELS.map(([key, label]) => (
                  <Badge key={key} variant="secondary">
                    {label}: {analysis.counts[key]}
                  </Badge>
                ))}
              </div>

              <p className="leading-relaxed text-foreground">{analysis.summary}</p>

              {/* ─── Job-description match ──── */}
              {analysis.jdMatch && (
                <div className="rounded-md border border-border p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <h4 className="font-medium">
                      {analysis.jdMatch.jobTitleHint ?? 'Job description'}
                    </h4>
                    <span className={cn('text-sm font-semibold', bandTone(analysis.jdMatch.band))}>
                      {analysis.jdMatch.score}/100 · {analysis.jdMatch.label}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{analysis.jdMatch.summary}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{analysis.jdMatch.basis}</p>
                </div>
              )}

              {analysis.jdMatch && analysis.jdMatch.matchedSkills.length > 0 && (
                <KeywordGroup
                  title="Matched skills"
                  hint="Listed on your resume and asked for in the posting."
                  items={analysis.jdMatch.matchedSkills}
                  variant="default"
                />
              )}

              {/* ─── Keyword breakdown ──── */}
              {analysis.keywords && (
                <div className="space-y-3">
                  <KeywordGroup
                    title="Already listed as skills"
                    hint="Evidence found in your skills section."
                    items={analysis.keywords.matchedInSkills}
                    variant="default"
                  />
                  <KeywordGroup
                    title="In your resume, but not listed as skills"
                    hint="These appear in your experience or projects. Adding them to your skills section is usually a wording fix."
                    items={analysis.keywords.presentButNotListedAsSkill}
                    variant="secondary"
                  />
                  <KeywordGroup
                    title="Not found in your resume"
                    hint="These appear in the posting but nowhere in this resume. That does not mean you lack the experience — only that it is not written here."
                    items={analysis.keywords.absentFromResume}
                    variant="outline"
                  />
                </div>
              )}

              {!analysis.keywords &&
                analysis.jdMatch &&
                analysis.jdMatch.missingKeywords.length > 0 && (
                  <KeywordGroup
                    title="Not found in your resume"
                    hint="Present in the posting but not written in this resume."
                    items={analysis.jdMatch.missingKeywords}
                    variant="outline"
                  />
                )}

              {/* ─── Target-role coverage ──── */}
              {analysis.roleCoverage && (
                <div className="space-y-3">
                  <div className="rounded-md border border-border p-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <h4 className="font-medium">{analysis.roleCoverage.roleLabel}</h4>
                      <span
                        className={cn(
                          'text-sm font-semibold',
                          bandTone(analysis.roleCoverage.band)
                        )}
                      >
                        {analysis.roleCoverage.coveredCount}/
                        {analysis.roleCoverage.totalCompetencies} competencies
                      </span>
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      {analysis.roleCoverage.roleSummary}
                    </p>
                    {analysis.roleCoverage.matchingTitles.length > 0 && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Related titles on this resume:{' '}
                        {analysis.roleCoverage.matchingTitles.join(', ')}
                      </p>
                    )}
                  </div>

                  <ul className="space-y-2">
                    {analysis.roleCoverage.competencies.map((competency) => (
                      <li key={competency.id} className="rounded-md border border-border/60 p-2.5">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="font-medium">{competency.label}</span>
                          <span
                            className={cn(
                              'text-xs font-medium capitalize',
                              coverageTone(competency.coverage)
                            )}
                          >
                            {competency.coverage}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {competency.description}
                        </p>
                        {competency.evidence.length > 0 && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Evidence: {competency.evidence.join(', ')}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>

                  <p className="text-xs text-muted-foreground">{analysis.roleCoverage.basis}</p>
                  <p className="text-xs text-muted-foreground">
                    {analysis.roleCoverage.provenance}
                  </p>
                </div>
              )}

              {analysis.highlights.length > 0 && (
                <div>
                  <h4 className="mb-1.5 font-medium">Highlights</h4>
                  <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                    {analysis.highlights.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {analysis.recommendations && analysis.recommendations.length > 0 && (
                <div>
                  <h4 className="font-medium">Suggestions</h4>
                  <p className="mb-1.5 text-xs text-muted-foreground">
                    Written by the model from the results above. Suggestions about wording, not
                    findings about you.
                  </p>
                  <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                    {analysis.recommendations.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {analysis.missingSections.length > 0 && (
                <div>
                  <h4 className="mb-1.5 font-medium">Missing sections</h4>
                  <p className="text-muted-foreground">{analysis.missingSections.join(', ')}</p>
                </div>
              )}

              {analysis.limitations.length > 0 && (
                <div>
                  <h4 className="mb-1.5 font-medium">Limitations</h4>
                  <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                    {analysis.limitations.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
