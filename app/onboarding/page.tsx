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
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';

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

export default function OnboardingPage() {
  const router = useRouter();
  const { signOut } = useClerk();
  const { user, isLoaded: isUserLoaded } = useUser();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const linkedinFileInputRef = useRef<HTMLInputElement>(null);
  const [hasInitializedFromUser, setHasInitializedFromUser] = useState(false);
  const [showLinkedInHelp, setShowLinkedInHelp] = useState(false);
  const [showGitHubModal, setShowGitHubModal] = useState(false);
  const [githubUsername, setGithubUsername] = useState('');
  const [githubConnecting, setGithubConnecting] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);

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
    updateImportSource('resume', { status: 'loading' });

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/import/resume', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to parse resume');
      }

      const result = await response.json();
      updateImportSource('resume', { status: 'success', data: result });

      // If resume has middle name, update it
      if (result.data?.middleName) {
        handleMiddleNameChange(result.data.middleName);
      }
    } catch (err) {
      updateImportSource('resume', {
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to upload resume',
      });
    }
  };

  // GitHub import handler
  const handleGitHubImport = async () => {
    if (!githubUsername.trim()) {
      return;
    }

    updateImportSource('github', { status: 'loading' });
    setShowGitHubModal(false);

    try {
      const response = await fetch('/api/import/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: githubUsername.trim() }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch GitHub data');
      }

      const result = await response.json();
      updateImportSource('github', { status: 'success', data: result });
      setGithubUsername('');
    } catch (err) {
      updateImportSource('github', {
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to import from GitHub',
      });
    }
  };

  // LinkedIn import handler
  const handleLinkedInImport = async (file: File) => {
    updateImportSource('linkedin', { status: 'loading' });

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
      // Create profile with minimal data - everything else comes from imports
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: data.firstName,
          lastName: data.lastName,
          handle: data.handle,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create profile');
      }

      // Add manual links if any
      for (const link of manualLinks) {
        await fetch('/api/profile/links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: link.label,
            url: link.url,
          }),
        });
      }

      // Redirect to builder to build profile
      router.push('/builder');
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
          onClick={() => signOut({ redirectUrl: '/' })}
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
            <Card>
              <CardHeader>
                <CardTitle>Bring your data</CardTitle>
                <CardDescription>
                  Import from your existing sources to auto-build your profile. You can skip this
                  and add content later.
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
                  accept=".zip"
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
                      <p className="mb-4 text-sm text-muted-foreground">
                        LinkedIn doesn&apos;t allow direct access, but you can export your data:
                      </p>
                      <ol className="mb-4 space-y-2 text-sm">
                        <li className="flex gap-2">
                          <span className="font-medium text-primary">1.</span>
                          Go to LinkedIn → Settings → Data Privacy → Get a copy of your data
                        </li>
                        <li className="flex gap-2">
                          <span className="font-medium text-primary">2.</span>
                          Select &quot;Want something in particular?&quot; and check the boxes you
                          want
                        </li>
                        <li className="flex gap-2">
                          <span className="font-medium text-primary">3.</span>
                          Request archive and wait for the email (usually 10-15 minutes)
                        </li>
                        <li className="flex gap-2">
                          <span className="font-medium text-primary">4.</span>
                          Download the ZIP file and upload it here
                        </li>
                      </ol>
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
                          Upload ZIP
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
                                  ? 'Your account is connected'
                                  : 'Connect or enter your username'}
                              </p>
                            </div>
                          </div>

                          {/* Show connected account if exists */}
                          {connectedGithub ? (
                            <>
                              <button
                                onClick={() => {
                                  if (connectedGithub.username) {
                                    setGithubUsername(connectedGithub.username);
                                    handleGitHubImport();
                                  }
                                }}
                                className="mb-4 flex w-full items-center gap-3 rounded-lg border-2 border-green-500/30 bg-green-50 p-4 text-left transition-all hover:border-green-500/50 hover:bg-green-100 dark:bg-green-950/30 dark:hover:bg-green-950/50"
                              >
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                                  <Check className="h-5 w-5 text-green-600" />
                                </div>
                                <div className="flex-1">
                                  <p className="font-medium">{connectedGithub.username}</p>
                                  <p className="text-sm text-muted-foreground">
                                    Connected via GitHub
                                  </p>
                                </div>
                                <span className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                                  Import
                                </span>
                              </button>

                              {/* Divider for manual entry */}
                              <div className="mb-3 flex items-center gap-3">
                                <div className="h-px flex-1 bg-border" />
                                <span className="text-xs text-muted-foreground">
                                  or use different account
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
                              onClick={handleGitHubImport}
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
                  {importSources.map((source) => (
                    <button
                      key={source.id}
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
                      className={`relative flex flex-col items-center gap-2 rounded-xl border p-4 transition-all hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 ${
                        source.status === 'success'
                          ? 'border-green-500 bg-green-50 dark:bg-green-950'
                          : source.status === 'error'
                            ? 'border-red-500 bg-red-50 dark:bg-red-950'
                            : ''
                      }`}
                    >
                      {source.status === 'loading' ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : source.status === 'success' ? (
                        <Check className="h-5 w-5 text-green-600" />
                      ) : source.status === 'error' ? (
                        <X className="h-5 w-5 text-red-600" />
                      ) : (
                        getSourceIcon(source.type)
                      )}
                      <span className="text-sm font-medium">{getSourceLabel(source.type)}</span>
                    </button>
                  ))}
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
