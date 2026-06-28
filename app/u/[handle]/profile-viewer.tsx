'use client';

import { MotionConfig } from 'framer-motion';

import { PublicProfileChrome, useEffectiveAuthState } from '@/components/public-profile-chrome';

import { AIPortfolioView } from './views/ai-portfolio-view';
import { PortfolioView } from './views/portfolio-view';
import { TemplatePortfolioView } from './views/template-portfolio-view';

import type { TemplatePortfolio } from '@/lib/portfolio/templates/types';
import type { ContentVisibility, PublicProfile } from '@/types';
import type { PortfolioPlan, PortfolioUserOverrides } from '@/types/portfolio';

interface ProfileViewerProps {
  profile: PublicProfile;
  authState: 'owner' | 'authenticated' | 'anonymous';
  profileHandle: string;
  /**
   * Visibility of the Resume document. Drives the in-body "View Resume" CTA
   * (the website's only link to the resume — same role as a LinkedIn link).
   * Portfolio visibility itself is enforced upstream in the page route, so
   * the viewer no longer needs to be told about it.
   */
  resumeVisibility: ContentVisibility;
  /** When true, hides navbar, tab bar, and footer (used for dashboard thumbnail). */
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

function ProfileViewerBody({
  profile,
  authState,
  profileHandle,
  resumeVisibility,
  embed,
  generatedPlan,
  generatedOverrides,
  templatePortfolio,
  githubProfile,
}: ProfileViewerProps) {
  const effectiveAuthState = useEffectiveAuthState(authState);

  const renderPortfolioView = () => {
    if (templatePortfolio) {
      return (
        <TemplatePortfolioView
          profile={profile}
          templateData={templatePortfolio}
          githubProfile={githubProfile}
        />
      );
    }

    if (generatedPlan) {
      return (
        <AIPortfolioView
          plan={generatedPlan}
          overrides={generatedOverrides}
          isPreview={embed}
          isOwner={effectiveAuthState === 'owner'}
        />
      );
    }

    return (
      <PortfolioView
        profile={profile}
        profileHandle={profileHandle}
        resumeVisibility={resumeVisibility}
        authState={effectiveAuthState}
      />
    );
  };

  const hasFullPagePortfolio = !!(templatePortfolio || generatedPlan);

  return (
    <main className={hasFullPagePortfolio ? '' : 'container max-w-5xl py-8 pb-24'}>
      {renderPortfolioView()}
    </main>
  );
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
  if (embed) {
    return (
      <MotionConfig reducedMotion="always">
        <div className="min-h-screen bg-background">
          <ProfileViewerBody
            profile={profile}
            authState={authState}
            profileHandle={profileHandle}
            resumeVisibility={resumeVisibility}
            embed={embed}
            generatedPlan={generatedPlan}
            generatedOverrides={generatedOverrides}
            templatePortfolio={templatePortfolio}
            githubProfile={githubProfile}
          />
        </div>
      </MotionConfig>
    );
  }

  return (
    <MotionConfig reducedMotion="never">
      <PublicProfileChrome authState={authState} profileHandle={profileHandle}>
        <ProfileViewerBody
          profile={profile}
          authState={authState}
          profileHandle={profileHandle}
          resumeVisibility={resumeVisibility}
          embed={embed}
          generatedPlan={generatedPlan}
          generatedOverrides={generatedOverrides}
          templatePortfolio={templatePortfolio}
          githubProfile={githubProfile}
        />
      </PublicProfileChrome>
    </MotionConfig>
  );
}
