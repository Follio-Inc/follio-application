'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileText,
  Github,
  Link2,
  Linkedin,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

type UserPurpose =
  | 'JOB_SEEKER'
  | 'FREELANCER'
  | 'STUDENT'
  | 'ENTREPRENEUR'
  | 'CONTENT_CREATOR'
  | 'OTHER';

interface OnboardingData {
  firstName: string;
  lastName: string;
  handle: string;
  headline: string;
  summary: string;
  location: string;
  purpose: UserPurpose | null;
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

const PURPOSE_OPTIONS: { value: UserPurpose; label: string; description: string }[] = [
  { value: 'JOB_SEEKER', label: 'Looking for a job', description: 'Showcase skills to recruiters' },
  {
    value: 'FREELANCER',
    label: 'Freelancer / Consultant',
    description: 'Attract clients and projects',
  },
  {
    value: 'STUDENT',
    label: 'Student / Recent Graduate',
    description: 'Build your professional presence',
  },
  {
    value: 'ENTREPRENEUR',
    label: 'Entrepreneur / Founder',
    description: 'Share your ventures and vision',
  },
  {
    value: 'CONTENT_CREATOR',
    label: 'Content Creator / Influencer',
    description: 'Centralize your online presence',
  },
  { value: 'OTHER', label: 'Just exploring', description: 'Create a personal portfolio' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [data, setData] = useState<OnboardingData>({
    firstName: '',
    lastName: '',
    handle: '',
    headline: '',
    summary: '',
    location: '',
    purpose: null,
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

  const totalSteps = 2;

  const handleDataChange = (field: keyof OnboardingData, value: string | UserPurpose | null) => {
    setData((prev) => ({ ...prev, [field]: value }));

    // Auto-generate handle from name
    if (field === 'firstName' || field === 'lastName') {
      const firstName = field === 'firstName' ? (value as string) : data.firstName;
      const lastName = field === 'lastName' ? (value as string) : data.lastName;
      const handle = `${firstName}${lastName}`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 20);
      setData((prev) => ({ ...prev, handle }));
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

      // Auto-fill data from resume
      if (result.data) {
        const parsed = result.data;
        setData((prev) => ({
          ...prev,
          firstName: parsed.firstName || prev.firstName,
          lastName: parsed.lastName || prev.lastName,
          headline: parsed.headline || prev.headline,
          summary: parsed.summary || prev.summary,
          location: parsed.location || prev.location,
        }));
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
    updateImportSource('github', { status: 'loading' });

    try {
      const username = prompt('Enter your GitHub username:');
      if (!username) {
        updateImportSource('github', { status: 'idle' });
        return;
      }

      const response = await fetch('/api/import/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch GitHub data');
      }

      const result = await response.json();
      updateImportSource('github', { status: 'success', data: result });
    } catch (err) {
      updateImportSource('github', {
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to import from GitHub',
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
      // Create profile
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: data.firstName,
          lastName: data.lastName,
          handle: data.handle,
          headline: data.headline,
          summary: data.summary,
          location: data.location,
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

      // Redirect to profile preview
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Progress bar */}
      <div className="fixed left-0 right-0 top-0 h-1 bg-muted">
        <motion.div
          className="h-full bg-primary"
          initial={{ width: '0%' }}
          animate={{ width: `${(step / totalSteps) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      <div className="mx-auto max-w-2xl px-4 py-16">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <span className="text-2xl font-bold text-primary-foreground">F</span>
          </div>
          <h1 className="text-2xl font-bold">Create your Follio</h1>
          <p className="mt-2 text-muted-foreground">
            Step {step} of {totalSteps}
          </p>
        </div>

        <AnimatePresence mode="wait">
          {/* Step 1: Purpose Selection (Dropdown) */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>What brings you to Follio?</CardTitle>
                  <CardDescription>
                    This helps us personalize your experience. You can skip this if you prefer.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="purpose">Your main goal (optional)</Label>
                    <Select
                      value={data.purpose || ''}
                      onValueChange={(value) => handleDataChange('purpose', value as UserPurpose)}
                    >
                      <SelectTrigger id="purpose" className="w-full">
                        <SelectValue placeholder="Select your purpose..." />
                      </SelectTrigger>
                      <SelectContent>
                        {PURPOSE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <div className="flex flex-col">
                              <span>{option.label}</span>
                              <span className="text-xs text-muted-foreground">
                                {option.description}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <Button variant="ghost" onClick={() => setStep(2)}>
                      Skip
                    </Button>
                    <Button onClick={() => setStep(2)} className="gap-2">
                      Continue
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Step 2: ONE-PAGE Import Hub + Basic Info */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              {/* Import Hub Card */}
              <Card>
                <CardHeader>
                  <CardTitle>Bring your data</CardTitle>
                  <CardDescription>
                    Import from multiple sources to auto-fill your profile, or skip and enter
                    manually.
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

                  {/* Import Sources Grid */}
                  <div className="grid gap-3 sm:grid-cols-3">
                    {importSources.map((source) => (
                      <button
                        key={source.id}
                        onClick={() => {
                          if (source.type === 'resume') {
                            fileInputRef.current?.click();
                          } else if (source.type === 'github') {
                            handleGitHubImport();
                          } else if (source.type === 'linkedin') {
                            // LinkedIn coming soon
                            alert('LinkedIn import coming soon!');
                          }
                        }}
                        disabled={source.status === 'loading' || source.type === 'linkedin'}
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
                        {source.type === 'linkedin' && (
                          <span className="absolute -right-2 -top-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
                            Soon
                          </span>
                        )}
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

              {/* Basic Info Card */}
              <Card>
                <CardHeader>
                  <CardTitle>Your profile details</CardTitle>
                  <CardDescription>
                    Enter your information or let it auto-fill from your imports above.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First name *</Label>
                      <Input
                        id="firstName"
                        value={data.firstName}
                        onChange={(e) => handleDataChange('firstName', e.target.value)}
                        placeholder="Alex"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last name</Label>
                      <Input
                        id="lastName"
                        value={data.lastName}
                        onChange={(e) => handleDataChange('lastName', e.target.value)}
                        placeholder="Chen"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="handle">Profile URL *</Label>
                    <div className="flex">
                      <span className="inline-flex items-center rounded-l-lg border border-r-0 bg-muted px-3 text-sm text-muted-foreground">
                        follio.dev/u/
                      </span>
                      <Input
                        id="handle"
                        value={data.handle}
                        onChange={(e) =>
                          handleDataChange(
                            'handle',
                            e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')
                          )
                        }
                        className="rounded-l-none"
                        placeholder="alexchen"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="headline">Headline</Label>
                    <Input
                      id="headline"
                      value={data.headline}
                      onChange={(e) => handleDataChange('headline', e.target.value)}
                      placeholder="Senior Software Engineer at Google"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="location">Location</Label>
                    <Input
                      id="location"
                      value={data.location}
                      onChange={(e) => handleDataChange('location', e.target.value)}
                      placeholder="San Francisco, CA"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="summary">About you</Label>
                    <Textarea
                      id="summary"
                      value={data.summary}
                      onChange={(e) => handleDataChange('summary', e.target.value)}
                      placeholder="Passionate software engineer with 5+ years of experience..."
                      rows={4}
                    />
                  </div>

                  {error && (
                    <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                      {error}
                    </div>
                  )}

                  <div className="flex justify-between pt-4">
                    <Button variant="ghost" onClick={() => setStep(1)} className="gap-2">
                      <ArrowLeft className="h-4 w-4" />
                      Back
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      disabled={isLoading || !data.firstName || !data.handle}
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
                          Create Profile
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
