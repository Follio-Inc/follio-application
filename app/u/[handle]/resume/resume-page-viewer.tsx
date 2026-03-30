'use client';

import Link from 'next/link';
import { useState } from 'react';

import { ProfileNavbar } from '@/components/profile-navbar';
import { CleanResumeView } from '../views/clean-resume-view';
import { SnapshotView } from '../views/snapshot-view';
import { TimelineView } from '../views/timeline-view';

import type { PublicProfile } from '@/types';

type ResumeTab = 'resume' | 'snapshot' | 'timeline';

const TABS: { id: ResumeTab; label: string }[] = [
  { id: 'resume', label: 'Resume' },
  { id: 'snapshot', label: 'Snapshot' },
  { id: 'timeline', label: 'Timeline' },
];

interface ResumePageViewerProps {
  profile: PublicProfile;
  authState: 'owner' | 'authenticated' | 'anonymous';
  profileHandle: string;
  /** When true, renders only the resume content without navbar/footer (used for print preview iframe). */
  minimal?: boolean;
}

export function ResumePageViewer({
  profile,
  authState,
  profileHandle,
  minimal,
}: ResumePageViewerProps) {
  const [activeTab, setActiveTab] = useState<ResumeTab>('resume');

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
    <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background">
      <ProfileNavbar authState={authState} profileHandle={profileHandle} />

      <main className="container max-w-5xl py-6 pb-24">
        {/* Inline toggle */}
        <div className="mb-3 flex justify-center">
          <div className="inline-flex gap-1 rounded-full bg-muted/60 p-0.5 text-xs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-full px-3.5 py-1 font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        {activeTab === 'resume' && (
          <CleanResumeView profile={profile} profileHandle={profileHandle} />
        )}
        {activeTab === 'snapshot' && <SnapshotView profile={profile} />}
        {activeTab === 'timeline' && <TimelineView profile={profile} />}
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
