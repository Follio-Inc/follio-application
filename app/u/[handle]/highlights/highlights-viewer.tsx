'use client';

import { ResumeShell } from '../resume-shell';

import type { ContentVisibility, PublicProfile } from '@/types';

interface HighlightsViewerProps {
  profile: PublicProfile;
  authState: 'owner' | 'authenticated' | 'anonymous';
  profileHandle: string;
  resumeVisibility: ContentVisibility;
  /** `token` / `key` query so unlisted access survives the return to the resume. */
  accessQuery?: string;
}

/** Same resume, with the stored glance already open. */
export function HighlightsViewer({
  profile,
  authState,
  profileHandle,
  resumeVisibility,
  accessQuery = '',
}: HighlightsViewerProps) {
  return (
    <ResumeShell
      profile={profile}
      authState={authState}
      profileHandle={profileHandle}
      resumeVisibility={resumeVisibility}
      accessQuery={accessQuery}
      initialHighlightsOpen
    />
  );
}
