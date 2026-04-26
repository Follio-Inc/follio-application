'use client';

/**
 * ResumePageViewer
 *
 * Thin wrapper around `<ResumeShell>` for `/u/[handle]/resume`. Also
 * supports a `minimal` mode used by the print preview iframe, which
 * renders just the resume body with no chrome or footer.
 */

import { ResumeShell } from '../resume-shell';
import { CleanResumeView } from '../views/clean-resume-view';

import type { ContentVisibility, PublicProfile } from '@/types';

interface ResumePageViewerProps {
  profile: PublicProfile;
  authState: 'owner' | 'authenticated' | 'anonymous';
  profileHandle: string;
  resumeVisibility: ContentVisibility;
  /** When true, renders only the resume content (used by the print preview iframe). */
  minimal?: boolean;
}

export function ResumePageViewer({
  profile,
  authState,
  profileHandle,
  resumeVisibility,
  minimal,
}: ResumePageViewerProps) {
  if (minimal) {
    return (
      <div className="bg-white">
        <main className="container max-w-5xl py-6">
          <CleanResumeView profile={profile} profileHandle={profileHandle} />
        </main>
      </div>
    );
  }

  return (
    <ResumeShell
      profile={profile}
      authState={authState}
      profileHandle={profileHandle}
      resumeVisibility={resumeVisibility}
    />
  );
}
