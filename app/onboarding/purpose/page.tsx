'use client';

import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';

const PURPOSE_OPTIONS = [
  { value: 'JOB_SEARCH', label: 'Job search', description: 'Looking for new opportunities' },
  {
    value: 'PERSONAL_BRAND',
    label: 'Personal brand',
    description: 'Build your professional presence',
  },
  { value: 'PROJECTS', label: 'Showcase projects', description: 'Display your work and portfolio' },
  { value: 'RESEARCH', label: 'Research', description: 'Academic or professional research' },
  { value: 'COMPANY', label: 'Company profile', description: 'Represent your organization' },
  { value: 'OTHER', label: 'Other', description: 'Something else entirely' },
];

export default function OnboardingPurposePage() {
  const router = useRouter();
  const [purpose, setPurpose] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Save purpose if selected (optional)
      if (purpose) {
        const response = await fetch('/api/onboarding/purpose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ purpose }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to save preference');
        }
      }

      // Navigate to import hub
      router.push('/onboarding/import');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setIsLoading(false);
    }
  };

  const handleSkip = () => {
    router.push('/onboarding/import');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Progress bar */}
      <div className="fixed left-0 right-0 top-0 h-1 bg-muted">
        <motion.div
          className="h-full bg-primary"
          initial={{ width: '0%' }}
          animate={{ width: '33%' }}
          transition={{ duration: 0.3 }}
        />
      </div>

      <div className="mx-auto max-w-lg px-4 py-16">
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
          <h1 className="text-3xl font-bold">Welcome to Follio</h1>
          <p className="mt-2 text-muted-foreground">Let&apos;s personalize your experience</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>What brings you to Follio?</CardTitle>
              <CardDescription>
                This helps us customize your profile. You can change this anytime.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="purpose">Main purpose (optional)</Label>
                <Select value={purpose} onValueChange={setPurpose}>
                  <SelectTrigger id="purpose" className="w-full">
                    <SelectValue placeholder="Select your main purpose..." />
                  </SelectTrigger>
                  <SelectContent>
                    {PURPOSE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex flex-col items-start">
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

              {error && (
                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-3 pt-2">
                <Button onClick={handleContinue} disabled={isLoading} className="gap-2" size="lg">
                  {isLoading ? (
                    <>
                      <Spinner size="sm" />
                      Continuing...
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
                  onClick={handleSkip}
                  disabled={isLoading}
                  className="text-muted-foreground"
                >
                  Skip for now
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Progress indicator */}
        <div className="mt-8 flex justify-center gap-2">
          <div className="h-2 w-8 rounded-full bg-primary" />
          <div className="h-2 w-8 rounded-full bg-muted" />
        </div>
      </div>
    </div>
  );
}
