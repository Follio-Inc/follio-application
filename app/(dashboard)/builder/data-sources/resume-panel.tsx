'use client';

import { useUser } from '@clerk/nextjs';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  RefreshCw,
  Upload,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { ResumeReviewWizard } from './resume-review-wizard';
import type { SyncStatus } from './source-types';

interface ResumeSourcePanelProps {
  syncStatus: SyncStatus;
  onSyncStatusRefreshAction: () => void;
}

interface ImportTimelineEntry {
  id: string;
  type: 'session' | 'log';
  label: string;
  date: string;
  itemsFound: number;
  itemsApplied: number | null;
  status: string;
}

export function ResumeSourcePanel({
  syncStatus,
  onSyncStatusRefreshAction,
}: ResumeSourcePanelProps) {
  const { isLoaded: isUserLoaded } = useUser();
  const [status, setStatus] = useState<'idle' | 'importing' | 'previewing' | 'success' | 'error'>(
    'idle'
  );
  const [message, setMessage] = useState<string | null>(null);
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);

  // Preview dialog state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<Record<string, unknown> | null>(null);
  const [parsedResumeData, setParsedResumeData] = useState<Record<string, unknown> | null>(null);

  // Session persistence
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [hasPendingSession, setHasPendingSession] = useState(false);

  // Import history timeline
  const [importHistory, setImportHistory] = useState<ImportTimelineEntry[]>([]);
  const [historyPage, setHistoryPage] = useState(0);
  const HISTORY_PAGE_SIZE = 5;

  const paginatedHistory = useMemo(() => {
    const start = historyPage * HISTORY_PAGE_SIZE;
    return importHistory.slice(start, start + HISTORY_PAGE_SIZE);
  }, [importHistory, historyPage]);

  const totalHistoryPages = Math.ceil(importHistory.length / HISTORY_PAGE_SIZE);

  const resumeInfo = syncStatus.sources.resume;

  // ── Check for pending import session on mount ──
  useEffect(() => {
    async function checkPendingSession() {
      try {
        const res = await fetch('/api/import/sessions?source=RESUME');
        const data = await res.json();
        if (data.session) {
          setHasPendingSession(true);
          setSessionId(data.session.id);
          setParsedResumeData(data.session.parsedData);
          setPreviewData(data.session.previewData);
        }
      } catch {
        // Silent fail — non-critical
      }
    }
    checkPendingSession();
  }, []);

  // ── Fetch import history timeline ──
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/import/sessions?source=RESUME&history=true');
      const data = await res.json();
      if (data.history) {
        setImportHistory(data.history);
      }
    } catch {
      // Silent fail
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleResumeUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setStatus('error');
      setMessage('Only PDF files are supported.');
      return;
    }

    setResumeFileName(file.name);
    setStatus('importing');
    setMessage('Scanning your resume...');

    try {
      // Step 1: Parse the resume
      const formData = new FormData();
      formData.append('file', file);
      formData.append('saveToProfile', 'false');

      const parseRes = await fetch('/api/import/resume', { method: 'POST', body: formData });
      const parseData = await parseRes.json();
      if (!parseRes.ok) throw new Error(parseData.error || 'Failed to parse resume');

      const resumeResult = parseData.data;
      const syncBody = {
        source: 'RESUME' as const,
        profile: resumeResult.profile || {},
        experiences: resumeResult.experiences || [],
        educations: resumeResult.educations || [],
        skills: (resumeResult.skills || []).map((s: string | { name: string }) =>
          typeof s === 'string' ? s : s.name
        ),
        projects: resumeResult.projects || [],
        links: resumeResult.links || [],
        contactInfo: resumeResult.contactInfo || {},
      };

      // Step 2: Get merge preview (dry run)
      setStatus('previewing');
      setMessage('Comparing with your profile...');

      const previewRes = await fetch('/api/import/sync-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(syncBody),
      });
      const previewResult = await previewRes.json();
      if (!previewRes.ok) throw new Error(previewResult.error || 'Failed to generate preview');

      // Step 3: Create an import session (persists the proposed changes)
      const sessionRes = await fetch('/api/import/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'RESUME',
          parsedData: syncBody,
          previewData: previewResult.preview,
          sourceLabel: file.name,
          proposedCount: previewResult.preview?.summary?.totalNew || 0,
        }),
      });
      const sessionData = await sessionRes.json();

      // Step 4: Open the preview dialog
      setSessionId(sessionData.session?.id || null);
      setParsedResumeData(syncBody);
      setPreviewData(previewResult.preview);
      setPreviewOpen(true);
      setHasPendingSession(true);
      setStatus('idle');
      setMessage(null);
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Failed to scan resume');
    }

    e.target.value = '';
  }, []);

  const handleApplyComplete = useCallback(
    (resultMessage: string) => {
      setStatus('success');
      setMessage(resultMessage);
      setPreviewData(null);
      setParsedResumeData(null);
      setSessionId(null);
      setHasPendingSession(false);
      onSyncStatusRefreshAction();
      fetchHistory();
    },
    [onSyncStatusRefreshAction, fetchHistory]
  );

  if (!isUserLoaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Pending session banner ── */}
      {hasPendingSession && !previewOpen && (
        <Card className="border-border bg-muted/50">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">You have suggested updates waiting for review</p>
                <p className="text-xs text-muted-foreground">
                  Your profile hasn&apos;t changed — review when you&apos;re ready.
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
              Review Updates
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Connection / Import Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            Resume
          </CardTitle>
          <CardDescription>
            {resumeInfo.hasBeenImported
              ? `Last imported ${formatDate(resumeInfo.lastImportedAt)}`
              : 'Upload a PDF resume to bring in your professional data'}
          </CardDescription>
          {resumeInfo.hasBeenImported && (
            <p className="mt-1 text-xs text-muted-foreground">
              We&apos;ll scan your resume and suggest updates. Nothing will change until you review
              and confirm.
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status messages */}
          {status === 'success' && message && (
            <div className="rounded-md bg-primary/10 p-3 text-sm text-primary">
              <CheckCircle2 className="mb-0.5 mr-1 inline h-4 w-4" />
              {message}
            </div>
          )}
          {status === 'error' && message && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mb-0.5 mr-1 inline h-4 w-4" />
              {message}
            </div>
          )}

          {/* Upload button */}
          <div className="flex items-center gap-3">
            <Button
              variant={resumeInfo.hasBeenImported ? 'outline' : 'default'}
              onClick={() => document.getElementById('data-source-resume-upload')?.click()}
              disabled={status === 'importing' || status === 'previewing'}
              className="gap-2"
            >
              {status === 'importing' || status === 'previewing' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : resumeInfo.hasBeenImported ? (
                <RefreshCw className="h-4 w-4" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {status === 'importing'
                ? 'Scanning...'
                : status === 'previewing'
                  ? 'Comparing with your profile...'
                  : resumeInfo.hasBeenImported
                    ? 'Upload New Resume'
                    : 'Upload Resume (PDF)'}
            </Button>
            {resumeFileName && status === 'success' && (
              <Badge variant="secondary" className="max-w-[200px] truncate text-xs">
                {resumeFileName}
              </Badge>
            )}
          </div>

          <input
            id="data-source-resume-upload"
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={handleResumeUpload}
          />
        </CardContent>
      </Card>

      {/* ── Import Timeline ── */}
      {importHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Import History</CardTitle>
            <CardDescription>Timeline of resume imports</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative space-y-0">
              {paginatedHistory.map((entry, index) => (
                <div key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {/* Timeline line */}
                  {index < paginatedHistory.length - 1 && (
                    <div className="absolute left-[11px] top-6 h-[calc(100%-12px)] w-px bg-border" />
                  )}
                  {/* Dot */}
                  <div className="relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-background">
                    {entry.status === 'APPLIED' ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    ) : entry.status === 'DISCARDED' ? (
                      <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : entry.status === 'PENDING_REVIEW' ? (
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-medium">{entry.label}</p>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(entry.date)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {entry.itemsFound} items found
                      </span>
                      {entry.status === 'APPLIED' && entry.itemsApplied != null && (
                        <Badge variant="secondary" className="h-4 text-[10px]">
                          {entry.itemsApplied} applied
                        </Badge>
                      )}
                      {entry.status === 'DISCARDED' && (
                        <Badge variant="outline" className="h-4 text-[10px] text-muted-foreground">
                          discarded
                        </Badge>
                      )}
                      {entry.status === 'PENDING_REVIEW' && (
                        <Badge variant="outline" className="h-4 text-[10px] text-muted-foreground">
                          pending review
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalHistoryPages > 1 && (
              <div className="mt-4 flex items-center justify-between border-t pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setHistoryPage((p) => p - 1)}
                  disabled={historyPage === 0}
                  className="h-7 text-xs"
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  {historyPage + 1} of {totalHistoryPages}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setHistoryPage((p) => p + 1)}
                  disabled={historyPage >= totalHistoryPages - 1}
                  className="h-7 text-xs"
                >
                  Next
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Resume Import Review Wizard */}
      {previewData && parsedResumeData && (
        <ResumeReviewWizard
          open={previewOpen}
          onOpenChangeAction={(open) => {
            setPreviewOpen(open);
            if (!open) {
              // Wizard was closed via confirmed discard — clear pending state
              setHasPendingSession(false);
              setPreviewData(null);
              setParsedResumeData(null);
              setSessionId(null);
              fetchHistory();
            }
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          preview={previewData as any}
          parsedData={parsedResumeData}
          onApplyCompleteAction={handleApplyComplete}
          sessionId={sessionId || undefined}
        />
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
