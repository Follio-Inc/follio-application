'use client';

import { useUser } from '@clerk/nextjs';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileText,
  Github,
  Linkedin,
  Link as LinkIcon,
  Loader2,
  Plus,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

// Storage key prefix for persisting onboarding state across OAuth redirects
const ONBOARDING_IMPORT_STATE_KEY_PREFIX = 'follio_onboarding_import_state_';

// Helper to get user-specific storage key
const getStorageKey = (userId: string | undefined) => {
  return userId ? `${ONBOARDING_IMPORT_STATE_KEY_PREFIX}${userId}` : null;
};

type ImportSource = 'resume' | 'github' | 'linkedin' | 'links';

interface ImportStatus {
  source: ImportSource;
  status: 'idle' | 'importing' | 'success' | 'error';
  message?: string;
  itemsImported?: number;
}

interface ManualLink {
  url: string;
  label?: string;
}

// Persisted state interface for sessionStorage
interface PersistedImportState {
  imports: Record<ImportSource, ImportStatus>;
  importedData: Record<string, unknown>;
  githubUsername: string;
}

export default function OnboardingImportPage() {
  const router = useRouter();
  const { user, isLoaded: isUserLoaded } = useUser();
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRestoredPersistedState, setHasRestoredPersistedState] = useState(false);

  // GitHub OAuth states
  const [githubConnecting, setGithubConnecting] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);

  // LinkedIn OAuth states
  const [linkedinConnecting, setLinkedinConnecting] = useState(false);
  const [linkedinError, setLinkedinError] = useState<string | null>(null);

  // Import states
  const [imports, setImports] = useState<Record<ImportSource, ImportStatus>>({
    resume: { source: 'resume', status: 'idle' },
    github: { source: 'github', status: 'idle' },
    linkedin: { source: 'linkedin', status: 'idle' },
    links: { source: 'links', status: 'idle' },
  });

  // Form states
  const [githubUsername, setGithubUsername] = useState('');
  const [manualLinks, setManualLinks] = useState<ManualLink[]>([{ url: '' }]);
  const [showLinksForm, setShowLinksForm] = useState(false);

  // Imported data (for display)
  const [importedData, setImportedData] = useState<Record<string, unknown>>({});

  // Get connected GitHub account from Clerk
  const connectedGithub = user?.externalAccounts?.find((a) => a.provider === 'github');
  const githubUsernameFromAccount = connectedGithub?.username ?? null;

  // Get connected LinkedIn account from Clerk (check multiple possible provider names)
  const connectedLinkedin = user?.externalAccounts?.find(
    (a) =>
      a.provider === 'linkedin_oidc' ||
      a.provider === 'linkedin' ||
      a.provider === 'oauth_linkedin_oidc' ||
      a.provider === 'oauth_linkedin'
  );
  const linkedinName =
    connectedLinkedin?.firstName && connectedLinkedin?.lastName
      ? `${connectedLinkedin.firstName} ${connectedLinkedin.lastName}`
      : (connectedLinkedin?.username ?? null);

  // Debug: Log external accounts when user is loaded
  useEffect(() => {
    if (isUserLoaded && user) {
      console.log(
        '[Onboarding] External accounts:',
        user.externalAccounts?.map((a) => ({
          provider: a.provider,
          username: a.username,
          firstName: a.firstName,
        }))
      );
    }
  }, [isUserLoaded, user]);

  // Save import state to sessionStorage (used before OAuth redirects)
  const saveImportState = useCallback(() => {
    const storageKey = getStorageKey(user?.id);
    if (!storageKey) return;

    try {
      const stateToSave: PersistedImportState = {
        imports,
        importedData,
        githubUsername,
      };
      sessionStorage.setItem(storageKey, JSON.stringify(stateToSave));
    } catch (err) {
      console.error('Failed to save import state:', err);
    }
  }, [imports, importedData, githubUsername, user?.id]);

  // Restore state from sessionStorage on mount (for after OAuth redirects)
  useEffect(() => {
    if (hasRestoredPersistedState || !isUserLoaded || !user?.id) return;

    const storageKey = getStorageKey(user.id);
    if (!storageKey) {
      setHasRestoredPersistedState(true);
      return;
    }

    try {
      const savedState = sessionStorage.getItem(storageKey);
      if (savedState) {
        const parsed: PersistedImportState = JSON.parse(savedState);

        // Restore import statuses
        if (parsed.imports) {
          setImports(parsed.imports);
        }

        // Restore imported data
        if (parsed.importedData) {
          setImportedData(parsed.importedData);
        }

        // Restore GitHub username
        if (parsed.githubUsername) {
          setGithubUsername(parsed.githubUsername);
        }

        // Clear the saved state after restoring
        sessionStorage.removeItem(storageKey);
      }
    } catch (err) {
      console.error('Failed to restore import state:', err);
    }

    setHasRestoredPersistedState(true);
  }, [hasRestoredPersistedState, isUserLoaded, user?.id]);

  // Auto-import from connected GitHub if just connected via OAuth
  useEffect(() => {
    if (!isUserLoaded || !hasRestoredPersistedState) return;

    // If user has connected GitHub via OAuth and we haven't imported yet
    if (githubUsernameFromAccount && imports.github.status === 'idle') {
      // Auto-trigger import with the connected username
      updateImportStatus('github', { status: 'importing', message: 'Fetching GitHub data...' });

      fetch('/api/import/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: githubUsernameFromAccount }),
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.error) {
            updateImportStatus('github', {
              status: 'error',
              message: data.error || 'Failed to import from GitHub',
            });
          } else {
            setImportedData((prev) => ({ ...prev, github: data.data }));
            updateImportStatus('github', {
              status: 'success',
              message: data.message || `Imported ${data.data?.summary?.projects || 0} projects`,
              itemsImported:
                (data.data?.summary?.projects || 0) + (data.data?.summary?.skills || 0),
            });
            setGithubUsername(githubUsernameFromAccount);
          }
        })
        .catch((err) => {
          updateImportStatus('github', {
            status: 'error',
            message: err instanceof Error ? err.message : 'Failed to import from GitHub',
          });
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUserLoaded, hasRestoredPersistedState, githubUsernameFromAccount, imports.github.status]);

  // Auto-import from connected LinkedIn if just connected via OAuth
  useEffect(() => {
    if (!isUserLoaded || !hasRestoredPersistedState) return;

    // If user has connected LinkedIn via OAuth and we haven't imported yet
    if (connectedLinkedin && imports.linkedin.status === 'idle') {
      // Auto-trigger import with the connected account data
      updateImportStatus('linkedin', {
        status: 'importing',
        message: 'Fetching LinkedIn data...',
      });

      fetch('/api/import/linkedin/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.error) {
            updateImportStatus('linkedin', {
              status: 'error',
              message: data.error || 'Failed to import from LinkedIn',
            });
          } else {
            setImportedData((prev) => ({ ...prev, linkedin: data.data }));
            updateImportStatus('linkedin', {
              status: 'success',
              message: data.message || 'Imported profile data',
              itemsImported: data.data?.summary?.total || 1,
            });
          }
        })
        .catch((err) => {
          updateImportStatus('linkedin', {
            status: 'error',
            message: err instanceof Error ? err.message : 'Failed to import from LinkedIn',
          });
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUserLoaded, hasRestoredPersistedState, connectedLinkedin, imports.linkedin.status]);

  const updateImportStatus = (source: ImportSource, update: Partial<ImportStatus>) => {
    setImports((prev) => ({
      ...prev,
      [source]: { ...prev[source], ...update },
    }));
  };

  // GitHub OAuth connect handler
  const handleGitHubConnect = async () => {
    setGithubConnecting(true);
    setGithubError(null);

    // Check if user has a verified email
    const primaryEmail = user?.primaryEmailAddress;
    if (!primaryEmail?.verification?.status || primaryEmail.verification.status !== 'verified') {
      setGithubError(
        'Please verify your email first to connect GitHub. Check your inbox for a verification email, or use manual entry below.'
      );
      setGithubConnecting(false);
      return;
    }

    try {
      // Save state before OAuth redirect so we can restore it when we come back
      saveImportState();

      const externalAccount = await user?.createExternalAccount({
        strategy: 'oauth_github',
        redirectUrl: window.location.href,
      });
      const url = externalAccount?.verification?.externalVerificationRedirectURL;
      if (url) {
        window.location.href = url.toString();
      }
    } catch (err: unknown) {
      console.error('GitHub connect error:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);

      if (errorMessage.includes('additional verification')) {
        setGithubError(
          'Email verification required. Please verify your email first, or enter your GitHub username manually below.'
        );
      } else if (errorMessage.includes('already connected')) {
        // Refresh user to get updated external accounts
        await user?.reload();
        setGithubError(null);
      } else {
        setGithubError(`Connection failed: ${errorMessage}. Try entering your username manually.`);
      }
      setGithubConnecting(false);
    }
  };

  // Resume upload handler
  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type - only PDFs supported
    if (file.type !== 'application/pdf') {
      updateImportStatus('resume', {
        status: 'error',
        message: 'Only PDF files are supported. Please upload a PDF resume.',
      });
      return;
    }

    updateImportStatus('resume', { status: 'importing', message: 'Parsing resume...' });

    try {
      const formData = new FormData();
      formData.append('file', file);
      // Don't auto-save - we'll review first
      formData.append('saveToProfile', 'false');

      const response = await fetch('/api/import/resume', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to parse resume');
      }

      setImportedData((prev) => ({ ...prev, resume: data.data }));

      // Count imported items
      const itemCount = countResumeItems(data.data);

      updateImportStatus('resume', {
        status: 'success',
        message: `Found ${itemCount} items (${Math.round((data.confidence || 0.5) * 100)}% confidence)`,
        itemsImported: itemCount,
      });
    } catch (err) {
      updateImportStatus('resume', {
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to import resume',
      });
    }
  };

  // Count items from resume import
  const countResumeItems = (data: Record<string, unknown> | undefined): number => {
    if (!data) return 0;
    let count = 0;
    if (data.profile && Object.keys(data.profile as object).length > 0) count += 1;
    if (Array.isArray(data.experiences)) count += (data.experiences as unknown[]).length;
    if (Array.isArray(data.educations)) count += (data.educations as unknown[]).length;
    if (Array.isArray(data.projects)) count += (data.projects as unknown[]).length;
    if (Array.isArray(data.skills)) count += (data.skills as unknown[]).length;
    if (Array.isArray(data.links)) count += (data.links as unknown[]).length;
    return count;
  };

  // GitHub import handler
  const handleGitHubImport = async (overrideUsername?: string) => {
    const resolvedUsername = (overrideUsername ?? githubUsername).trim();
    if (!resolvedUsername) {
      // No username provided - show error
      updateImportStatus('github', {
        status: 'error',
        message: 'Please enter a GitHub username or connect with GitHub',
      });
      return;
    }

    updateImportStatus('github', { status: 'importing', message: 'Fetching GitHub data...' });

    try {
      const response = await fetch('/api/import/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: resolvedUsername }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to import from GitHub');
      }

      setImportedData((prev) => ({ ...prev, github: data.data }));
      updateImportStatus('github', {
        status: 'success',
        message: data.message || `Imported ${data.data?.summary?.projects || 0} projects`,
        itemsImported: (data.data?.summary?.projects || 0) + (data.data?.summary?.skills || 0),
      });
      setGithubUsername(resolvedUsername);
    } catch (err) {
      updateImportStatus('github', {
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to import from GitHub',
      });
    }
  };

  // LinkedIn OAuth connect handler
  const handleLinkedInConnect = async () => {
    setLinkedinConnecting(true);
    setLinkedinError(null);

    // Check if user has a verified email
    const primaryEmail = user?.primaryEmailAddress;
    if (!primaryEmail?.verification?.status || primaryEmail.verification.status !== 'verified') {
      setLinkedinError(
        'Please verify your email first to connect LinkedIn. Check your inbox for a verification email.'
      );
      setLinkedinConnecting(false);
      return;
    }

    try {
      // Save state before OAuth redirect so we can restore it when we come back
      saveImportState();

      const externalAccount = await user?.createExternalAccount({
        strategy: 'oauth_linkedin_oidc',
        redirectUrl: window.location.href,
      });
      const url = externalAccount?.verification?.externalVerificationRedirectURL;
      if (url) {
        window.location.href = url.toString();
      }
    } catch (err: unknown) {
      console.error('LinkedIn connect error:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);

      if (errorMessage.includes('additional verification')) {
        setLinkedinError('Email verification required. Please verify your email first.');
      } else if (errorMessage.includes('already connected')) {
        // Refresh user to get updated external accounts
        await user?.reload();
        setLinkedinError(null);
      } else {
        setLinkedinError(`Connection failed: ${errorMessage}`);
      }
      setLinkedinConnecting(false);
    }
  };

  // LinkedIn import handler (for when already connected)
  const handleLinkedInImport = async () => {
    updateImportStatus('linkedin', {
      status: 'importing',
      message: 'Fetching LinkedIn data...',
    });

    try {
      const response = await fetch('/api/import/linkedin/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to import from LinkedIn');
      }

      setImportedData((prev) => ({ ...prev, linkedin: data.data }));
      updateImportStatus('linkedin', {
        status: 'success',
        message: data.message || 'Imported profile data',
        itemsImported: data.data?.summary?.total || 1,
      });
    } catch (err) {
      updateImportStatus('linkedin', {
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to import from LinkedIn',
      });
    }
  };

  // Manual links handler
  const handleAddLink = () => {
    setManualLinks((prev) => [...prev, { url: '' }]);
  };

  const handleRemoveLink = (index: number) => {
    setManualLinks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleLinkChange = (index: number, value: string) => {
    setManualLinks((prev) => prev.map((link, i) => (i === index ? { ...link, url: value } : link)));
  };

  const handleSaveLinks = async () => {
    const validLinks = manualLinks.filter((l) => l.url.trim());
    if (validLinks.length === 0) {
      setShowLinksForm(false);
      return;
    }

    updateImportStatus('links', { status: 'importing', message: 'Processing links...' });

    try {
      const response = await fetch('/api/import/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links: validLinks }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process links');
      }

      setImportedData((prev) => ({ ...prev, links: data.data }));
      updateImportStatus('links', {
        status: 'success',
        message: `Added ${data.data?.summary?.links || validLinks.length} links`,
        itemsImported: data.data?.summary?.links || validLinks.length,
      });
      setShowLinksForm(false);
    } catch (err) {
      updateImportStatus('links', {
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to process links',
      });
    }
  };

  // Count imported items for display
  const countImportedItems = (data: Record<string, unknown> | undefined): number => {
    if (!data) return 0;
    const summary = data.summary as Record<string, number> | undefined;
    if (!summary) return 0;
    return Object.values(summary).reduce((acc, val) => acc + (val || 0), 0);
  };

  // Create profile and continue
  const handleContinue = async () => {
    console.log('[Import] handleContinue called');
    console.log('[Import] importedData.resume:', importedData.resume);

    // If we have resume data, go to review flow
    if (importedData.resume) {
      console.log('[Import] Storing resume data in sessionStorage and redirecting to review');
      // Store parsed data in sessionStorage for the review page
      sessionStorage.setItem('onboarding_parsed_resume', JSON.stringify(importedData.resume));
      router.push('/onboarding/review');
      return;
    }

    // If no resume data but has other imports, create profile directly
    setIsCreatingProfile(true);
    setError(null);

    try {
      // Create or update profile with imported data
      const response = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ importedData }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create profile');
      }

      // Force refresh to clear Router Cache, then navigate
      // This ensures /me fetches fresh data from the server
      router.refresh();
      router.push('/me');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setIsCreatingProfile(false);
    }
  };

  // Get overall import count
  const getTotalImported = () => {
    return Object.values(imports).reduce((acc, imp) => acc + (imp.itemsImported || 0), 0);
  };

  const hasAnyImport = Object.values(imports).some((i) => i.status === 'success');

  return (
    <>
      {/* Progress bar */}
      <div className="fixed left-0 right-0 top-16 z-40 h-1 bg-muted">
        <motion.div
          className="h-full bg-primary"
          initial={{ width: '33%' }}
          animate={{ width: '66%' }}
          transition={{ duration: 0.3 }}
        />
      </div>

      <div className="mx-auto max-w-2xl px-4 py-16">
        {/* Header */}
        <motion.div
          className="mb-8 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
            <span className="text-2xl font-bold text-primary-foreground">F</span>
          </div>
          <h1 className="text-3xl font-bold">Bring your data</h1>
          <p className="mt-2 text-muted-foreground">
            Import from anywhere—or start fresh. You can always add more later.
          </p>
        </motion.div>

        <motion.div
          className="space-y-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          {/* Resume Upload */}
          <ImportCard
            icon={<FileText className="h-5 w-5" />}
            title="Upload Resume"
            description="Import your resume (PDF only)"
            status={imports.resume}
            onAction={() => document.getElementById('resume-upload')?.click()}
            actionLabel={imports.resume.status === 'success' ? 'Re-upload' : 'Upload'}
          >
            <input
              id="resume-upload"
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={handleResumeUpload}
            />
          </ImportCard>

          {/* GitHub Connect */}
          <Card className="">
            <CardContent className="flex items-start gap-4 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Github className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">Connect GitHub</h3>
                    {imports.github.status === 'importing' && (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    )}
                    {imports.github.status === 'success' && (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    )}
                    {imports.github.status === 'error' && (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                  {imports.github.status === 'importing' && (
                    <Badge variant="secondary">Importing...</Badge>
                  )}
                  {imports.github.status === 'success' && (
                    <Badge variant="default" className="bg-green-500/10 text-green-600">
                      {imports.github.itemsImported
                        ? `${imports.github.itemsImported} items`
                        : 'Connected'}
                    </Badge>
                  )}
                  {imports.github.status === 'error' && <Badge variant="destructive">Error</Badge>}
                  {imports.github.status === 'idle' && !connectedGithub && (
                    <Badge variant="outline">Not connected</Badge>
                  )}
                  {imports.github.status === 'idle' && connectedGithub && (
                    <Badge variant="default" className="bg-green-500/10 text-green-600">
                      @{githubUsernameFromAccount}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {connectedGithub && imports.github.status === 'idle'
                    ? 'Click Import to fetch your projects and skills'
                    : 'Import projects, skills, and profile info'}
                </p>
                {imports.github.message && imports.github.status !== 'idle' && (
                  <p
                    className={`mt-1 text-xs ${
                      imports.github.status === 'error'
                        ? 'text-destructive'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {imports.github.message}
                  </p>
                )}
                {githubError && (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{githubError}</p>
                )}
              </div>
              {/* Show black GitHub button when not connected, normal button otherwise */}
              {!connectedGithub && imports.github.status !== 'success' ? (
                <Button
                  onClick={handleGitHubConnect}
                  disabled={githubConnecting || imports.github.status === 'importing'}
                  className="shrink-0 bg-[#24292e] text-white hover:bg-[#1b1f23]"
                  size="sm"
                >
                  {githubConnecting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Github className="mr-2 h-4 w-4" />
                  )}
                  {githubConnecting ? 'Connecting...' : 'Connect'}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (connectedGithub && githubUsernameFromAccount) {
                      handleGitHubImport(githubUsernameFromAccount);
                    }
                  }}
                  disabled={imports.github.status === 'importing'}
                  className="shrink-0"
                >
                  {imports.github.status === 'importing' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : imports.github.status === 'success' ? (
                    'Re-import'
                  ) : (
                    'Import'
                  )}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* LinkedIn Connect */}
          <Card className="">
            <CardContent className="flex items-start gap-4 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Linkedin className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">Connect LinkedIn</h3>
                    {imports.linkedin.status === 'importing' && (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    )}
                    {imports.linkedin.status === 'success' && (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    )}
                    {imports.linkedin.status === 'error' && (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                  {imports.linkedin.status === 'importing' && (
                    <Badge variant="secondary">Importing...</Badge>
                  )}
                  {imports.linkedin.status === 'success' && (
                    <Badge variant="default" className="bg-green-500/10 text-green-600">
                      {imports.linkedin.itemsImported
                        ? `${imports.linkedin.itemsImported} items`
                        : 'Connected'}
                    </Badge>
                  )}
                  {imports.linkedin.status === 'error' && (
                    <Badge variant="destructive">Error</Badge>
                  )}
                  {imports.linkedin.status === 'idle' && !connectedLinkedin && (
                    <Badge variant="outline">Not connected</Badge>
                  )}
                  {imports.linkedin.status === 'idle' && connectedLinkedin && (
                    <Badge variant="default" className="bg-green-500/10 text-green-600">
                      {linkedinName || 'Connected'}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {connectedLinkedin && imports.linkedin.status === 'idle'
                    ? 'Click Import to fetch your profile info & photo'
                    : 'Import profile picture, name, and headline'}
                </p>
                {imports.linkedin.message && imports.linkedin.status !== 'idle' && (
                  <p
                    className={`mt-1 text-xs ${
                      imports.linkedin.status === 'error'
                        ? 'text-destructive'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {imports.linkedin.message}
                  </p>
                )}
                {linkedinError && (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{linkedinError}</p>
                )}
              </div>
              {/* Show LinkedIn blue button when not connected, normal button otherwise */}
              {!connectedLinkedin && imports.linkedin.status !== 'success' ? (
                <Button
                  onClick={handleLinkedInConnect}
                  disabled={linkedinConnecting || imports.linkedin.status === 'importing'}
                  className="shrink-0 bg-[#0A66C2] text-white hover:bg-[#004182]"
                  size="sm"
                >
                  {linkedinConnecting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Linkedin className="mr-2 h-4 w-4" />
                  )}
                  {linkedinConnecting ? 'Connecting...' : 'Connect'}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLinkedInImport}
                  disabled={imports.linkedin.status === 'importing'}
                  className="shrink-0"
                >
                  {imports.linkedin.status === 'importing' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : imports.linkedin.status === 'success' ? (
                    'Re-import'
                  ) : (
                    'Import'
                  )}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Manual Links */}
          <ImportCard
            icon={<LinkIcon className="h-5 w-5" />}
            title="Add Links"
            description="Website, Notion, Medium, or any URL"
            status={imports.links}
            onAction={() => setShowLinksForm(true)}
            actionLabel={imports.links.status === 'success' ? 'Edit Links' : 'Add Links'}
          >
            {showLinksForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 space-y-3"
              >
                {manualLinks.map((link, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      placeholder="https://..."
                      value={link.url}
                      onChange={(e) => handleLinkChange(index, e.target.value)}
                    />
                    {manualLinks.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => handleRemoveLink(index)}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleAddLink} className="gap-1">
                    <Plus className="h-3 w-3" />
                    Add another
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveLinks}
                    disabled={imports.links.status === 'importing'}
                  >
                    {imports.links.status === 'importing' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Save Links'
                    )}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowLinksForm(false)}>
                    Cancel
                  </Button>
                </div>
              </motion.div>
            )}
          </ImportCard>
        </motion.div>

        {/* Summary */}
        {hasAnyImport && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-6 rounded-lg bg-muted/50 p-4 text-center"
          >
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{getTotalImported()}</span> items ready
              to import
            </p>
          </motion.div>
        )}

        {/* Error message */}
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </motion.div>
        )}

        {/* Actions */}
        <motion.div
          className="mt-8 flex flex-col gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <Button onClick={handleContinue} disabled={isCreatingProfile} className="gap-2" size="lg">
            {isCreatingProfile ? (
              <>
                <Spinner size="sm" />
                Creating your profile...
              </>
            ) : importedData.resume ? (
              <>
                Review & Edit Parsed Data
                <ArrowRight className="h-4 w-4" />
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            onClick={handleContinue}
            disabled={isCreatingProfile}
            className="text-muted-foreground"
          >
            Skip for now
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            You can always import more data later from your dashboard
          </p>
        </motion.div>

        {/* Progress indicator */}
        <div className="mt-8 flex justify-center gap-2">
          <div className="h-2 w-8 rounded-full bg-primary" />
          <div className="h-2 w-8 rounded-full bg-primary" />
        </div>
      </div>
    </>
  );
}

// Import Card Component
interface ImportCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  status: ImportStatus;
  onAction: () => void;
  actionLabel: string;
  disabled?: boolean;
  children?: React.ReactNode;
}

function ImportCard({
  icon,
  title,
  description,
  status,
  onAction,
  actionLabel,
  disabled,
  children,
}: ImportCardProps) {
  const getStatusIcon = () => {
    switch (status.status) {
      case 'importing':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return null;
    }
  };

  const getStatusBadge = () => {
    switch (status.status) {
      case 'importing':
        return <Badge variant="secondary">Importing...</Badge>;
      case 'success':
        return (
          <Badge variant="default" className="bg-green-500/10 text-green-600">
            {status.itemsImported ? `${status.itemsImported} items` : 'Connected'}
          </Badge>
        );
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="outline">Not connected</Badge>;
    }
  };

  return (
    <Card className={disabled ? 'opacity-60' : ''}>
      <CardContent className="flex items-start gap-4 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h3 className="font-medium">{title}</h3>
              {getStatusIcon()}
            </div>
            {getStatusBadge()}
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
          {status.message && status.status !== 'idle' && (
            <p
              className={`mt-1 text-xs ${
                status.status === 'error' ? 'text-destructive' : 'text-muted-foreground'
              }`}
            >
              {status.message}
            </p>
          )}
          {children}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onAction}
          disabled={disabled || status.status === 'importing'}
          className="shrink-0"
        >
          {status.status === 'importing' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            actionLabel
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
