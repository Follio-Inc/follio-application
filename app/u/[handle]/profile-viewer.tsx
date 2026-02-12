'use client';

import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { useState } from 'react';

import { ProfileNavbar } from '@/components/profile-navbar';

import { ViewSwitcher } from './view-switcher';
import { CleanResumeView } from './views/clean-resume-view';
import { PortfolioView } from './views/portfolio-view';
import { SnapshotView } from './views/snapshot-view';
import { TimelineView } from './views/timeline-view';

import type { ProfileView, PublicProfile } from '@/types';

interface ProfileViewerProps {
  profile: PublicProfile;
  initialView: ProfileView;
  authState: 'owner' | 'authenticated' | 'anonymous';
  profileHandle: string;
}

export function ProfileViewer({
  profile,
  initialView,
  authState,
  profileHandle,
}: ProfileViewerProps) {
  const [currentView, setCurrentView] = useState<ProfileView>(initialView);

  const handleViewChange = (view: ProfileView) => {
    setCurrentView(view);
    // Update URL without navigation
    window.history.replaceState(null, '', `?view=${view}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background">
      <ProfileNavbar authState={authState} profileHandle={profileHandle} />

      <ViewSwitcher currentView={currentView} onViewChange={handleViewChange} />

      <AnimatePresence mode="wait">
        <motion.main
          key={currentView}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className="container max-w-5xl py-8 pb-24"
        >
          {currentView === 'resume' && <CleanResumeView profile={profile} />}
          {currentView === 'portfolio' && <PortfolioView profile={profile} />}
          {currentView === 'timeline' && <TimelineView profile={profile} />}
          {currentView === 'snapshot' && <SnapshotView profile={profile} />}
        </motion.main>
      </AnimatePresence>

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
