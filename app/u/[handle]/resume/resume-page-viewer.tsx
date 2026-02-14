'use client';

import Link from 'next/link';

import { ProfileNavbar } from '@/components/profile-navbar';
import { CleanResumeView } from '../views/clean-resume-view';

import type { PublicProfile } from '@/types';

interface ResumePageViewerProps {
  profile: PublicProfile;
  authState: 'owner' | 'authenticated' | 'anonymous';
  profileHandle: string;
}

export function ResumePageViewer({ profile, authState, profileHandle }: ResumePageViewerProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background">
      <ProfileNavbar authState={authState} profileHandle={profileHandle} />

      <main className="container max-w-5xl py-8 pb-24">
        <CleanResumeView profile={profile} profileHandle={profileHandle} />
      </main>

      <footer className="border-t bg-background py-6">
        <div className="container text-center text-sm text-muted-foreground">
          <p>
            Built with{' '}
            <Link href="/" className="font-medium text-primary hover:underline">
              Follio
            </Link>{' '}
            — Your professional identity, everywhere.
          </p>
        </div>
      </footer>
    </div>
  );
}
