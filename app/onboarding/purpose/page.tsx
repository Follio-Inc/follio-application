'use client';

import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
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
    <>
      {/* Progress bar — sits just beneath the app header */}
      <div className="fixed left-0 right-0 top-16 z-40 h-0.5 bg-muted">
        <motion.div
          className="h-full bg-primary"
          initial={{ width: '0%' }}
          animate={{ width: '33%' }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>

      <div className="mx-auto max-w-xl px-4 pb-24 pt-16 sm:px-6">
        {/* Step header */}
        <motion.header
          className="mb-10"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <p className="text-eyebrow">Welcome to Follio</p>
          <h1 className="text-display mt-3 text-3xl sm:text-4xl">What brings you here?</h1>
          <p className="mt-3 text-base text-muted-foreground">
            A quick note to help us tailor your profile. You can change this anytime in settings.
          </p>
        </motion.header>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08, ease: 'easeOut' }}
          className="space-y-8"
        >
          <div className="space-y-2">
            <Label htmlFor="purpose">Main purpose</Label>
            <Select value={purpose} onValueChange={setPurpose}>
              <SelectTrigger id="purpose" className="h-11 w-full">
                <SelectValue placeholder="Select your main purpose…" />
              </SelectTrigger>
              <SelectContent>
                {PURPOSE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex flex-col items-start">
                      <span>{option.label}</span>
                      <span className="text-xs text-muted-foreground">{option.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Optional — pick the closest match.</p>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-border/60 pt-6">
            <Button
              variant="ghost"
              onClick={handleSkip}
              disabled={isLoading}
              className="text-muted-foreground"
            >
              Skip for now
            </Button>
            <Button onClick={handleContinue} disabled={isLoading} className="gap-2" size="lg">
              {isLoading ? (
                <>
                  <Spinner size="sm" />
                  Continuing…
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </motion.div>
      </div>
    </>
  );
}
