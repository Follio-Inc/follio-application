'use client';

/**
 * ResumeShell
 *
 * Public chrome + body for the Resume document at `/u/[handle]/resume`.
 * Thin client wrapper so we can keep the browser tab title in sync
 * and provide consistent layout around the `<CleanResumeView>`.
 *
 * Mounts the recruiter reading lens (JD-aware highlights) as viewer-only
 * chrome. Builder preview does not use this shell.
 */

import { useEffect, useMemo, useState } from 'react';

import { PublicProfileChrome, useEffectiveAuthState } from '@/components/public-profile-chrome';
import { ResumeLens } from '@/components/resume-lens/ResumeLens';
import { parseResumeGlance } from '@/lib/resume/glance';

import { CleanResumeView } from './views/clean-resume-view';

import type { ContentVisibility, PublicProfile } from '@/types';

interface ResumeShellProps {
  profile: PublicProfile;
  authState: 'owner' | 'authenticated' | 'anonymous';
  profileHandle: string;
  resumeVisibility: ContentVisibility;
  /** `token` / `key` query so unlisted access survives the view switch. */
  accessQuery?: string;
  /** Deep link: highlights are already drawn. The resume is the same view. */
  initialHighlightsOpen?: boolean;
}

function ResumeShellBody({
  profile,
  authState,
  profileHandle,
  initialHighlightsOpen = false,
}: Pick<ResumeShellProps, 'profile' | 'authState' | 'profileHandle' | 'initialHighlightsOpen'>) {
  const effectiveAuthState = useEffectiveAuthState(authState);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [highlightsOpen, setHighlightsOpen] = useState(initialHighlightsOpen);
  const glance = useMemo(() => parseResumeGlance(profile.resumeGlance), [profile.resumeGlance]);

  useEffect(() => {
    if (!highlightsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHighlightsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [highlightsOpen]);

  useEffect(() => {
    const fullName = [profile.firstName, profile.middleName, profile.lastName]
      .filter(Boolean)
      .join(' ');
    const view = highlightsOpen ? 'Highlights' : 'Resume';
    document.title = `${fullName || profileHandle} — ${view} | Follio`;
  }, [highlightsOpen, profile.firstName, profile.middleName, profile.lastName, profileHandle]);

  return (
    <main>
      <div className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6">
        <div ref={setHost} className="relative mx-auto w-full max-w-[816px]">
          <ResumeLens profile={profile} host={host}>
            <CleanResumeView
              profile={profile}
              profileHandle={profileHandle}
              authState={effectiveAuthState}
              highlights={highlightsOpen ? glance : null}
              highlightsOpen={highlightsOpen}
              onViewHighlights={() => setHighlightsOpen((open) => !open)}
            />
          </ResumeLens>
        </div>
      </div>
    </main>
  );
}

export function ResumeShell({
  profile,
  authState,
  profileHandle,
  initialHighlightsOpen = false,
}: ResumeShellProps) {
  return (
    <PublicProfileChrome authState={authState} profileHandle={profileHandle}>
      <ResumeShellBody
        profile={profile}
        authState={authState}
        profileHandle={profileHandle}
        initialHighlightsOpen={initialHighlightsOpen}
      />
    </PublicProfileChrome>
  );
}
