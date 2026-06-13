'use client';

/**
 * ResumeShell
 *
 * Public chrome + body for the Resume document at `/u/[handle]/resume`.
 * Thin client wrapper so we can keep the browser tab title in sync
 * and provide consistent layout around the `<CleanResumeView>`.
 */

import Link from 'next/link';
import { useEffect } from 'react';

import { SiteHeader } from '@/components/site-header';

import { CleanResumeView } from './views/clean-resume-view';

import type { ContentVisibility, PublicProfile } from '@/types';

interface ResumeShellProps {
  profile: PublicProfile;
  authState: 'owner' | 'authenticated' | 'anonymous';
  profileHandle: string;
  resumeVisibility: ContentVisibility;
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
    <div className="min-h-screen bg-background">
      <SiteHeader profileHandle={profileHandle} authState={authState} />

      <main>
        <div className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6">
          <div className="relative mx-auto w-full max-w-[816px]">
            <CleanResumeView
              profile={profile}
              profileHandle={profileHandle}
              authState={authState}
            />
          </div>
        </div>
        <footer className="border-t border-border/50 bg-background py-6">
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
      </main>
    </div>
  );
}
