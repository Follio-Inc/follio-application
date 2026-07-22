'use client';

import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  ONBOARDING_CARD_DESCRIPTION,
  ONBOARDING_CARD_TITLE,
  ONBOARDING_FOOTER,
  ONBOARDING_PAGE_SHELL,
  ONBOARDING_PAGE_SUBTITLE,
  ONBOARDING_PAGE_TITLE,
  ONBOARDING_SURFACE_INTERACTIVE,
  ONBOARDING_SURFACE_PAD,
  ONBOARDING_SURFACE_SELECTED,
} from '@/lib/onboarding-ui';
import { cn } from '@/lib/utils';

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
      <div className="fixed left-0 right-0 top-14 z-40 h-0.5 bg-muted">
        <motion.div
          className="h-full bg-primary"
          initial={{ width: '0%' }}
          animate={{ width: '33%' }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>

      <div className={ONBOARDING_PAGE_SHELL}>
        <motion.header
          className="mb-5 shrink-0"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <p className="text-eyebrow">Welcome to Follio</p>
          <h1 className={`mt-2 ${ONBOARDING_PAGE_TITLE}`}>What brings you here?</h1>
          <p className={ONBOARDING_PAGE_SUBTITLE}>
            A quick note to help us tailor your profile. You can change this anytime in settings.
          </p>
        </motion.header>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08, ease: 'easeOut' }}
          className="flex min-h-0 flex-1 flex-col space-y-5"
        >
          <div
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3.5"
            role="group"
            aria-label="Main purpose"
          >
            {PURPOSE_OPTIONS.map((option, index) => {
              const selected = purpose === option.value;
              return (
                <motion.button
                  key={option.value}
                  type="button"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, delay: 0.06 + index * 0.04, ease: 'easeOut' }}
                  onClick={() => setPurpose(option.value)}
                  aria-pressed={selected}
                  className={cn(
                    `${ONBOARDING_SURFACE_PAD} text-left`,
                    ONBOARDING_SURFACE_INTERACTIVE,
                    selected && ONBOARDING_SURFACE_SELECTED
                  )}
                >
                  <span className={`block ${ONBOARDING_CARD_TITLE} sm:text-[15px]`}>
                    {option.label}
                  </span>
                  <span className={`mt-1 block ${ONBOARDING_CARD_DESCRIPTION}`}>
                    {option.description}
                  </span>
                </motion.button>
              );
            })}
          </div>

          <p className={ONBOARDING_CARD_DESCRIPTION}>Optional — pick the closest match.</p>

          {error && (
            <div
              role="alert"
              className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          <div className={ONBOARDING_FOOTER}>
            <div />
            <Button
              onClick={purpose ? handleContinue : handleSkip}
              disabled={isLoading}
              className="gap-2"
              variant={purpose ? 'default' : 'outline'}
            >
              {isLoading ? (
                <>
                  <Spinner size="sm" />
                  Continuing…
                </>
              ) : (
                <>
                  {purpose ? 'Continue' : 'Skip to Next Step'}
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
