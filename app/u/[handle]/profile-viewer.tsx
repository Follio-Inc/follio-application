'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { ViewSwitcher } from './view-switcher';
import { ResumeView } from './views/resume-view';
import { PortfolioView } from './views/portfolio-view';
import { TimelineView } from './views/timeline-view';
import { RecruiterView } from './views/recruiter-view';

import type { PublicProfile, ProfileView } from '@/types';

interface ProfileViewerProps {
  profile: PublicProfile;
  initialView: ProfileView;
}

export function ProfileViewer({ profile, initialView }: ProfileViewerProps) {
  const [currentView, setCurrentView] = useState<ProfileView>(initialView);

  const handleViewChange = (view: ProfileView) => {
    setCurrentView(view);
    // Update URL without navigation
    window.history.replaceState(null, '', `?view=${view}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background">
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
          {currentView === 'resume' && <ResumeView profile={profile} />}
          {currentView === 'portfolio' && <PortfolioView profile={profile} />}
          {currentView === 'timeline' && <TimelineView profile={profile} />}
          {currentView === 'recruiter' && <RecruiterView profile={profile} />}
        </motion.main>
      </AnimatePresence>

      <footer className="border-t bg-background py-6">
        <div className="container text-center text-sm text-muted-foreground">
          <p>
            Built with{' '}
            <a href="/" className="font-medium text-primary hover:underline">
              Follio
            </a>
            {' '}— Your professional identity, everywhere.
          </p>
        </div>
      </footer>
    </div>
  );
}
