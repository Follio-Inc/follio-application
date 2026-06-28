'use client';

/**
 * ResumeShell
 *
 * Public chrome + body for the Resume document at `/u/[handle]/resume`.
 * Thin client wrapper so we can keep the browser tab title in sync
 * and provide consistent layout around the `<CleanResumeView>`.
 */

import { useEffect } from 'react';

import { PublicProfileChrome, useEffectiveAuthState } from '@/components/public-profile-chrome';

import { CleanResumeView } from './views/clean-resume-view';

import type { ContentVisibility, PublicProfile } from '@/types';

interface ResumeShellProps {
  profile: PublicProfile;
  authState: 'owner' | 'authenticated' | 'anonymous';
  profileHandle: string;
  resumeVisibility: ContentVisibility;
}

function ResumeShellBody({
  profile,
  authState,
  profileHandle,
}: Pick<ResumeShellProps, 'profile' | 'authState' | 'profileHandle'>) {
  const effectiveAuthState = useEffectiveAuthState(authState);

  return (
    <main>
      <div className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6">
        <div className="relative mx-auto w-full max-w-[816px]">
          <CleanResumeView
            profile={profile}
            profileHandle={profileHandle}
            authState={effectiveAuthState}
          />
        </div>
      </div>
    </main>
  );
}

export function ResumeShell({ profile, authState, profileHandle }: ResumeShellProps) {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const fullName = [profile.firstName, profile.middleName, profile.lastName]
      .filter(Boolean)
      .join(' ');
    document.title = `${fullName} — Resume | Follio`;
  }, [profile.firstName, profile.middleName, profile.lastName]);

  return (
    <PublicProfileChrome authState={authState} profileHandle={profileHandle}>
      <ResumeShellBody profile={profile} authState={authState} profileHandle={profileHandle} />
    </PublicProfileChrome>
  );
}
