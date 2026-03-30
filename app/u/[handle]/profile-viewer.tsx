'use client';

import { MotionConfig } from 'framer-motion';
import { Presentation } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { ProfileNavbar } from '@/components/profile-navbar';
import { Button } from '@/components/ui/button';
import { getTemplateMeta } from '@/lib/portfolio/templates/registry';

import { ViewSwitcher } from './view-switcher';
import { AIPortfolioView } from './views/ai-portfolio-view';
import { PortfolioView } from './views/portfolio-view';
import { SnapView } from './views/snap-view';
import { SnapshotView } from './views/snapshot-view';
import { TemplatePortfolioView } from './views/template-portfolio-view';
import { TimelineView } from './views/timeline-view';

import type { TemplatePortfolio } from '@/lib/portfolio/templates/types';
import type { PortfolioView as PortfolioViewType, PublicProfile } from '@/types';
import type { PortfolioPlan, PortfolioUserOverrides } from '@/types/portfolio';

interface ProfileViewerProps {
  profile: PublicProfile;
  authState: 'owner' | 'authenticated' | 'anonymous';
  profileHandle: string;
  resumeVisibility: 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
  /** When true, hides navbar and footer (used for dashboard thumbnail). */
  embed?: boolean;
  /** AI-generated portfolio plan (null if not generated yet). */
  generatedPlan?: PortfolioPlan | null;
  /** User overrides for the AI portfolio. */
  generatedOverrides?: PortfolioUserOverrides | null;
  /** Template-based portfolio data (null if not using template system). */
  templatePortfolio?: TemplatePortfolio | null;
  /** GitHub profile data for template rendering. */
  githubProfile?: {
    username: string;
    avatarUrl: string | null;
    bio: string | null;
    publicRepos: number;
    followers: number;
    totalStars: number;
    primaryLanguages: string[];
  } | null;
}

export function ProfileViewer({
  profile,
  authState,
  profileHandle,
  resumeVisibility,
  embed = false,
  generatedPlan = null,
  generatedOverrides = null,
  templatePortfolio = null,
  githubProfile = null,
}: ProfileViewerProps) {
  const router = useRouter();
  const [currentView, setCurrentView] = useState<PortfolioViewType>('portfolio');

  const handleViewChange = useCallback(
    (view: PortfolioViewType) => {
      // Snap view lives on its own page for the wide layout
      if (view === 'snap') {
        router.push(`/u/${profileHandle}/snap`);
        return;
      }
      setCurrentView(view);
    },
    [router, profileHandle]
  );

  /** Render the portfolio view — uses template, AI-generated, or default. */
  const renderPortfolioView = () => {
    // Priority 1: Template-based portfolio
    if (templatePortfolio) {
      return (
        <TemplatePortfolioView
          profile={profile}
          templateData={templatePortfolio}
          githubProfile={githubProfile}
        />
      );
    }
    // Priority 2: Legacy AI-generated portfolio
    if (generatedPlan) {
      return (
        <AIPortfolioView
          plan={generatedPlan}
          overrides={generatedOverrides}
          isPreview={embed}
          isOwner={authState === 'owner'}
        />
      );
    }
    // Fallback: Default portfolio view
    return (
      <PortfolioView
        profile={profile}
        profileHandle={profileHandle}
        resumeVisibility={resumeVisibility}
        authState={authState}
      />
    );
  };

  /** Render the active view based on the view switcher selection. */
  const renderActiveView = () => {
    switch (currentView) {
      case 'timeline':
        return <TimelineView profile={profile} />;
      case 'snapshot':
        return <SnapshotView profile={profile} />;
      case 'snap':
        // Snap view renders inline when accessed from view switcher
        return <SnapView profile={profile} />;
      case 'portfolio':
      default:
        return renderPortfolioView();
    }
  };

  const hasFullPagePortfolio = !!(templatePortfolio || generatedPlan);

  // Look up the template's navbar theme so the top bar blends with the portfolio
  const navbarTheme = templatePortfolio
    ? (getTemplateMeta(templatePortfolio.templateId)?.navbarTheme ?? null)
    : null;

  // View switcher is shown for non-embed, non-template/non-AI portfolios
  const showViewSwitcher = !embed && !hasFullPagePortfolio;

  return (
    <MotionConfig reducedMotion={embed ? 'always' : 'never'}>
      <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background">
        {!embed && (
          <ProfileNavbar
            authState={authState}
            profileHandle={profileHandle}
            navbarTheme={navbarTheme}
          />
        )}

        {showViewSwitcher && (
          <ViewSwitcher currentView={currentView} onViewChange={handleViewChange} />
        )}

        <main
          className={
            hasFullPagePortfolio
              ? ''
              : currentView === 'snap'
                ? '' // Snap view handles its own layout (wider)
                : 'container max-w-5xl py-8 pb-24'
          }
        >
          {hasFullPagePortfolio ? renderPortfolioView() : renderActiveView()}
        </main>

        {!embed && !hasFullPagePortfolio && (
          <footer className="border-t bg-background py-6">
            <div className="container flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Built with{' '}
                <Link href="/" className="font-medium text-primary hover:underline">
                  Follio
                </Link>{' '}
                — Your professional identity, everywhere.
              </p>
              {currentView !== 'snap' && (
                <Button variant="outline" size="sm" className="gap-2" asChild>
                  <Link href={`/u/${profileHandle}/snap`}>
                    <Presentation className="h-3.5 w-3.5" />
                    Snap View
                  </Link>
                </Button>
              )}
            </div>
          </footer>
        )}
      </div>
    </MotionConfig>
  );
}
