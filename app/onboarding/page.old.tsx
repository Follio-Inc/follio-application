'use client';

import { useClerk, useUser } from '@clerk/nextjs';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  CheckCircle2,
  FileText,
  Github,
  Link2,
  Linkedin,
  Loader2,
  LogOut,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';

// Storage key prefix for persisting onboarding state across OAuth redirects
const ONBOARDING_STATE_KEY_PREFIX = 'follio_onboarding_state_';

// Helper to get user-specific storage key
const getStorageKey = (userId: string | undefined) => {
  return userId ? `${ONBOARDING_STATE_KEY_PREFIX}${userId}` : null;
};

interface OnboardingData {
  firstName: string;
  middleName: string;
  lastName: string;
  handle: string;
}

interface ImportSource {
  id: string;
  type: 'resume' | 'github' | 'linkedin' | 'link';
  status: 'idle' | 'loading' | 'success' | 'error';
  data?: unknown;
  error?: string;
}

interface ManualLink {
  id: string;
  url: string;
  label: string;
}

// Persisted state interface for sessionStorage
interface PersistedOnboardingState {
  importSources: ImportSource[];
  manualLinks: ManualLink[];
  data: OnboardingData;
  resumeFileName?: string | null;
  linkedinFileName?: string | null;
  importedGithubUsername?: string | null;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { signOut } = useClerk();
  const { user, isLoaded: isUserLoaded } = useUser();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const linkedinFileInputRef = useRef<HTMLInputElement>(null);
  const [hasInitializedFromUser, setHasInitializedFromUser] = useState(false);
  const [hasRestoredPersistedState, setHasRestoredPersistedState] = useState(false);
  const [showLinkedInHelp, setShowLinkedInHelp] = useState(false);
  const [showGitHubModal, setShowGitHubModal] = useState(false);
  const [githubUsername, setGithubUsername] = useState('');
  const [githubConnecting, setGithubConnecting] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [linkedinFileName, setLinkedinFileName] = useState<string | null>(null);
  const [importedGithubUsername, setImportedGithubUsername] = useState<string | null>(null);
  const clerk = useClerk();

  const [data, setData] = useState<OnboardingData>({
    firstName: '',
    middleName: '',
    lastName: '',
    handle: '',
  });

  // Import hub state
  const [importSources, setImportSources] = useState<ImportSource[]>([
    { id: 'resume', type: 'resume', status: 'idle' },
    { id: 'github', type: 'github', status: 'idle' },
    { id: 'linkedin', type: 'linkedin', status: 'idle' },
  ]);
  const [manualLinks, setManualLinks] = useState<ManualLink[]>([]);
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkLabel, setNewLinkLabel] = useState('');

  // Save onboarding state to sessionStorage (used before OAuth redirects)
  const saveOnboardingState = useCallback(() => {
    const storageKey = getStorageKey(user?.id);
    if (!storageKey) return;

    try {
      const stateToSave: PersistedOnboardingState = {
        importSources,
        manualLinks,
        data,
        resumeFileName,
        linkedinFileName,
        importedGithubUsername,
      };
      sessionStorage.setItem(storageKey, JSON.stringify(stateToSave));
    } catch (err) {
      console.error('Failed to save onboarding state:', err);
    }
  }, [
    importSources,
    manualLinks,
    data,
    resumeFileName,
    linkedinFileName,
    importedGithubUsername,
    user?.id,
  ]);

  // Clear persisted state (called after successful profile creation)
  const clearPersistedState = useCallback(() => {
    const storageKey = getStorageKey(user?.id);
    if (!storageKey) return;

    try {
      sessionStorage.removeItem(storageKey);
    } catch (err) {
      console.error('Failed to clear persisted state:', err);
    }
  }, [user?.id]);

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
        const parsed: PersistedOnboardingState = JSON.parse(savedState);

        // Restore import sources
        if (parsed.importSources && Array.isArray(parsed.importSources)) {
          setImportSources(parsed.importSources);
        }

        // Restore manual links
        if (parsed.manualLinks && Array.isArray(parsed.manualLinks)) {
          setManualLinks(parsed.manualLinks);
        }

        // Restore form data
        if (parsed.data) {
          setData(parsed.data);
          // If we restored data, mark as initialized so Clerk doesn't overwrite
          if (parsed.data.firstName || parsed.data.handle) {
            setHasInitializedFromUser(true);
          }
        }

        // Restore resume filename
        if (parsed.resumeFileName) {
          setResumeFileName(parsed.resumeFileName);
        }

        // Restore linkedin filename
        if (parsed.linkedinFileName) {
          setLinkedinFileName(parsed.linkedinFileName);
        }

        // Restore imported GitHub username
        if (parsed.importedGithubUsername) {
          setImportedGithubUsername(parsed.importedGithubUsername);
        }
      }
    } catch (err) {
      console.error('Failed to restore onboarding state:', err);
    }

    setHasRestoredPersistedState(true);
  }, [hasRestoredPersistedState, isUserLoaded, user?.id]);

  // Helper function to generate handle from name parts
  const generateHandle = (firstName: string, middleName: string, lastName: string) => {
    const first = firstName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const middleInitial = middleName
      ? middleName
          .charAt(0)
          .toLowerCase()
          .replace(/[^a-z]/g, '')
      : '';
    const last = lastName.toLowerCase().replace(/[^a-z0-9]/g, '');

    const parts = [first, middleInitial, last].filter(Boolean);
    return parts.join('-').slice(0, 30);
  };

  // Check handle availability and find unique one
  const findUniqueHandle = async (baseHandle: string): Promise<string> => {
    if (!baseHandle) return '';

    try {
      // Check base handle first
      const response = await fetch(
        `/api/profile/check-handle?handle=${encodeURIComponent(baseHandle)}`
      );
      const result = await response.json();

      if (result.available) {
        return baseHandle;
      }

      // Try with numbers
      for (let i = 1; i <= 99; i++) {
        const handleWithNumber = `${baseHandle}${i}`.slice(0, 30);
        const numResponse = await fetch(
          `/api/profile/check-handle?handle=${encodeURIComponent(handleWithNumber)}`
        );
        const numResult = await numResponse.json();

        if (numResult.available) {
          return handleWithNumber;
        }
      }

      // Fallback: return base handle with timestamp
      return `${baseHandle.slice(0, 20)}${Date.now().toString().slice(-8)}`;
    } catch {
      return baseHandle;
    }
  };

  // Pre-fill data from Clerk user when available
  useEffect(() => {
    if (isUserLoaded && user && !hasInitializedFromUser) {
      const firstName = user.firstName || '';
      const lastName = user.lastName || '';
      const middleName = '';

      const baseHandle = generateHandle(firstName, middleName, lastName);

      setData((prev) => ({
        ...prev,
        firstName,
        middleName,
        lastName,
      }));
      setHasInitializedFromUser(true);

      // Find unique handle asynchronously
      if (baseHandle) {
        findUniqueHandle(baseHandle).then((uniqueHandle) => {
          setData((prev) => ({
            ...prev,
            handle: uniqueHandle || prev.handle,
          }));
        });
      }
    }
  }, [isUserLoaded, user, hasInitializedFromUser]);

  // Update handle when middle name changes
  const handleMiddleNameChange = (middleName: string) => {
    setData((prev) => ({ ...prev, middleName }));

    const baseHandle = generateHandle(data.firstName, middleName, data.lastName);
    if (baseHandle) {
      findUniqueHandle(baseHandle).then((uniqueHandle) => {
        setData((prev) => ({ ...prev, handle: uniqueHandle }));
      });
    }
  };

  const updateImportSource = (id: string, updates: Partial<ImportSource>) => {
    setImportSources((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  // Resume upload handler
  const handleResumeUpload = async (file: File) => {
    console.log(
      '[Resume Upload] Starting upload for file:',
      file.name,
      'type:',
      file.type,
      'size:',
      file.size
    );
    updateImportSource('resume', { status: 'loading' });
    setResumeFileName(file.name);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/import/resume', {
        method: 'POST',
        body: formData,
      });

      console.log('[Resume Upload] Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.log('[Resume Upload] Error response:', errorText);
        throw new Error('Failed to parse resume');
      }

      const result = await response.json();
      console.log('[Resume Upload] Success result:', JSON.stringify(result).substring(0, 500));
      console.log('[Resume Upload] Result keys:', Object.keys(result));
      console.log(
        '[Resume Upload] Result.data keys:',
        result.data ? Object.keys(result.data) : 'no data'
      );

      updateImportSource('resume', { status: 'success', data: result });

      // If resume has middle name, update it
      if (result.data?.middleName) {
        handleMiddleNameChange(result.data.middleName);
      }
    } catch (err) {
      console.log('[Resume Upload] Error:', err);
      updateImportSource('resume', {
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to upload resume',
      });
    }
  };

  // GitHub import handler
  const handleGitHubImport = async (overrideUsername?: string) => {
    console.log(
      '[GitHub Import] Called with overrideUsername:',
      overrideUsername,
      'githubUsername state:',
      githubUsername
    );
    const resolvedUsername = (overrideUsername ?? githubUsername).trim();
    console.log('[GitHub Import] resolvedUsername:', resolvedUsername);
    if (!resolvedUsername) {
      console.log('[GitHub Import] RETURNING EARLY - no username');
      return;
    }

    updateImportSource('github', { status: 'loading' });
    setShowGitHubModal(false);

    try {
      const response = await fetch('/api/import/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: resolvedUsername }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch GitHub data');
      }

      const result = await response.json();
      console.log('[GitHub Import] SUCCESS - setting importedGithubUsername to:', resolvedUsername);
      updateImportSource('github', { status: 'success', data: result });
      setImportedGithubUsername(resolvedUsername);
      setGithubUsername('');
    } catch (err) {
      console.log('[GitHub Import] ERROR:', err);
      updateImportSource('github', {
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to import from GitHub',
      });
    }
  };

  // LinkedIn import handler
  const handleLinkedInImport = async (file: File) => {
    updateImportSource('linkedin', { status: 'loading' });
    setLinkedinFileName(file.name);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/import/linkedin', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to parse LinkedIn data');
      }

      const result = await response.json();
      updateImportSource('linkedin', { status: 'success', data: result });
      setShowLinkedInHelp(false);
    } catch (err) {
      updateImportSource('linkedin', {
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to import from LinkedIn',
      });
    }
  };

  // Add manual link
  const handleAddLink = () => {
    if (!newLinkUrl.trim()) return;

    const newLink: ManualLink = {
      id: Date.now().toString(),
      url: newLinkUrl.startsWith('http') ? newLinkUrl : `https://${newLinkUrl}`,
      label:
        newLinkLabel ||
        new URL(newLinkUrl.startsWith('http') ? newLinkUrl : `https://${newLinkUrl}`).hostname,
    };

    setManualLinks((prev) => [...prev, newLink]);
    setNewLinkUrl('');
    setNewLinkLabel('');
  };

  const handleRemoveLink = (id: string) => {
    setManualLinks((prev) => prev.filter((l) => l.id !== id));
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Collect all imported data from sources
      const importedData: Record<string, unknown> = {};

      console.log(
        '[Onboarding Submit] Import sources:',
        importSources.map((s) => ({ id: s.id, type: s.type, status: s.status, hasData: !!s.data }))
      );

      for (const source of importSources) {
        if (source.status === 'success' && source.data) {
          // Extract the normalized data from the API response
          const sourceData = source.data as { data?: unknown; success?: boolean };
          console.log(
            '[Onboarding Submit] Source',
            source.type,
            'raw data keys:',
            Object.keys(sourceData)
          );
          if (sourceData.data) {
            importedData[source.type] = sourceData.data;
            console.log('[Onboarding Submit] Using sourceData.data for', source.type);
          } else {
            importedData[source.type] = sourceData;
            console.log('[Onboarding Submit] Using sourceData directly for', source.type);
          }
        }
      }

      console.log('[Onboarding Submit] Final importedData keys:', Object.keys(importedData));
      console.log(
        '[Onboarding Submit] Resume data sample:',
        JSON.stringify(importedData.resume)?.substring(0, 500)
      );

      // Create profile with all imported data using the complete endpoint
      const response = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: data.firstName,
          lastName: data.lastName,
          handle: data.handle,
          importedData,
          manualLinks: manualLinks.map((link) => ({
            url: link.url,
            label: link.label,
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();

        // If profile already exists, redirect to their Follio
        if (response.status === 409 && errorData.error === 'Profile already exists') {
          clearPersistedState();
          router.push('/me');
          return;
        }

        throw new Error(errorData.error || errorData.message || 'Failed to create profile');
      }

      // Clear persisted onboarding state since we're done
      clearPersistedState();

      // Redirect to their Follio (they can access Builder via Edit button)
      router.push('/me');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const getSourceIcon = (type: ImportSource['type']) => {
    switch (type) {
      case 'resume':
        return <FileText className="h-5 w-5" />;
      case 'github':
        return <Github className="h-5 w-5" />;
      case 'linkedin':
        return <Linkedin className="h-5 w-5" />;
      case 'link':
        return <Link2 className="h-5 w-5" />;
    }
  };

  const getSourceLabel = (type: ImportSource['type']) => {
    switch (type) {
      case 'resume':
        return 'Resume / CV';
      case 'github':
        return 'GitHub';
      case 'linkedin':
        return 'LinkedIn';
      case 'link':
        return 'Custom Link';
    }
  };

  // Show loading while Clerk loads user data
  if (!isUserLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Top bar with sign out */}
      <div className="absolute right-4 top-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await signOut();
            window.location.href = '/';
          }}
          className="text-muted-foreground hover:text-foreground"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-16">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <span className="text-2xl font-bold text-primary-foreground">F</span>
          </div>
          <h1 className="text-2xl font-bold">Welcome, {data.firstName || 'there'}!</h1>
          <p className="mt-2 text-muted-foreground">Let&apos;s set up your Follio</p>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key="onboarding"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            {/* Profile URL Card - Primary Focus */}
            <Card>
              <CardHeader>
                <CardTitle>Your Profile URL</CardTitle>
                <CardDescription>
                  This is your unique Follio link. Share it anywhere!
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex">
                    <span className="inline-flex items-center rounded-l-lg border border-r-0 bg-muted px-3 text-sm text-muted-foreground">
                      follio.dev/u/
                    </span>
                    <Input
                      id="handle"
                      value={data.handle}
                      onChange={(e) =>
                        setData((prev) => ({
                          ...prev,
                          handle: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                        }))
                      }
                      className="rounded-l-none text-base font-medium"
                      placeholder="your-name"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Only lowercase letters, numbers, and hyphens allowed
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Import Hub Card */}
            <Card className="border-dashed">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Quick Import</CardTitle>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    Optional
                  </span>
                </div>
                <CardDescription>
                  Speed up your setup by importing existing data. Skip this if you prefer to add
                  content manually later.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Hidden file input for resume */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleResumeUpload(file);
                  }}
                />

                {/* Hidden file input for LinkedIn */}
                <input
                  ref={linkedinFileInputRef}
                  type="file"
                  accept=".pdf,.zip"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleLinkedInImport(file);
                  }}
                />

                {/* LinkedIn Help Modal */}
                {showLinkedInHelp && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="mx-4 max-w-md rounded-xl bg-background p-6 shadow-xl">
                      <h3 className="mb-2 text-lg font-semibold">Import from LinkedIn</h3>
                      <p className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
                        LinkedIn doesn&apos;t allow direct data access. Please export your profile
                        manually.
                      </p>
                      <p className="mb-4 text-sm text-muted-foreground">
                        Export your LinkedIn profile as PDF (quick) or data archive (complete):
                      </p>

                      {/* Option 1: PDF Export (Recommended) */}
                      <div className="mb-4 rounded-lg border bg-muted/30 p-3">
                        <p className="mb-2 text-sm font-medium text-primary">
                          Option 1: Save as PDF (Recommended)
                        </p>
                        <ol className="space-y-1 text-sm text-muted-foreground">
                          <li className="flex gap-2">
                            <span className="font-medium">1.</span>
                            Go to your LinkedIn profile page
                          </li>
                          <li className="flex gap-2">
                            <span className="font-medium">2.</span>
                            Click &quot;More&quot; → &quot;Save to PDF&quot;
                          </li>
                          <li className="flex gap-2">
                            <span className="font-medium">3.</span>
                            Upload the downloaded PDF here
                          </li>
                        </ol>
                      </div>

                      {/* Option 2: Data Export */}
                      <details className="mb-4 rounded-lg border bg-muted/30 p-3">
                        <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                          Option 2: Data Export (takes 10-15 min)
                        </summary>
                        <ol className="mt-2 space-y-1 text-sm text-muted-foreground">
                          <li className="flex gap-2">
                            <span className="font-medium">1.</span>
                            Settings → Data Privacy → Get a copy of your data
                          </li>
                          <li className="flex gap-2">
                            <span className="font-medium">2.</span>
                            Select data types and request archive
                          </li>
                          <li className="flex gap-2">
                            <span className="font-medium">3.</span>
                            Wait for email, download ZIP, upload here
                          </li>
                        </ol>
                      </details>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => setShowLinkedInHelp(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          className="flex-1"
                          onClick={() => linkedinFileInputRef.current?.click()}
                        >
                          Upload PDF/ZIP
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* GitHub Username Modal */}
                {showGitHubModal &&
                  (() => {
                    const connectedGithub = user?.externalAccounts?.find(
                      (a) => a.provider === 'github'
                    );

                    // GitHub username from the external account
                    const githubUsernameFromAccount = connectedGithub?.username ?? null;

                    return (
                      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                        <div className="mx-4 w-full max-w-sm rounded-xl bg-background p-6 shadow-xl">
                          <div className="mb-4 flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                              <Github className="h-5 w-5" />
                            </div>
                            <div>
                              <h3 className="text-lg font-semibold">Import from GitHub</h3>
                              <p className="text-sm text-muted-foreground">
                                {connectedGithub
                                  ? githubUsernameFromAccount
                                    ? `Connected as @${githubUsernameFromAccount}`
                                    : 'Your account is connected'
                                  : 'Connect or enter your username'}
                              </p>
                            </div>
                          </div>

                          {/* Show connected account if exists */}
                          {connectedGithub ? (
                            <>
                              <div className="mb-4 rounded-lg border-2 border-green-500/30 bg-green-50 p-4 dark:bg-green-950/30">
                                <button
                                  onClick={() => {
                                    const usernameToImport =
                                      githubUsernameFromAccount || githubUsername.trim();
                                    if (usernameToImport) {
                                      handleGitHubImport(usernameToImport);
                                    }
                                  }}
                                  className="flex w-full items-center gap-3 text-left"
                                >
                                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                                    <Check className="h-5 w-5 text-green-600" />
                                  </div>
                                  <div className="flex-1">
                                    <p className="font-medium">
                                      {githubUsernameFromAccount ? (
                                        <>@{githubUsernameFromAccount}</>
                                      ) : (
                                        'Connected via GitHub'
                                      )}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                      {githubUsernameFromAccount
                                        ? 'Connected via GitHub'
                                        : 'Click to import your data'}
                                    </p>
                                  </div>
                                  <span className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                                    Import
                                  </span>
                                </button>

                                {/* Disconnect button - opens Clerk's user profile for proper verification */}
                                <div className="mt-3 flex justify-end border-t border-green-500/20 pt-3">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      // Save state before opening profile (in case of navigation)
                                      saveOnboardingState();
                                      // Open Clerk's user profile to the connected accounts section
                                      clerk.openUserProfile({
                                        appearance: {
                                          elements: {
                                            rootBox: 'z-[100]',
                                          },
                                        },
                                      });
                                    }}
                                    className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-destructive"
                                  >
                                    <X className="h-3 w-3" />
                                    Disconnect account
                                  </button>
                                </div>
                              </div>

                              {/* Divider for manual entry */}
                              <div className="mb-3 flex items-center gap-3">
                                <div className="h-px flex-1 bg-border" />
                                <span className="text-xs text-muted-foreground">
                                  or enter username manually
                                </span>
                                <div className="h-px flex-1 bg-border" />
                              </div>
                            </>
                          ) : (
                            <>
                              {/* Connect with GitHub Button */}
                              <button
                                onClick={async () => {
                                  setGithubConnecting(true);
                                  setGithubError(null);

                                  // Check if user has a verified email
                                  const primaryEmail = user?.primaryEmailAddress;
                                  if (
                                    !primaryEmail?.verification?.status ||
                                    primaryEmail.verification.status !== 'verified'
                                  ) {
                                    setGithubError(
                                      'Please verify your email first to connect GitHub. Check your inbox for a verification email, or use manual entry below.'
                                    );
                                    setGithubConnecting(false);
                                    return;
                                  }

                                  try {
                                    // Save state before OAuth redirect so we can restore it when we come back
                                    saveOnboardingState();

                                    const externalAccount = await user?.createExternalAccount({
                                      strategy: 'oauth_github',
                                      redirectUrl: window.location.href,
                                    });
                                    const url =
                                      externalAccount?.verification
                                        ?.externalVerificationRedirectURL;
                                    if (url) {
                                      window.location.href = url.toString();
                                    }
                                  } catch (err: unknown) {
                                    console.error('GitHub connect error:', err);
                                    const errorMessage =
                                      err instanceof Error ? err.message : String(err);

                                    if (errorMessage.includes('additional verification')) {
                                      setGithubError(
                                        'Email verification required. Please verify your email first, or enter your GitHub username manually below.'
                                      );
                                    } else if (errorMessage.includes('already connected')) {
                                      // Refresh user to get updated external accounts
                                      await user?.reload();
                                      setGithubError(null);
                                    } else {
                                      setGithubError(
                                        `Connection failed: ${errorMessage}. Try entering your username manually.`
                                      );
                                    }
                                    setGithubConnecting(false);
                                  }
                                }}
                                disabled={githubConnecting}
                                className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#24292e] px-4 py-3 text-white transition-all hover:bg-[#1b1f23] disabled:opacity-50"
                              >
                                {githubConnecting ? (
                                  <Loader2 className="h-5 w-5 animate-spin" />
                                ) : (
                                  <Github className="h-5 w-5" />
                                )}
                                <span className="font-medium">
                                  {githubConnecting ? 'Connecting...' : 'Connect with GitHub'}
                                </span>
                              </button>

                              {/* Error message */}
                              {githubError && (
                                <p className="mb-3 text-sm text-amber-600 dark:text-amber-400">
                                  {githubError}
                                </p>
                              )}

                              {/* Divider */}
                              <div className="mb-3 flex items-center gap-3">
                                <div className="h-px flex-1 bg-border" />
                                <span className="text-xs text-muted-foreground">
                                  or enter manually
                                </span>
                                <div className="h-px flex-1 bg-border" />
                              </div>
                            </>
                          )}

                          <div className="mb-4">
                            <div className="flex">
                              <span className="inline-flex items-center rounded-l-lg border border-r-0 bg-muted px-3 text-sm text-muted-foreground">
                                github.com/
                              </span>
                              <Input
                                value={githubUsername}
                                onChange={(e) => setGithubUsername(e.target.value)}
                                placeholder="username"
                                className="rounded-l-none"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && githubUsername.trim()) {
                                    handleGitHubImport();
                                  }
                                }}
                              />
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">
                              We&apos;ll import your public profile, repos, and contributions
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              className="flex-1"
                              onClick={() => {
                                setShowGitHubModal(false);
                                setGithubUsername('');
                                setGithubError(null);
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              className="flex-1"
                              onClick={() => handleGitHubImport()}
                              disabled={!githubUsername.trim()}
                            >
                              Import
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                {/* Import Sources Grid */}
                <div className="grid gap-3 sm:grid-cols-3">
                  {importSources.map((source) => {
                    // Get connected GitHub username if available
                    const githubAccount =
                      source.type === 'github'
                        ? user?.externalAccounts?.find((a) => a.provider === 'github')
                        : null;
                    const connectedGithubUsername = githubAccount?.username ?? null;

                    // Check if this source can be cleared
                    const canClear =
                      (source.type === 'resume' && source.status === 'success') ||
                      (source.type === 'linkedin' && source.status === 'success') ||
                      (source.type === 'github' && (githubAccount || source.status === 'success'));

                    return (
                      <div key={source.id} className="relative">
                        {/* Clear/Remove button */}
                        {canClear && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (source.type === 'resume') {
                                updateImportSource('resume', { status: 'idle', data: undefined });
                                setResumeFileName(null);
                              } else if (source.type === 'linkedin') {
                                updateImportSource('linkedin', { status: 'idle', data: undefined });
                                setLinkedinFileName(null);
                              } else if (source.type === 'github') {
                                // Clear imported data and username
                                updateImportSource('github', { status: 'idle', data: undefined });
                                setImportedGithubUsername(null);
                                // If connected via Clerk, open profile to manage
                                if (githubAccount) {
                                  clerk.openUserProfile();
                                }
                              }
                            }}
                            className="absolute -right-1 -top-1 z-10 rounded-full bg-muted p-1 text-muted-foreground shadow-sm transition-colors hover:bg-destructive hover:text-destructive-foreground"
                            title={source.type === 'github' ? 'Disconnect' : 'Remove'}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (source.type === 'resume') {
                              fileInputRef.current?.click();
                            } else if (source.type === 'github') {
                              setShowGitHubModal(true);
                            } else if (source.type === 'linkedin') {
                              setShowLinkedInHelp(true);
                            }
                          }}
                          disabled={source.status === 'loading'}
                          className={`relative flex min-h-[88px] w-full flex-col items-center justify-center gap-2 rounded-xl border p-4 transition-all hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50 ${
                            source.status === 'success'
                              ? 'border-green-500 bg-green-50 dark:bg-green-950'
                              : source.status === 'error'
                                ? 'border-red-500 bg-red-50 dark:bg-red-950'
                                : githubAccount && source.type === 'github'
                                  ? 'border-green-500 bg-green-50 dark:bg-green-950'
                                  : 'border-dashed border-muted-foreground/30 hover:border-muted-foreground/50'
                          }`}
                        >
                          {source.status === 'loading' ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : source.status === 'success' ? (
                            <Check className="h-5 w-5 text-green-600" />
                          ) : source.status === 'error' ? (
                            <X className="h-5 w-5 text-red-600" />
                          ) : githubAccount && source.type === 'github' ? (
                            <Check className="h-5 w-5 text-green-600" />
                          ) : (
                            getSourceIcon(source.type)
                          )}
                          <span className="text-sm font-medium">{getSourceLabel(source.type)}</span>
                          {/* Show GitHub username if imported or connected */}
                          {source.type === 'github' &&
                            (importedGithubUsername || connectedGithubUsername) && (
                              <span className="max-w-full truncate text-xs text-green-600 dark:text-green-400">
                                @{importedGithubUsername || connectedGithubUsername}
                              </span>
                            )}
                          {/* Show resume filename if uploaded */}
                          {resumeFileName &&
                            source.type === 'resume' &&
                            source.status === 'success' && (
                              <span className="max-w-full truncate text-xs text-green-600 dark:text-green-400">
                                {resumeFileName.length > 20
                                  ? `...${resumeFileName.slice(-20)}`
                                  : resumeFileName}
                              </span>
                            )}
                          {/* Show LinkedIn filename if uploaded */}
                          {linkedinFileName &&
                            source.type === 'linkedin' &&
                            source.status === 'success' && (
                              <span className="max-w-full truncate text-xs text-green-600 dark:text-green-400">
                                {linkedinFileName.length > 20
                                  ? `...${linkedinFileName.slice(-20)}`
                                  : linkedinFileName}
                              </span>
                            )}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Manual Links Section */}
                <div className="border-t pt-4">
                  <Label className="text-sm font-medium">Add custom links</Label>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Portfolio, personal website, or any other links
                  </p>

                  {/* Existing links */}
                  {manualLinks.length > 0 && (
                    <div className="mb-3 space-y-2">
                      {manualLinks.map((link) => (
                        <div
                          key={link.id}
                          className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2"
                        >
                          <Link2 className="h-4 w-4 text-muted-foreground" />
                          <span className="flex-1 truncate text-sm">{link.label}</span>
                          <button
                            onClick={() => handleRemoveLink(link.id)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add new link */}
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://..."
                      value={newLinkUrl}
                      onChange={(e) => setNewLinkUrl(e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      placeholder="Label (optional)"
                      value={newLinkLabel}
                      onChange={(e) => setNewLinkLabel(e.target.value)}
                      className="w-32"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleAddLink}
                      disabled={!newLinkUrl.trim()}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Error message */}
            {error && (
              <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-3">
              <Button
                onClick={handleSubmit}
                disabled={isLoading || !data.handle}
                size="lg"
                className="gap-2"
              >
                {isLoading ? (
                  <>
                    <Spinner size="sm" />
                    Creating...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Create My Follio
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
