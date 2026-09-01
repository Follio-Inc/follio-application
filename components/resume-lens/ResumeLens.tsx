'use client';

import { useCallback, useState, type ReactNode } from 'react';

import type { LensProfile, ResumeLensResult } from '@/lib/resume-lens';

import { ResumeLensCard } from './ResumeLensCard';
import { ResumeLensChrome } from './ResumeLensChrome';
import { useResumeLensHighlights } from './use-resume-lens-highlights';

interface ResumeLensProps {
  profile: LensProfile;
  host: HTMLElement | null;
  children: ReactNode;
}

/**
 * Viewer-only recruiter lens. Wraps the public resume: JD paste, match strip,
 * DOM highlights, hover explain. Builder preview must not mount this.
 */
export function ResumeLens({ profile, host, children }: ResumeLensProps) {
  const [lens, setLens] = useState<ResumeLensResult | null>(null);

  const onLensChange = useCallback((next: ResumeLensResult | null) => {
    setLens(next);
  }, []);

  useResumeLensHighlights(host, lens);

  return (
    <>
      <ResumeLensChrome profile={profile} lens={lens} onLensChange={onLensChange} />
      {children}
      <ResumeLensCard phrases={lens?.phrases ?? []} host={host} />
    </>
  );
}
