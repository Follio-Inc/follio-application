'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useState } from 'react';

import { ConstellationField } from '@/components/onboarding/constellation/constellation-field';
import { Button } from '@/components/ui/button';
import { importStepNextLabel } from '@/lib/onboarding/step-action';
import {
  ONBOARDING_FOOTER,
  ONBOARDING_MAIN,
  ONBOARDING_PAGE_SHELL_WIDE,
  ONBOARDING_PAGE_SUBTITLE,
  ONBOARDING_PAGE_TITLE,
  ONBOARDING_STEP_HEADER,
  ONBOARDING_STEP_TRACK,
} from '@/lib/onboarding-ui';

const STEP_INDEX = 0; // Lab-only preview; live onboarding is resume-only for now
const STEP_COUNT = 1;
const PROGRESS_PCT = ((STEP_INDEX + 1) / STEP_COUNT) * 100;

/**
 * Lab preview of onboarding connect step (constellation).
 * Connect is not in the live onboarding path; wiring remains in /onboarding/import for re-enable.
 */
export default function ImportConstellationLabPage() {
  const [hasAction, setHasAction] = useState(false);
  const primaryNextLabel = importStepNextLabel(hasAction, true);

  return (
    <>
      <div className="fixed left-0 right-0 top-14 z-40 h-0.5 bg-muted">
        <div
          className="h-full bg-primary transition-[width] duration-300"
          style={{ width: `${PROGRESS_PCT}%` }}
        />
      </div>

      <div className={ONBOARDING_PAGE_SHELL_WIDE}>
        <div className={ONBOARDING_STEP_TRACK}>
          <div className="flex items-center gap-1.5" role="list" aria-label="Onboarding steps">
            {Array.from({ length: STEP_COUNT }, (_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full ${i <= STEP_INDEX ? 'bg-primary' : 'bg-muted'}`}
                role="listitem"
                aria-current={i === STEP_INDEX ? 'step' : undefined}
              />
            ))}
          </div>
        </div>

        <div className={ONBOARDING_STEP_HEADER}>
          <p className="text-eyebrow">
            Step {STEP_INDEX + 1} of {STEP_COUNT}
          </p>
          <h1 className={`mt-2 ${ONBOARDING_PAGE_TITLE}`}>Connect your accounts</h1>
          <p className={ONBOARDING_PAGE_SUBTITLE}>Import data from your professional profiles</p>
        </div>

        <div className={ONBOARDING_MAIN}>
          <ConstellationField onHasActionChange={setHasAction} />
        </div>

        <div className={ONBOARDING_FOOTER}>
          <div>
            <Button type="button" variant="ghost" className="gap-2" disabled>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              size="lg"
              variant={hasAction ? 'default' : 'outline'}
              className="gap-2"
              disabled
            >
              {primaryNextLabel}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
