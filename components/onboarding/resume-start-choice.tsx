'use client';

import { motion } from 'framer-motion';

import { buttonVariants } from '@/components/ui/button';
import { ONBOARDING_CARD_DESCRIPTION, ONBOARDING_SURFACE_INTERACTIVE } from '@/lib/onboarding-ui';
import { cn } from '@/lib/utils';

export type ResumeStartPath = 'blank' | 'upload';

export const RESUME_START_OPTIONS = [
  {
    id: 'upload' as const,
    title: 'Upload Resume',
    description: "Import a PDF and we'll extract your experience, education, and skills.",
  },
  {
    id: 'blank' as const,
    title: 'Start Blank',
    description: 'Build your resume from scratch with a clean, empty template.',
  },
] as const;

interface ResumeStartChoiceProps {
  onSelect: (path: ResumeStartPath) => void;
}

/** Existing resume — thin stroke lines: title, summary, 3 uneven sections. */
function ExistingResumeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 85 110"
      className={className}
      aria-hidden
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="4"
        y="4"
        width="77"
        height="102"
        rx="3"
        className="fill-background stroke-border"
        strokeWidth="1.25"
      />

      {/* Centered title */}
      <line
        x1="27"
        y1="15"
        x2="58"
        y2="15"
        className="stroke-foreground/70"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      {/* Centered subtitle */}
      <line
        x1="31"
        y1="20.5"
        x2="54"
        y2="20.5"
        className="stroke-muted-foreground/45"
        strokeWidth="1"
        strokeLinecap="round"
      />

      {/* Summary — no section head, 2 bars */}
      <line
        x1="16"
        y1="28.5"
        x2="69"
        y2="28.5"
        className="stroke-muted-foreground/35"
        strokeWidth="0.9"
        strokeLinecap="round"
      />
      <line
        x1="16"
        y1="33"
        x2="69"
        y2="33"
        className="stroke-muted-foreground/35"
        strokeWidth="0.9"
        strokeLinecap="round"
      />

      {/* Section 1 — widest head, 3 content bars */}
      <line
        x1="16"
        y1="42"
        x2="40"
        y2="42"
        className="stroke-foreground/55"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      <line
        x1="16"
        y1="47.5"
        x2="69"
        y2="47.5"
        className="stroke-muted-foreground/35"
        strokeWidth="0.9"
        strokeLinecap="round"
      />
      <line
        x1="16"
        y1="52"
        x2="69"
        y2="52"
        className="stroke-muted-foreground/35"
        strokeWidth="0.9"
        strokeLinecap="round"
      />
      <line
        x1="16"
        y1="56.5"
        x2="69"
        y2="56.5"
        className="stroke-muted-foreground/35"
        strokeWidth="0.9"
        strokeLinecap="round"
      />

      {/* Section 2 — medium head, 1 content bar */}
      <line
        x1="16"
        y1="65.5"
        x2="32"
        y2="65.5"
        className="stroke-foreground/55"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      <line
        x1="16"
        y1="71"
        x2="69"
        y2="71"
        className="stroke-muted-foreground/35"
        strokeWidth="0.9"
        strokeLinecap="round"
      />

      {/* Section 3 — shortest head, 2 content bars */}
      <line
        x1="16"
        y1="80"
        x2="28"
        y2="80"
        className="stroke-foreground/55"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      <line
        x1="16"
        y1="85.5"
        x2="69"
        y2="85.5"
        className="stroke-muted-foreground/35"
        strokeWidth="0.9"
        strokeLinecap="round"
      />
      <line
        x1="16"
        y1="90"
        x2="69"
        y2="90"
        className="stroke-muted-foreground/35"
        strokeWidth="0.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Blank resume — empty page with soft margin. */
function BlankResumeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 85 110"
      className={className}
      aria-hidden
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="4"
        y="4"
        width="77"
        height="102"
        rx="3"
        className="fill-background stroke-border"
        strokeWidth="1.25"
      />
      <rect
        x="16"
        y="16"
        width="53"
        height="78"
        rx="1.5"
        className="stroke-muted-foreground/20"
        strokeWidth="1"
        strokeDasharray="2.5 2"
      />
    </svg>
  );
}

/**
 * First onboarding decision: upload an existing resume or start blank.
 * Options are shown as side-by-side boxed US-letter thumbnails.
 * Upload opens the file picker on this same page; Start blank advances.
 */
export function ResumeStartChoice({ onSelect }: ResumeStartChoiceProps) {
  return (
    <div
      className="mx-auto grid w-full max-w-xl grid-cols-2 gap-4 sm:gap-5"
      role="group"
      aria-label="How to start"
    >
      {RESUME_START_OPTIONS.map((option, index) => {
        const isUpload = option.id === 'upload';

        return (
          <motion.button
            key={option.id}
            type="button"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: 0.06 + index * 0.06, ease: 'easeOut' }}
            onClick={() => onSelect(option.id)}
            className={`group flex flex-col items-center gap-3 px-3 pb-4 pt-5 text-center sm:gap-3.5 sm:px-4 sm:pb-5 sm:pt-6 ${ONBOARDING_SURFACE_INTERACTIVE}`}
          >
            {/* US Letter ≈ 8.5 × 11 — sized to keep Next above the fold on laptops */}
            <span className="flex aspect-[8.5/11] w-[6.25rem] items-center justify-center rounded-xl bg-muted/40 p-2 ring-1 ring-inset ring-border/40 transition-colors duration-200 group-hover:bg-muted/55 sm:w-[7.25rem] sm:p-2.5">
              {isUpload ? (
                <ExistingResumeIcon className="h-full w-full" />
              ) : (
                <BlankResumeIcon className="h-full w-full" />
              )}
            </span>

            <span className="flex w-full flex-col items-center gap-2">
              {/* Visual primary CTA — card is the real button (no nested <button>) */}
              <span
                className={cn(
                  buttonVariants({ size: 'default' }),
                  'pointer-events-none w-full max-w-[11.5rem] sm:max-w-[12.5rem]'
                )}
              >
                {option.title}
              </span>
              <span className={`max-w-[13.5rem] ${ONBOARDING_CARD_DESCRIPTION}`}>
                {option.description}
              </span>
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
