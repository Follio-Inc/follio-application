'use client';

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Github,
  Linkedin,
  Loader2,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { DataSourceConnection } from '@prisma/client';

interface DataSourcesSectionProps {
  dataSources: DataSourceConnection[];
}

export function DataSourcesSection({ dataSources }: DataSourcesSectionProps) {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState<string | null>(null);
  const [showGithubInput, setShowGithubInput] = useState(false);
  const [githubUsername, setGithubUsername] = useState('');
  const [error, setError] = useState<string | null>(null);

  const getSourceStatus = (source: string) => {
    const connection = dataSources.find((ds) => ds.source === source);
    return connection;
  };

  const handleReimport = async (source: string, externalId?: string) => {
    setIsRefreshing(source);
    setError(null);

    try {
      if (source === 'GITHUB') {
        const username = externalId || githubUsername;
        if (!username) {
          setShowGithubInput(true);
          setIsRefreshing(null);
          return;
        }

        const response = await fetch('/api/import/github', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to import from GitHub');
        }

        setShowGithubInput(false);
        setGithubUsername('');
        router.refresh();
      } else if (source === 'RESUME') {
        // Trigger file upload
        document.getElementById('resume-reimport')?.click();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setIsRefreshing(null);
    }
  };

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsRefreshing('RESUME');
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/import/resume', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to parse resume');
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setIsRefreshing(null);
    }
  };

  const handleDisconnect = async (source: string) => {
    setIsRefreshing(source);
    setError(null);

    try {
      const response = await fetch('/api/data-sources/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to disconnect');
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnect failed');
    } finally {
      setIsRefreshing(null);
    }
  };

  const formatDate = (date: Date | null) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const githubConnection = getSourceStatus('GITHUB');
  const resumeConnection = getSourceStatus('RESUME');
  const linkedInConnection = getSourceStatus('LINKEDIN');

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Data Sources</h2>
        <p className="text-sm text-muted-foreground">Manage where your profile data comes from</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Resume Source */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                  <Upload className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <CardTitle className="text-base">Resume</CardTitle>
                  <CardDescription className="text-xs">PDF or text file</CardDescription>
                </div>
              </div>
              <StatusBadge status={resumeConnection?.status || 'NOT_CONNECTED'} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDate(resumeConnection?.lastImportedAt || null)}
              </span>
              {resumeConnection?.itemsImported ? (
                <span>{resumeConnection.itemsImported} items</span>
              ) : null}
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleReimport('RESUME')}
                disabled={isRefreshing === 'RESUME'}
                className="flex-1"
              >
                {isRefreshing === 'RESUME' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <RefreshCw className="mr-1 h-3 w-3" />
                    {resumeConnection ? 'Re-import' : 'Upload'}
                  </>
                )}
              </Button>
            </div>
            <input
              id="resume-reimport"
              type="file"
              accept=".pdf,.txt,.doc,.docx"
              className="hidden"
              onChange={handleResumeUpload}
            />
          </CardContent>
        </Card>

        {/* GitHub Source */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-500/10">
                  <Github className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">GitHub</CardTitle>
                  <CardDescription className="text-xs">
                    {githubConnection?.externalId
                      ? `@${githubConnection.externalId}`
                      : 'Projects & skills'}
                  </CardDescription>
                </div>
              </div>
              <StatusBadge status={githubConnection?.status || 'NOT_CONNECTED'} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDate(githubConnection?.lastImportedAt || null)}
              </span>
              {githubConnection?.itemsImported ? (
                <span>{githubConnection.itemsImported} items</span>
              ) : null}
            </div>

            {showGithubInput && !githubConnection && (
              <div className="mt-3 flex gap-2">
                <Input
                  placeholder="GitHub username"
                  value={githubUsername}
                  onChange={(e) => setGithubUsername(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleReimport('GITHUB', githubUsername)}
                  className="text-sm"
                />
                <Button
                  size="sm"
                  onClick={() => handleReimport('GITHUB', githubUsername)}
                  disabled={isRefreshing === 'GITHUB'}
                >
                  {isRefreshing === 'GITHUB' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Connect'
                  )}
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setShowGithubInput(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {!showGithubInput && (
              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleReimport('GITHUB', githubConnection?.externalId || undefined)
                  }
                  disabled={isRefreshing === 'GITHUB'}
                  className="flex-1"
                >
                  {isRefreshing === 'GITHUB' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <RefreshCw className="mr-1 h-3 w-3" />
                      {githubConnection ? 'Re-import' : 'Connect'}
                    </>
                  )}
                </Button>
                {githubConnection && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDisconnect('GITHUB')}
                    disabled={isRefreshing === 'GITHUB'}
                  >
                    Disconnect
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* LinkedIn Source (Coming Soon) */}
        <Card className="opacity-60">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/10">
                  <Linkedin className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-base">LinkedIn</CardTitle>
                  <CardDescription className="text-xs">Work history</CardDescription>
                </div>
              </div>
              <Badge variant="secondary">Coming Soon</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              LinkedIn import is under development. Stay tuned!
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'CONNECTED':
      return (
        <Badge variant="default" className="gap-1 bg-green-500/10 text-green-600">
          <CheckCircle2 className="h-3 w-3" />
          Connected
        </Badge>
      );
    case 'IMPORTING':
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Importing
        </Badge>
      );
    case 'ERROR':
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          Error
        </Badge>
      );
    default:
      return <Badge variant="outline">Not connected</Badge>;
  }
}
