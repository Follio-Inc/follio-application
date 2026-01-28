'use client';

import { useUser } from '@clerk/nextjs';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Github,
  Linkedin,
  Link as LinkIcon,
  Loader2,
  Plus,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

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

interface ImportDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId: string;
  onImportComplete: () => void;
}

export function ImportDataDialog({ open, onOpenChange, onImportComplete }: ImportDataDialogProps) {
  const { user } = useUser();

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

  // Track if any import was successful (to refresh profile data)
  const [hasImported, setHasImported] = useState(false);

  // Get connected GitHub account from Clerk
  const connectedGithub = user?.externalAccounts?.find((a) => a.provider === 'github');
  const githubUsernameFromAccount = connectedGithub?.username ?? null;

  // Get connected LinkedIn account from Clerk
  const connectedLinkedin = user?.externalAccounts?.find((a) => {
    const provider = a.provider as string;
    return (
      provider === 'linkedin_oidc' ||
      provider === 'linkedin' ||
      provider === 'oauth_linkedin_oidc' ||
      provider === 'oauth_linkedin'
    );
  });
  const linkedinName =
    connectedLinkedin?.firstName && connectedLinkedin?.lastName
      ? `${connectedLinkedin.firstName} ${connectedLinkedin.lastName}`
      : (connectedLinkedin?.username ?? null);

  // Reset states when dialog opens/closes
  useEffect(() => {
    if (!open) {
      // Reset import states when dialog closes
      setImports({
        resume: { source: 'resume', status: 'idle' },
        github: { source: 'github', status: 'idle' },
        linkedin: { source: 'linkedin', status: 'idle' },
        links: { source: 'links', status: 'idle' },
      });
      setGithubError(null);
      setLinkedinError(null);
      setShowLinksForm(false);
      setManualLinks([{ url: '' }]);

      // Notify parent if any import was successful
      if (hasImported) {
        onImportComplete();
        setHasImported(false);
      }
    }
  }, [open, hasImported, onImportComplete]);

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

    const primaryEmail = user?.primaryEmailAddress;
    if (!primaryEmail?.verification?.status || primaryEmail.verification.status !== 'verified') {
      setGithubError('Please verify your email first to connect GitHub.');
      setGithubConnecting(false);
      return;
    }

    try {
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
        setGithubError('Email verification required. Please verify your email first.');
      } else if (errorMessage.includes('already connected')) {
        await user?.reload();
        setGithubError(null);
      } else {
        setGithubError(`Connection failed: ${errorMessage}`);
      }
      setGithubConnecting(false);
    }
  };

  // Resume upload handler
  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      updateImportStatus('resume', {
        status: 'error',
        message: 'Only PDF files are supported.',
      });
      return;
    }

    updateImportStatus('resume', { status: 'importing', message: 'Parsing resume...' });

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('saveToProfile', 'true'); // Save directly to profile in Builder mode

      const response = await fetch('/api/import/resume', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to parse resume');
      }

      const itemCount = countResumeItems(data.data);
      updateImportStatus('resume', {
        status: 'success',
        message: `Imported ${itemCount} items`,
        itemsImported: itemCount,
      });
      setHasImported(true);
    } catch (err) {
      updateImportStatus('resume', {
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to import resume',
      });
    }
  };

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
        body: JSON.stringify({ username: resolvedUsername, saveToProfile: true }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to import from GitHub');
      }

      updateImportStatus('github', {
        status: 'success',
        message: data.message || `Imported ${data.data?.summary?.projects || 0} projects`,
        itemsImported: (data.data?.summary?.projects || 0) + (data.data?.summary?.skills || 0),
      });
      setGithubUsername(resolvedUsername);
      setHasImported(true);
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

    const primaryEmail = user?.primaryEmailAddress;
    if (!primaryEmail?.verification?.status || primaryEmail.verification.status !== 'verified') {
      setLinkedinError('Please verify your email first to connect LinkedIn.');
      setLinkedinConnecting(false);
      return;
    }

    try {
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
        await user?.reload();
        setLinkedinError(null);
      } else {
        setLinkedinError(`Connection failed: ${errorMessage}`);
      }
      setLinkedinConnecting(false);
    }
  };

  // LinkedIn import handler
  const handleLinkedInImport = async () => {
    updateImportStatus('linkedin', {
      status: 'importing',
      message: 'Fetching LinkedIn data...',
    });

    try {
      const response = await fetch('/api/import/linkedin/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saveToProfile: true }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to import from LinkedIn');
      }

      updateImportStatus('linkedin', {
        status: 'success',
        message: data.message || 'Imported profile data',
        itemsImported: data.data?.summary?.total || 1,
      });
      setHasImported(true);
    } catch (err) {
      updateImportStatus('linkedin', {
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to import from LinkedIn',
      });
    }
  };

  // Manual links handlers
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
        body: JSON.stringify({ links: validLinks, saveToProfile: true }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process links');
      }

      updateImportStatus('links', {
        status: 'success',
        message: `Added ${data.data?.summary?.links || validLinks.length} links`,
        itemsImported: data.data?.summary?.links || validLinks.length,
      });
      setShowLinksForm(false);
      setHasImported(true);
    } catch (err) {
      updateImportStatus('links', {
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to process links',
      });
    }
  };

  const hasAnyImport = Object.values(imports).some((i) => i.status === 'success');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Import Data
          </DialogTitle>
          <DialogDescription>
            Import data from your connected accounts or upload a resume. This will merge with your
            existing profile data.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Resume Upload */}
          <Card>
            <CardContent className="flex items-start gap-4 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">Upload Resume</h3>
                    {imports.resume.status === 'importing' && (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    )}
                    {imports.resume.status === 'success' && (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    )}
                    {imports.resume.status === 'error' && (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                  {imports.resume.status === 'success' && (
                    <Badge variant="default" className="bg-green-500/10 text-green-600">
                      {imports.resume.itemsImported} items
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">Import from PDF resume</p>
                {imports.resume.message && imports.resume.status !== 'idle' && (
                  <p
                    className={`mt-1 text-xs ${
                      imports.resume.status === 'error'
                        ? 'text-destructive'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {imports.resume.message}
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => document.getElementById('resume-upload-builder')?.click()}
                disabled={imports.resume.status === 'importing'}
                className="shrink-0"
              >
                {imports.resume.status === 'importing' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload
                  </>
                )}
              </Button>
              <input
                id="resume-upload-builder"
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={handleResumeUpload}
              />
            </CardContent>
          </Card>

          {/* GitHub Connect */}
          <Card>
            <CardContent className="flex items-start gap-4 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Github className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">GitHub</h3>
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
                  {connectedGithub ? (
                    <Badge variant="default" className="bg-green-500/10 text-green-600">
                      @{githubUsernameFromAccount}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Not connected</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {connectedGithub
                    ? 'Import projects and skills from GitHub'
                    : 'Connect to import projects and skills'}
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
              {!connectedGithub ? (
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
                  onClick={() => handleGitHubImport(githubUsernameFromAccount!)}
                  disabled={imports.github.status === 'importing'}
                  className="shrink-0"
                >
                  {imports.github.status === 'importing' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Import'
                  )}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* LinkedIn Connect */}
          <Card>
            <CardContent className="flex items-start gap-4 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Linkedin className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">LinkedIn</h3>
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
                  {connectedLinkedin ? (
                    <Badge variant="default" className="bg-green-500/10 text-green-600">
                      {linkedinName || 'Connected'}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Not connected</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {connectedLinkedin
                    ? 'Import profile data from LinkedIn'
                    : 'Connect to import profile data'}
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
              {!connectedLinkedin ? (
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
                  ) : (
                    'Import'
                  )}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Manual Links */}
          <Card>
            <CardContent className="flex flex-col gap-4 p-4">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <LinkIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">Add Links</h3>
                      {imports.links.status === 'importing' && (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      )}
                      {imports.links.status === 'success' && (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      )}
                      {imports.links.status === 'error' && (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      )}
                    </div>
                    {imports.links.status === 'success' && (
                      <Badge variant="default" className="bg-green-500/10 text-green-600">
                        {imports.links.itemsImported} links
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Website, Notion, Medium, or any URL
                  </p>
                  {imports.links.message && imports.links.status !== 'idle' && (
                    <p
                      className={`mt-1 text-xs ${
                        imports.links.status === 'error'
                          ? 'text-destructive'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {imports.links.message}
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowLinksForm(!showLinksForm)}
                  disabled={imports.links.status === 'importing'}
                  className="shrink-0"
                >
                  {showLinksForm ? 'Cancel' : 'Add Links'}
                </Button>
              </div>

              {showLinksForm && (
                <div className="space-y-3 border-t pt-4">
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
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Success summary */}
        {hasAnyImport && (
          <div className="rounded-lg bg-green-500/10 p-3 text-center text-sm text-green-600">
            Import successful! Close this dialog to see your updated profile.
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {hasAnyImport ? 'Done' : 'Cancel'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
