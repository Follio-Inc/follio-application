'use client';

import { useUser } from '@clerk/nextjs';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Github, Linkedin, Loader2, Plus, RefreshCw } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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

// ─── Connection Card Config ────────────────────────────────────────

interface ConnectionConfig {
  key: 'github' | 'linkedin' | 'google';
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  brandColor: string;
  oauthStrategy: string;
}

const CONNECTIONS: ConnectionConfig[] = [
  {
    key: 'github',
    label: 'GitHub',
    icon: Github,
    brandColor: 'text-foreground',
    oauthStrategy: 'oauth_github',
  },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    icon: Linkedin,
    brandColor: 'text-[#0A66C2]',
    oauthStrategy: 'oauth_linkedin_oidc',
  },
  {
    key: 'google',
    label: 'Google',
    icon: GoogleIcon,
    brandColor: 'text-[#4285F4]',
    oauthStrategy: 'oauth_google',
  },
];

// ─── Helpers ────────────────────────────────────────────────────

function getConnectionInfo(
  key: 'github' | 'linkedin' | 'google',
  syncStatus: SyncStatus
): {
  connected: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
} {
  switch (key) {
    case 'github':
      return {
        connected: syncStatus.sources.github.connected,
        displayName: syncStatus.sources.github.oauthUsername
          ? `@${syncStatus.sources.github.oauthUsername}`
          : null,
        avatarUrl: syncStatus.sources.github.avatarUrl || null,
        email: syncStatus.sources.github.emailAddress || null,
      };
    case 'linkedin':
      return {
        connected: syncStatus.sources.linkedin.connected,
        displayName: syncStatus.sources.linkedin.oauthName || null,
        avatarUrl: syncStatus.sources.linkedin.avatarUrl || null,
        email: syncStatus.sources.linkedin.emailAddress || null,
      };
    case 'google':
      return {
        connected: syncStatus.sources.google.connected,
        displayName: syncStatus.sources.google.oauthName || null,
        avatarUrl: syncStatus.sources.google.avatarUrl || null,
        email: syncStatus.sources.google.emailAddress || null,
      };
  }
}

// ─── Main Component ─────────────────────────────────────────────

interface ConnectionCardsProps {
  /** If provided, uses this sync status. Otherwise fetches its own. */
  syncStatus?: SyncStatus | null;
  onRefreshAction?: () => void;
}

export function ConnectionCards({
  syncStatus: externalSyncStatus,
  onRefreshAction,
}: ConnectionCardsProps) {
  const { user, isLoaded } = useUser();
  const [connecting, setConnecting] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Self-fetching sync status when not provided externally
  const [internalSyncStatus, setInternalSyncStatus] = useState<SyncStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(!externalSyncStatus);

  const fetchSyncStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/import/sync-status');
      if (res.ok) {
        const data: SyncStatus = await res.json();
        setInternalSyncStatus(data);
      }
    } catch {
      // silently fail
    } finally {
      setIsLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    if (!externalSyncStatus) {
      fetchSyncStatus();
    }
  }, [externalSyncStatus, fetchSyncStatus]);

  const syncStatus = externalSyncStatus ?? internalSyncStatus;

  const handleRefresh = useCallback(() => {
    if (onRefreshAction) {
      onRefreshAction();
    } else {
      fetchSyncStatus();
    }
  }, [onRefreshAction, fetchSyncStatus]);

  const externalAccounts = useMemo(() => {
    if (!isLoaded || !user) return [];
    return user.externalAccounts || [];
  }, [user, isLoaded]);

  const isConnected = useCallback(
    (key: 'github' | 'linkedin' | 'google') => {
      if (syncStatus) {
        const info = getConnectionInfo(key, syncStatus);
        if (info.connected) return true;
      }
      // Also check Clerk directly for immediate state after connect
      return externalAccounts.some((a) => {
        const p = a.provider as string;
        if (key === 'github') return p === 'github' || p === 'oauth_github';
        if (key === 'linkedin')
          return (
            p === 'linkedin' ||
            p === 'linkedin_oidc' ||
            p === 'oauth_linkedin_oidc' ||
            p === 'oauth_linkedin'
          );
        if (key === 'google') return p === 'google' || p === 'oauth_google' || p === 'google_oidc';
        return false;
      });
    },
    [syncStatus, externalAccounts]
  );

  const getAvatarFromClerk = useCallback(
    (key: 'github' | 'linkedin' | 'google') => {
      const account = externalAccounts.find((a) => {
        const p = a.provider as string;
        if (key === 'github') return p === 'github' || p === 'oauth_github';
        if (key === 'linkedin')
          return (
            p === 'linkedin' ||
            p === 'linkedin_oidc' ||
            p === 'oauth_linkedin_oidc' ||
            p === 'oauth_linkedin'
          );
        if (key === 'google') return p === 'google' || p === 'oauth_google' || p === 'google_oidc';
        return false;
      });
      return account?.imageUrl || null;
    },
    [externalAccounts]
  );

  const getDisplayInfo = useCallback(
    (key: 'github' | 'linkedin' | 'google') => {
      const info = syncStatus
        ? getConnectionInfo(key, syncStatus)
        : { displayName: null, avatarUrl: null, email: null };
      // Get real-time info from Clerk external accounts as fallback
      const account = externalAccounts.find((a) => {
        const p = a.provider as string;
        if (key === 'github') return p === 'github' || p === 'oauth_github';
        if (key === 'linkedin')
          return (
            p === 'linkedin' ||
            p === 'linkedin_oidc' ||
            p === 'oauth_linkedin_oidc' ||
            p === 'oauth_linkedin'
          );
        if (key === 'google') return p === 'google' || p === 'oauth_google' || p === 'google_oidc';
        return false;
      });

      return {
        displayName:
          info.displayName ||
          (account
            ? key === 'github'
              ? `@${account.username || ''}`
              : `${account.firstName || ''} ${account.lastName || ''}`.trim()
            : null),
        avatarUrl: info.avatarUrl || account?.imageUrl || null,
        email: info.email || account?.emailAddress || null,
      };
    },
    [syncStatus, externalAccounts]
  );

  const handleConnect = useCallback(
    async (config: ConnectionConfig) => {
      if (!user) return;
      setConnecting(config.key);
      setError(null);
      try {
        const externalAccount = await user.createExternalAccount({
          strategy: config.oauthStrategy as Parameters<
            typeof user.createExternalAccount
          >[0]['strategy'],
          redirectUrl: window.location.href,
        });
        const url = externalAccount?.verification?.externalVerificationRedirectURL;
        if (url) window.location.href = url.toString();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('already connected')) {
          await user.reload();
          handleRefresh();
        } else {
          setError(`Failed to connect ${config.label}: ${msg}`);
        }
        setConnecting(null);
      }
    },
    [user, handleRefresh]
  );

  const handleSync = useCallback(
    async (key: 'github' | 'linkedin' | 'google') => {
      setSyncing(key);
      setError(null);
      try {
        if (key === 'github') {
          const username =
            syncStatus?.sources.github.oauthUsername || syncStatus?.sources.github.profileUsername;
          if (!username) throw new Error('No GitHub username found');
          const importRes = await fetch('/api/import/github', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username }),
          });
          const importData = await importRes.json();
          if (!importRes.ok) throw new Error(importData.error || 'Failed');
          const ghData = importData.data;
          const applyRes = await fetch('/api/import/sync-apply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              source: 'GITHUB',
              profile: ghData.profile || {},
              skills: (ghData.skills || []).map((s: string | { name: string }) =>
                typeof s === 'string' ? s : s.name
              ),
              projects: ghData.projects || [],
              links: ghData.links || [],
            }),
          });
          if (!applyRes.ok) {
            const d = await applyRes.json();
            throw new Error(d.error || 'Failed');
          }
        } else if (key === 'linkedin') {
          const importRes = await fetch('/api/import/linkedin/oauth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          const importData = await importRes.json();
          if (!importRes.ok) throw new Error(importData.error || 'Failed');
          const liData = importData.data;
          const applyRes = await fetch('/api/import/sync-apply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              source: 'LINKEDIN',
              profile: liData.profile || {},
              experiences: liData.experiences || [],
              educations: liData.educations || [],
              skills: (liData.skills || []).map((s: string | { name: string }) =>
                typeof s === 'string' ? s : s.name
              ),
              links: liData.links || [],
            }),
          });
          if (!applyRes.ok) {
            const d = await applyRes.json();
            throw new Error(d.error || 'Failed');
          }
        } else if (key === 'google') {
          const importRes = await fetch('/api/import/google/oauth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ saveToProfile: true }),
          });
          const importData = await importRes.json();
          if (!importRes.ok) throw new Error(importData.error || 'Failed');
          if (importData.data) {
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
            if (!applyRes.ok) {
              const d = await applyRes.json();
              throw new Error(d.error || 'Failed');
            }
          }
        }
        handleRefresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Sync failed');
      } finally {
        setSyncing(null);
      }
    },
    [syncStatus, handleRefresh]
  );

  if (!isLoaded || isLoadingStatus || !syncStatus) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {CONNECTIONS.map((config) => {
          const connected = isConnected(config.key);
          const info = getDisplayInfo(config.key);
          const avatarUrl = info.avatarUrl || getAvatarFromClerk(config.key);
          const isConnecting = connecting === config.key;
          const isSyncing = syncing === config.key;

          return (
            <motion.div
              key={config.key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: CONNECTIONS.indexOf(config) * 0.08 }}
            >
              <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-5 transition-all duration-300 hover:shadow-sm">
                {/* Connected indicator */}
                <AnimatePresence>
                  {connected && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      className="absolute right-3 top-3 z-10"
                    >
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-success shadow-sm">
                        <CheckCircle2 className="h-3.5 w-3.5 text-success-foreground" />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Avatar & Logo Section */}
                <div className="relative mb-4 flex items-center justify-center">
                  <AnimatePresence mode="wait">
                    {connected && avatarUrl ? (
                      <motion.div
                        key="avatar"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                        className="relative"
                      >
                        {/* User avatar - large */}
                        <div className="relative h-20 w-20 overflow-hidden rounded-full ring-2 ring-background">
                          <Image
                            src={avatarUrl}
                            alt={info.displayName || config.label}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        </div>
                        {/* Provider badge - small, overlaid */}
                        <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-background shadow-sm">
                          <config.icon className={cn('h-3.5 w-3.5', config.brandColor)} />
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="logo"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                        className="flex h-16 w-16 items-center justify-center rounded-xl bg-muted"
                      >
                        <config.icon className={cn('h-8 w-8', config.brandColor)} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Name & Info */}
                <div className="space-y-1 text-center">
                  <h3 className="text-sm font-semibold text-foreground">{config.label}</h3>

                  <AnimatePresence mode="wait">
                    {connected ? (
                      <motion.div
                        key="connected-info"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="space-y-0.5"
                      >
                        {info.displayName && (
                          <p className="truncate text-xs font-medium text-foreground/80">
                            {info.displayName}
                          </p>
                        )}
                        {info.email && (
                          <p className="truncate text-[11px] text-muted-foreground">{info.email}</p>
                        )}
                      </motion.div>
                    ) : (
                      <motion.p
                        key="not-connected"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-xs text-muted-foreground"
                      >
                        Not connected
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                {/* Action Button */}
                <div className="mt-4">
                  {!connected ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-1.5 text-xs"
                      onClick={() => handleConnect(config)}
                      disabled={isConnecting}
                    >
                      {isConnecting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                      {isConnecting ? 'Connecting...' : 'Connect'}
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => handleSync(config.key)}
                      disabled={isSyncing}
                    >
                      {isSyncing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      {isSyncing ? 'Syncing...' : 'Sync'}
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Error message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
