'use client';

import { useUser } from '@clerk/nextjs';
import { AlertCircle, CheckCircle2, Clock, Linkedin, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import type { SyncStatus } from './source-types';

interface LinkedInSourcePanelProps {
  syncStatus: SyncStatus;
  onSyncStatusRefreshAction: () => void;
}

export function LinkedInSourcePanel({
  syncStatus,
  onSyncStatusRefreshAction,
}: LinkedInSourcePanelProps) {
  const { user, isLoaded: isUserLoaded } = useUser();
  const [status, setStatus] = useState<'idle' | 'importing' | 'applying' | 'success' | 'error'>(
    'idle'
  );
  const [message, setMessage] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const connectedLinkedin = useMemo(() => {
    if (!isUserLoaded || !user) return null;
    return (
      user.externalAccounts?.find((a) => {
        const p = a.provider as string;
        return (
          p === 'linkedin_oidc' ||
          p === 'linkedin' ||
          p === 'oauth_linkedin_oidc' ||
          p === 'oauth_linkedin'
        );
      }) || null
    );
  }, [user, isUserLoaded]);

  const linkedinConnected = !!connectedLinkedin;

  const handleConnect = async () => {
    if (!user) return;
    setIsConnecting(true);
    setConnectError(null);
    try {
      const externalAccount = await user.createExternalAccount({
        strategy: 'oauth_linkedin_oidc',
        redirectUrl: window.location.href,
      });
      const url = externalAccount?.verification?.externalVerificationRedirectURL;
      if (url) window.location.href = url.toString();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already connected')) {
        await user.reload();
      } else {
        setConnectError(`Connection failed: ${msg}`);
      }
      setIsConnecting(false);
    }
  };

  const handleSync = useCallback(async () => {
    setStatus('importing');
    setMessage('Fetching LinkedIn data...');

    try {
      const importRes = await fetch('/api/import/linkedin/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const importData = await importRes.json();
      if (!importRes.ok) throw new Error(importData.error || 'Failed to fetch LinkedIn data');

      setStatus('applying');
      setMessage('Merging profile data...');

      const liData = importData.data;
      const syncBody = {
        source: 'LINKEDIN' as const,
        profile: liData.profile || {},
        experiences: liData.experiences || [],
        educations: liData.educations || [],
        skills: (liData.skills || []).map((s: string | { name: string }) =>
          typeof s === 'string' ? s : s.name
        ),
        links: liData.links || [],
      };

      const applyRes = await fetch('/api/import/sync-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(syncBody),
      });
      const applyData = await applyRes.json();
      if (!applyRes.ok) throw new Error(applyData.error || 'Failed to merge LinkedIn data');

      setStatus('success');
      setMessage(applyData.message || 'LinkedIn data synced');
      onSyncStatusRefreshAction();
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Failed to sync LinkedIn');
    }
  }, [onSyncStatusRefreshAction]);

  if (!isUserLoaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Connection Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Linkedin className="h-5 w-5 text-[#0A66C2]" />
            LinkedIn Connection
          </CardTitle>
          <CardDescription>
            {linkedinConnected
              ? `Connected as ${connectedLinkedin?.firstName || connectedLinkedin?.username || 'User'}`
              : syncStatus.sources.linkedin.oauthName
                ? `Previously connected (${syncStatus.sources.linkedin.oauthName})`
                : 'Connect your LinkedIn account to import profile data'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status messages */}
          {status === 'success' && message && (
            <div className="rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950/30 dark:text-green-400">
              <CheckCircle2 className="mb-0.5 mr-1 inline h-4 w-4" />
              {message}
            </div>
          )}
          {(status === 'error' || connectError) && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mb-0.5 mr-1 inline h-4 w-4" />
              {connectError || message}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            {!linkedinConnected ? (
              <Button
                className="gap-2 bg-[#0A66C2] text-white hover:bg-[#004182]"
                onClick={handleConnect}
                disabled={isConnecting}
              >
                {isConnecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Linkedin className="h-4 w-4" />
                )}
                {isConnecting ? 'Connecting...' : 'Connect LinkedIn'}
              </Button>
            ) : (
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="bg-green-500/10 text-green-600">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Connected
                </Badge>
                <Button
                  variant="outline"
                  onClick={handleSync}
                  disabled={status === 'importing' || status === 'applying'}
                  className="gap-2"
                >
                  {status === 'importing' || status === 'applying' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {status === 'importing'
                    ? 'Fetching...'
                    : status === 'applying'
                      ? 'Merging...'
                      : 'Sync Now'}
                </Button>
                {syncStatus.sources.linkedin.lastImportedAt && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Last synced {formatDate(syncStatus.sources.linkedin.lastImportedAt)}
                  </span>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Imported Data */}
      {syncStatus.sources.linkedin.lastImportedAt && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Imported Data</CardTitle>
            <CardDescription>Items extracted from your LinkedIn profile</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <DataRow
                label="Experiences (from LinkedIn)"
                count={syncStatus.manualEdits.experiences.fromLinkedIn}
              />
              <DataRow label="Education" count={syncStatus.manualEdits.educations.fromResume} />
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Manage individual items in their respective Builder sections (Experience, Education,
              etc.)
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────

function DataRow({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between rounded-lg border px-4 py-3">
      <span className="text-sm font-medium">{label}</span>
      <Badge variant="secondary">{count} items</Badge>
    </div>
  );
}

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
