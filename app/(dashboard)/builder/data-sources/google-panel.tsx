'use client';

import { useUser } from '@clerk/nextjs';
import { AlertCircle, CheckCircle2, Clock, Loader2, RefreshCw } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import type { SyncStatus } from './source-types';

// ─── Google SVG Icon ──────────────────────────────────────────────
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

interface GoogleSourcePanelProps {
  syncStatus: SyncStatus;
  onSyncStatusRefreshAction: () => void;
}

export function GoogleSourcePanel({
  syncStatus,
  onSyncStatusRefreshAction,
}: GoogleSourcePanelProps) {
  const { user, isLoaded: isUserLoaded } = useUser();
  const [status, setStatus] = useState<'idle' | 'importing' | 'applying' | 'success' | 'error'>(
    'idle'
  );
  const [message, setMessage] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const connectedGoogle = useMemo(() => {
    if (!isUserLoaded || !user) return null;
    return (
      user.externalAccounts?.find((a) => {
        const p = a.provider as string;
        return p === 'google' || p === 'oauth_google' || p === 'google_oidc';
      }) || null
    );
  }, [user, isUserLoaded]);

  const googleConnected = !!connectedGoogle || syncStatus.sources.google.connected;

  const displayInfo = useMemo(() => {
    const src = syncStatus.sources.google;
    return {
      displayName:
        src.oauthName ||
        (connectedGoogle
          ? `${connectedGoogle.firstName || ''} ${connectedGoogle.lastName || ''}`.trim()
          : null),
      avatarUrl: src.avatarUrl || connectedGoogle?.imageUrl || null,
      email: src.emailAddress || connectedGoogle?.emailAddress || null,
    };
  }, [syncStatus, connectedGoogle]);

  const handleConnect = async () => {
    if (!user) return;
    setIsConnecting(true);
    setConnectError(null);
    try {
      const externalAccount = await user.createExternalAccount({
        strategy: 'oauth_google',
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
    setMessage('Fetching Google data...');

    try {
      const importRes = await fetch('/api/import/google/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saveToProfile: true }),
      });
      const importData = await importRes.json();
      if (!importRes.ok) throw new Error(importData.error || 'Failed to fetch Google data');

      if (importData.data) {
        setStatus('applying');
        setMessage('Merging profile data...');

        const gData = importData.data;
        const applyRes = await fetch('/api/import/sync-apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'GOOGLE',
            profile: gData.profile || {},
            links: gData.links || [],
          }),
        });
        const applyData = await applyRes.json();
        if (!applyRes.ok) throw new Error(applyData.error || 'Failed to merge Google data');

        setStatus('success');
        setMessage(applyData.message || 'Google data synced');
      } else {
        setStatus('success');
        setMessage('Google account synced (no new data to import)');
      }

      onSyncStatusRefreshAction();
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Failed to sync Google');
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
            <GoogleIcon className="h-5 w-5" />
            Google Connection
          </CardTitle>
          <CardDescription>
            {googleConnected
              ? `Connected as ${displayInfo.displayName || displayInfo.email || 'Google User'}`
              : 'Connect your Google account to import profile data'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Connected account preview */}
          {googleConnected && displayInfo.avatarUrl && (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
              <div className="relative h-10 w-10 overflow-hidden rounded-full">
                <Image
                  src={displayInfo.avatarUrl}
                  alt={displayInfo.displayName || 'Google'}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
              <div className="min-w-0 flex-1">
                {displayInfo.displayName && (
                  <p className="truncate text-sm font-medium">{displayInfo.displayName}</p>
                )}
                {displayInfo.email && (
                  <p className="truncate text-xs text-muted-foreground">{displayInfo.email}</p>
                )}
              </div>
            </div>
          )}

          {/* Status messages */}
          {status === 'success' && message && (
            <div className="rounded-md bg-primary/10 p-3 text-sm text-primary">
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
            {!googleConnected ? (
              <Button
                variant="outline"
                className="gap-2"
                onClick={handleConnect}
                disabled={isConnecting}
              >
                {isConnecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <GoogleIcon className="h-4 w-4" />
                )}
                {isConnecting ? 'Connecting...' : 'Connect Google'}
              </Button>
            ) : (
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="bg-primary/10 text-primary">
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
                {syncStatus.sources.google.lastImportedAt && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Last synced {formatDate(syncStatus.sources.google.lastImportedAt)}
                  </span>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Imported Data */}
      {googleConnected &&
        (displayInfo.displayName || displayInfo.email || displayInfo.avatarUrl) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Data from Google</CardTitle>
              <CardDescription>Information available from your Google account</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {displayInfo.displayName && (
                  <DataRow label="Name" value={displayInfo.displayName} />
                )}
                {displayInfo.email && <DataRow label="Email" value={displayInfo.email} />}
                {displayInfo.avatarUrl && <DataRow label="Profile Photo" value="Available" />}
              </div>
            </CardContent>
          </Card>
        )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border px-4 py-3">
      <span className="text-sm font-medium">{label}</span>
      <span className="text-sm text-muted-foreground">{value}</span>
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
