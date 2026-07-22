'use client';

import { ArrowRight } from 'lucide-react';
import { useState } from 'react';

import { ConstellationField } from './constellation-field';
import { Button } from '@/components/ui/button';
import {
  ONBOARDING_FOOTER,
  ONBOARDING_MAIN,
  ONBOARDING_PAGE_SHELL_WIDE,
  ONBOARDING_PAGE_SUBTITLE,
  ONBOARDING_PAGE_TITLE,
  ONBOARDING_STEP_HEADER,
  ONBOARDING_STEP_TRACK,
} from '@/lib/onboarding-ui';

/**
 * Preview of a multi-platform connect step.
 * Same shell / chrome / tokens as onboarding — not wired into the live flow yet.
 * Open: /lab/import-constellation
 */
export default function ImportConstellationLabPage() {
  const [connectedCount, setConnectedCount] = useState(0);

  return (
    <div className={ONBOARDING_PAGE_SHELL_WIDE}>
      <div className={ONBOARDING_STEP_TRACK}>
        <div className="flex items-center gap-1.5" role="list" aria-label="Onboarding steps">
          <div className="h-1 flex-1 rounded-full bg-primary" role="listitem" aria-current="step" />
          <div className="h-1 flex-1 rounded-full bg-muted" role="listitem" />
          <div className="h-1 flex-1 rounded-full bg-muted" role="listitem" />
        </div>
      </div>

      <div className={ONBOARDING_STEP_HEADER}>
        <p className="text-eyebrow">Connect profiles</p>
        <h1 className={`mt-2 ${ONBOARDING_PAGE_TITLE}`}>Bring everything that represents you</h1>
        <p className={ONBOARDING_PAGE_SUBTITLE}>
          Drag marks to arrange the field. Tap without dragging to paste a link. When it looks right,
          hit Copy seats and we&apos;ll lock the design.
        </p>
      </div>

      <div className={ONBOARDING_MAIN}>
        <ConstellationField onConnectedChange={setConnectedCount} />
      </div>

      <div className={ONBOARDING_FOOTER}>
        <Button type="button" variant="ghost" className="gap-2" disabled>
          Back
        </Button>
        <Button type="button" className="gap-2" disabled={connectedCount === 0}>
          Continue
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
