'use client';

import { useUser } from '@clerk/nextjs';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  GitFork,
  Github,
  Loader2,
  Pin,
  RefreshCw,
  Star,
  Trash2,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

import type { Project } from '@/types';
import type { SyncStatus } from './source-types';

interface GitHubSourcePanelProps {
  syncStatus: SyncStatus;
  projects: Project[];
  onSyncStatusRefreshAction: () => void;
}

export function GitHubSourcePanel({
  syncStatus,
  projects,
  onSyncStatusRefreshAction,
}: GitHubSourcePanelProps) {
  const { user, isLoaded: isUserLoaded } = useUser();
  const [status, setStatus] = useState<'idle' | 'importing' | 'applying' | 'success' | 'error'>(
    'idle'
  );
  const [message, setMessage] = useState<string | null>(null);
  const [githubUsername, setGithubUsername] = useState(
    syncStatus.sources.github.oauthUsername || syncStatus.sources.github.profileUsername || ''
  );
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [isDeletingProject, setIsDeletingProject] = useState<string | null>(null);

  const connectedGithub = useMemo(() => {
    if (!isUserLoaded || !user) return null;
    return (
      user.externalAccounts?.find(
        (a) => a.provider === 'github' || (a.provider as string) === 'oauth_github'
      ) || null
    );
  }, [user, isUserLoaded]);

  const githubConnected = !!connectedGithub;
  const effectiveUsername = connectedGithub?.username || githubUsername.trim();

  // GitHub-sourced projects
  const githubProjects = projects.filter((p) => p.source === 'GITHUB');

  const handleConnectGitHub = async () => {
    if (!user) return;
    setIsConnecting(true);
    setConnectError(null);
    try {
      const externalAccount = await user.createExternalAccount({
        strategy: 'oauth_github',
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
    const username = effectiveUsername;
    if (!username) {
      setStatus('error');
      setMessage('Enter a GitHub username or connect your account.');
      return;
    }

    setStatus('importing');
    setMessage('Fetching GitHub data...');

    try {
      const importRes = await fetch('/api/import/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const importData = await importRes.json();
      if (!importRes.ok) throw new Error(importData.error || 'Failed to fetch GitHub data');

      setStatus('applying');
      setMessage('Merging projects & skills...');

      const ghData = importData.data;
      const syncBody = {
        source: 'GITHUB' as const,
        profile: ghData.profile || {},
        skills: (ghData.skills || []).map((s: string | { name: string }) =>
          typeof s === 'string' ? s : s.name
        ),
        projects: ghData.projects || [],
        links: ghData.links || [],
      };

      const applyRes = await fetch('/api/import/sync-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(syncBody),
      });
      const applyData = await applyRes.json();
      if (!applyRes.ok) throw new Error(applyData.error || 'Failed to merge GitHub data');

      setStatus('success');
      setMessage(applyData.message || 'GitHub data synced');
      onSyncStatusRefreshAction();
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Failed to sync GitHub');
    }
  }, [effectiveUsername, onSyncStatusRefreshAction]);

  const handleDeleteProject = useCallback(
    async (projectId: string) => {
      setIsDeletingProject(projectId);
      try {
        const res = await fetch(`/api/profile/projects/${projectId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete project');
        onSyncStatusRefreshAction();
      } catch (err) {
        console.error('Delete project error:', err);
      } finally {
        setIsDeletingProject(null);
      }
    },
    [onSyncStatusRefreshAction]
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
      {/* Connection Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            GitHub Connection
          </CardTitle>
          <CardDescription>
            {githubConnected
              ? `Connected as @${connectedGithub?.username}`
              : syncStatus.sources.github.profileUsername
                ? `Previously imported from @${syncStatus.sources.github.profileUsername}`
                : 'Connect your GitHub account or enter a username'}
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

          {/* Connection / Sync actions */}
          <div className="flex flex-wrap items-center gap-3">
            {!githubConnected ? (
              <>
                <Button
                  className="gap-2 bg-[#24292e] text-white hover:bg-[#1b1f23]"
                  onClick={handleConnectGitHub}
                  disabled={isConnecting}
                >
                  {isConnecting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Github className="h-4 w-4" />
                  )}
                  {isConnecting ? 'Connecting...' : 'Connect GitHub'}
                </Button>
                <span className="text-sm text-muted-foreground">or</span>
                <div className="flex gap-2">
                  <Input
                    placeholder="GitHub username"
                    value={githubUsername}
                    onChange={(e) => setGithubUsername(e.target.value)}
                    className="h-9 w-48"
                  />
                  {githubUsername.trim() && (
                    <Button
                      variant="outline"
                      onClick={handleSync}
                      disabled={status === 'importing' || status === 'applying'}
                    >
                      {status === 'importing' || status === 'applying' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Import'
                      )}
                    </Button>
                  )}
                </div>
              </>
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
                {syncStatus.sources.github.lastImportedAt && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Last synced {formatDate(syncStatus.sources.github.lastImportedAt)}
                  </span>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* GitHub Projects Data */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">GitHub Repositories ({githubProjects.length})</CardTitle>
          <CardDescription>
            All repositories imported from GitHub. Manage your data here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {githubProjects.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No GitHub projects imported yet.
              {githubConnected && ' Click "Sync Now" above to import your repositories.'}
            </p>
          ) : (
            <div className="space-y-3">
              {githubProjects.map((project) => (
                <GitHubProjectRow
                  key={project.id}
                  project={project}
                  isDeleting={isDeletingProject === project.id}
                  onDelete={() => handleDeleteProject(project.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Skills from GitHub */}
      {syncStatus.sources.github.skillCount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Skills from GitHub ({syncStatus.sources.github.skillCount})
            </CardTitle>
            <CardDescription>
              Programming languages and technologies detected from your repositories
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary">{syncStatus.sources.github.skillCount} skills</Badge>
              <span>imported from GitHub. Manage individual skills in the Skills section.</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Project Row ─────────────────────────────────────────────────

function GitHubProjectRow({
  project,
  isDeleting,
  onDelete,
}: {
  project: Project;
  isDeleting: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-start gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50">
      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-medium">{project.title}</h4>
          {project.githubPinned && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <Pin className="h-3 w-3" />
              Pinned
            </Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {project.customDescription || project.shortDesc || project.description?.slice(0, 120)}
          {project.description && project.description.length > 120 && !project.shortDesc && '...'}
        </p>
        {/* GitHub Stats */}
        {(project.githubStars || project.githubForks || project.githubLanguage) && (
          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            {project.githubStars != null && (
              <span className="flex items-center gap-1">
                <Star className="h-3 w-3" />
                {project.githubStars}
              </span>
            )}
            {project.githubForks != null && (
              <span className="flex items-center gap-1">
                <GitFork className="h-3 w-3" />
                {project.githubForks}
              </span>
            )}
            {project.githubLanguage && (
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-primary" />
                {project.githubLanguage}
              </span>
            )}
          </div>
        )}
        {/* Tech Stack */}
        {project.techStack && project.techStack.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {project.techStack.slice(0, 5).map((tech) => (
              <Badge key={tech} variant="outline" className="text-xs">
                {tech}
              </Badge>
            ))}
            {project.techStack.length > 5 && (
              <Badge variant="outline" className="text-xs">
                +{project.techStack.length - 5}
              </Badge>
            )}
          </div>
        )}
      </div>
      {/* Delete action (data management only, no visibility) */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={onDelete}
        disabled={isDeleting}
        title="Remove from profile"
      >
        {isDeleting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
        )}
      </Button>
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
