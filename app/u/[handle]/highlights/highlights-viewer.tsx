'use client';

import { FileText } from 'lucide-react';
import { useEffect } from 'react';

import { HighlightView } from '@/components/resume-highlights/highlight-view';
import { PublicProfileChrome } from '@/components/public-profile-chrome';
import { ViewHighlightsButton } from '@/components/resume-presentation/view-highlights-button';
import { resumePresentationHref } from '@/lib/resume/presentation';
import type { PublicProfile } from '@/types';

interface HighlightsViewerProps {
  profile: PublicProfile;
  authState: 'owner' | 'authenticated' | 'anonymous';
  profileHandle: string;
  /** `token` / `key` query so unlisted access survives the return to the resume. */
  accessQuery?: string;
}

export function HighlightsViewer({
  profile,
  authState,
  profileHandle,
  accessQuery = '',
}: HighlightsViewerProps) {
  useEffect(() => {
    const fullName = [profile.firstName, profile.middleName, profile.lastName]
      .filter(Boolean)
      .join(' ');
    document.title = `${fullName || profileHandle} — Highlights | Follio`;
  }, [profile.firstName, profile.middleName, profile.lastName, profileHandle]);

  return (
    <PublicProfileChrome authState={authState} profileHandle={profileHandle}>
      <main>
        <div className="relative mx-auto w-full max-w-xl px-5 pb-24 pt-8 sm:px-6 sm:pt-10">
          <div className="pointer-events-none absolute right-5 top-8 z-30 sm:right-6 sm:top-10">
            <ViewHighlightsButton
              href={resumePresentationHref(profileHandle, 'resume', accessQuery)}
              label="View resume"
              icon={<FileText className="h-[18px] w-[18px]" />}
            />
          </div>
          <div className="pr-12">
            <HighlightView profile={profile} />
          </div>
        </div>
      </main>
    </PublicProfileChrome>
  );
}
