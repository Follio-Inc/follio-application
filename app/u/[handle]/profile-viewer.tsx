'use client';

import { MotionConfig } from 'framer-motion';
import Link from 'next/link';

import { ProfileNavbar } from '@/components/profile-navbar';

import { AIPortfolioView } from './views/ai-portfolio-view';
import { PortfolioView } from './views/portfolio-view';
import { TemplatePortfolioView } from './views/template-portfolio-view';

import type { TemplatePortfolio } from '@/lib/portfolio/templates/types';
import type { PublicProfile } from '@/types';
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

  const hasFullPagePortfolio = !!(templatePortfolio || generatedPlan);

  return (
    <MotionConfig reducedMotion={embed ? 'always' : 'never'}>
      <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background">
        {!embed && <ProfileNavbar authState={authState} profileHandle={profileHandle} />}

        <main className={hasFullPagePortfolio ? '' : 'container max-w-5xl py-8 pb-24'}>
          {renderPortfolioView()}
        </main>

        {!embed && !hasFullPagePortfolio && (
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
