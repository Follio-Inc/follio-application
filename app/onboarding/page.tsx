'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  Github,
  FileText,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';

type ImportMethod = 'manual' | 'resume' | 'github' | null;

interface OnboardingData {
  firstName: string;
  lastName: string;
  handle: string;
  headline: string;
  summary: string;
  location: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [importMethod, setImportMethod] = useState<ImportMethod>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OnboardingData>({
    firstName: '',
    lastName: '',
    handle: '',
    headline: '',
    summary: '',
    location: '',
  });

  const totalSteps = 3;

  const handleImportMethodSelect = (method: ImportMethod) => {
    setImportMethod(method);
    setStep(2);
  };

  const handleDataChange = (field: keyof OnboardingData, value: string) => {
    setData((prev) => ({ ...prev, [field]: value }));

    // Auto-generate handle from name
    if (field === 'firstName' || field === 'lastName') {
      const firstName = field === 'firstName' ? value : data.firstName;
      const lastName = field === 'lastName' ? value : data.lastName;
      const handle = `${firstName}${lastName}`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 20);
      setData((prev) => ({ ...prev, handle }));
    }
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create profile');
      }

      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsLoading(false);
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
          {/* Step 1: Choose Import Method */}
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
                  <CardTitle>How would you like to start?</CardTitle>
                  <CardDescription>
                    Choose how to populate your profile. You can always edit everything later.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <button
                    onClick={() => handleImportMethodSelect('manual')}
                    className="flex items-center gap-4 rounded-xl border p-4 text-left transition-colors hover:bg-muted"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                      <Sparkles className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <div className="font-medium">Start from scratch</div>
                      <div className="text-sm text-muted-foreground">
                        Manually enter your information
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleImportMethodSelect('resume')}
                    className="flex items-center gap-4 rounded-xl border p-4 text-left transition-colors hover:bg-muted"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                      <Upload className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <div className="font-medium">Upload resume</div>
                      <div className="text-sm text-muted-foreground">
                        Import from PDF or DOCX file
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleImportMethodSelect('github')}
                    className="flex items-center gap-4 rounded-xl border p-4 text-left transition-colors hover:bg-muted"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                      <Github className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <div className="font-medium">Connect GitHub</div>
                      <div className="text-sm text-muted-foreground">Import projects and repos</div>
                    </div>
                  </button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Step 2: Basic Info */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>Tell us about yourself</CardTitle>
                  <CardDescription>
                    This information will appear on your public profile.
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

                  <div className="flex justify-between pt-4">
                    <Button variant="ghost" onClick={() => setStep(1)} className="gap-2">
                      <ArrowLeft className="h-4 w-4" />
                      Back
                    </Button>
                    <Button
                      onClick={() => setStep(3)}
                      disabled={!data.firstName || !data.handle}
                      className="gap-2"
                    >
                      Continue
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Step 3: Summary */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>Add a summary</CardTitle>
                  <CardDescription>
                    Write a brief bio that introduces you to visitors.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="summary">About you</Label>
                    <Textarea
                      id="summary"
                      value={data.summary}
                      onChange={(e) => handleDataChange('summary', e.target.value)}
                      placeholder="Passionate software engineer with 5+ years of experience building web applications..."
                      rows={6}
                    />
                    <p className="text-xs text-muted-foreground">
                      {data.summary.length}/500 characters
                    </p>
                  </div>

                  {error && (
                    <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                      {error}
                    </div>
                  )}

                  <div className="flex justify-between pt-4">
                    <Button variant="ghost" onClick={() => setStep(2)} className="gap-2">
                      <ArrowLeft className="h-4 w-4" />
                      Back
                    </Button>
                    <Button onClick={handleSubmit} disabled={isLoading} className="gap-2">
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
