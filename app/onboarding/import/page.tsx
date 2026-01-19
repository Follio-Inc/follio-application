'use client';

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
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

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

export default function OnboardingImportPage() {
  const router = useRouter();
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Import states
  const [imports, setImports] = useState<Record<ImportSource, ImportStatus>>({
    resume: { source: 'resume', status: 'idle' },
    github: { source: 'github', status: 'idle' },
    linkedin: { source: 'linkedin', status: 'idle' },
    links: { source: 'links', status: 'idle' },
  });

  // Form states
  const [githubUsername, setGithubUsername] = useState('');
  const [showGithubInput, setShowGithubInput] = useState(false);
  const [manualLinks, setManualLinks] = useState<ManualLink[]>([{ url: '' }]);
  const [showLinksForm, setShowLinksForm] = useState(false);

  // Imported data (for display)
  const [importedData, setImportedData] = useState<Record<string, unknown>>({});

  const updateImportStatus = (source: ImportSource, update: Partial<ImportStatus>) => {
    setImports((prev) => ({
      ...prev,
      [source]: { ...prev[source], ...update },
    }));
  };

  // Resume upload handler
  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    updateImportStatus('resume', { status: 'importing', message: 'Parsing resume...' });

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

      setImportedData((prev) => ({ ...prev, resume: data.data }));
      updateImportStatus('resume', {
        status: 'success',
        message: data.message || 'Resume imported successfully',
        itemsImported: countImportedItems(data.data),
      });
    } catch (err) {
      updateImportStatus('resume', {
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to import resume',
      });
    }
  };

  // GitHub import handler
  const handleGitHubImport = async () => {
    if (!githubUsername.trim()) {
      setShowGithubInput(true);
      return;
    }

    updateImportStatus('github', { status: 'importing', message: 'Fetching GitHub data...' });

    try {
      const response = await fetch('/api/import/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: githubUsername.trim() }),
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
      setShowGithubInput(false);
    } catch (err) {
      updateImportStatus('github', {
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to import from GitHub',
      });
    }
  };

  // LinkedIn handler (placeholder)
  const handleLinkedInConnect = () => {
    updateImportStatus('linkedin', {
      status: 'idle',
      message: 'Coming soon! LinkedIn import is under development.',
    });
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

      // Redirect to profile preview
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
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Progress bar */}
      <div className="fixed left-0 right-0 top-0 h-1 bg-muted">
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
            description="Import from PDF or text file"
            status={imports.resume}
            onAction={() => document.getElementById('resume-upload')?.click()}
            actionLabel={imports.resume.status === 'success' ? 'Re-upload' : 'Upload'}
          >
            <input
              id="resume-upload"
              type="file"
              accept=".pdf,.txt,.doc,.docx"
              className="hidden"
              onChange={handleResumeUpload}
            />
          </ImportCard>

          {/* GitHub Connect */}
          <ImportCard
            icon={<Github className="h-5 w-5" />}
            title="Connect GitHub"
            description="Import projects, skills, and profile info"
            status={imports.github}
            onAction={() => setShowGithubInput(true)}
            actionLabel={imports.github.status === 'success' ? 'Reconnect' : 'Connect'}
          >
            {showGithubInput && imports.github.status !== 'success' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 flex gap-2"
              >
                <Input
                  placeholder="GitHub username"
                  value={githubUsername}
                  onChange={(e) => setGithubUsername(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleGitHubImport()}
                />
                <Button
                  onClick={handleGitHubImport}
                  disabled={imports.github.status === 'importing'}
                >
                  {imports.github.status === 'importing' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Import'
                  )}
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setShowGithubInput(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </motion.div>
            )}
          </ImportCard>

          {/* LinkedIn Connect (Coming Soon) */}
          <ImportCard
            icon={<Linkedin className="h-5 w-5" />}
            title="Connect LinkedIn"
            description="Import work history and connections"
            status={imports.linkedin}
            onAction={handleLinkedInConnect}
            actionLabel="Coming Soon"
            disabled
          />

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
    </div>
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
