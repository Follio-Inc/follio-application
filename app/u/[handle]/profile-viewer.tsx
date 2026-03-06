'use client';

import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import Link from 'next/link';
import { useState } from 'react';

import { ProfileNavbar } from '@/components/profile-navbar';

import { ViewSwitcher } from './view-switcher';
import { PortfolioView } from './views/portfolio-view';
import { SnapshotView } from './views/snapshot-view';
import { TimelineView } from './views/timeline-view';

import type { PortfolioView as PortfolioViewType, PublicProfile } from '@/types';

interface ProfileViewerProps {
  profile: PublicProfile;
  initialView: PortfolioViewType;
  authState: 'owner' | 'authenticated' | 'anonymous';
  profileHandle: string;
  resumeVisibility: 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
  /** When true, hides navbar, view switcher, and footer (used for dashboard thumbnail). */
  embed?: boolean;
}

export function ProfileViewer({
  profile,
  initialView,
  authState,
  profileHandle,
  resumeVisibility,
  embed = false,
}: ProfileViewerProps) {
  const [currentView, setCurrentView] = useState<PortfolioViewType>(initialView);

  const handleViewChange = (view: PortfolioViewType) => {
    setCurrentView(view);
    // Update URL without navigation
    window.history.replaceState(null, '', `?view=${view}`);
  };

  return (
    <MotionConfig reducedMotion={embed ? 'always' : 'never'}>
      <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background">
        {!embed && <ProfileNavbar authState={authState} profileHandle={profileHandle} />}

        {!embed && <ViewSwitcher currentView={currentView} onViewChange={handleViewChange} />}

        {embed ? (
          /* Embed mode: render instantly without AnimatePresence wrapper */
          <main className="container max-w-5xl py-8 pb-24">
            {currentView === 'portfolio' && (
              <PortfolioView
                profile={profile}
                profileHandle={profileHandle}
                resumeVisibility={resumeVisibility}
                authState={authState}
              />
            )}
            {currentView === 'timeline' && <TimelineView profile={profile} />}
            {currentView === 'snapshot' && <SnapshotView profile={profile} />}
          </main>
        ) : (
          <AnimatePresence mode="wait">
            <motion.main
              key={currentView}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="container max-w-5xl py-8 pb-24"
            >
              {currentView === 'portfolio' && (
                <PortfolioView
                  profile={profile}
                  profileHandle={profileHandle}
                  resumeVisibility={resumeVisibility}
                  authState={authState}
                />
              )}
              {currentView === 'timeline' && <TimelineView profile={profile} />}
              {currentView === 'snapshot' && <SnapshotView profile={profile} />}
            </motion.main>
          </AnimatePresence>
        )}

        {!embed && (
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
        )}
      </div>
    </MotionConfig>
  );
}
