'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { FileText } from 'lucide-react';

export type ResumeParsingPhase = 'parsing' | 'finalizing';

export interface ResumeParsingOverlayProps {
  active: boolean;
  /** `parsing` = reading the PDF; `finalizing` = handing off (builder / next step). */
  phase?: ResumeParsingPhase;
  fileName?: string | null;
  /** Override title for the active phase. */
  title?: string;
  /** Override description for the active phase. */
  description?: string;
}

/**
 * Full-screen resume parse / handoff loader.
 * Shared by onboarding import and dashboard “upload resume” so both surfaces
 * show the same calm progress UI (spinner, copy, fake progress bar).
 */
export function ResumeParsingOverlay({
  active,
  phase = 'parsing',
  fileName,
  title,
  description,
}: ResumeParsingOverlayProps) {
  const isParsing = phase === 'parsing';
  const resolvedTitle = title ?? (isParsing ? 'Reading your resume' : 'Opening your resume');
  const resolvedDescription = description ?? (isParsing ? undefined : 'Taking you to the builder');
  const hint = isParsing ? 'This usually takes 10–30 seconds.' : 'Almost there…';

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm"
          aria-live="polite"
          aria-busy="true"
          role="status"
        >
          <motion.div
            initial={{ scale: 0.98, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.98, opacity: 0, y: 12 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="surface-raised mx-4 max-w-sm space-y-6 p-8 text-center"
          >
            <div className="relative mx-auto h-12 w-12">
              <div className="absolute inset-0 rounded-full border-2 border-border" />
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent"
                animate={{ rotate: 360 }}
                transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-section-title text-lg">{resolvedTitle}</h3>
              <p className="text-sm text-muted-foreground">
                {resolvedDescription ?? (
                  <>
                    Extracting experience, skills, and education
                    {fileName ? (
                      <>
                        {' '}
                        from <span className="font-medium text-foreground">{fileName}</span>
                      </>
                    ) : null}
                  </>
                )}
              </p>
            </div>

            <div className="space-y-2">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <motion.div
                  className="h-full rounded-full bg-primary"
                  initial={{ width: '5%' }}
                  animate={{ width: ['5%', '40%', '65%', '85%', '92%'] }}
                  transition={{ duration: 15, ease: 'easeOut', times: [0, 0.2, 0.5, 0.8, 1] }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
