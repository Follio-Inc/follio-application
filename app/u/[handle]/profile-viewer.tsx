'use client';

import { MotionConfig } from 'framer-motion';
import Link from 'next/link';

import { SiteHeader } from '@/components/site-header';
import { getTemplateMeta } from '@/lib/portfolio/templates/registry';

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
  /** Render the traditional portfolio view — uses template, AI-generated, or default. */
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

  // Look up the template's navbar theme so the top bar blends with the portfolio
  const navbarTheme = templatePortfolio
    ? (getTemplateMeta(templatePortfolio.templateId)?.navbarTheme ?? null)
    : null;

  return (
    <MotionConfig reducedMotion={embed ? 'always' : 'never'}>
      <div className="min-h-screen bg-background">
        {!embed && (
          <SiteHeader
            profileHandle={profileHandle}
            authState={authState}
            navbarTheme={navbarTheme}
          />
        )}
        <main className={hasFullPagePortfolio ? '' : 'container max-w-5xl py-8 pb-24'}>
          {renderPortfolioView()}
        </main>
        {!embed && !hasFullPagePortfolio && (
          <footer className="border-t border-border/50 bg-background py-6">
            <div className="container text-center text-sm text-muted-foreground">
              <p>
                Built with{' '}
                <Link href="/" className="font-medium text-primary hover:underline">
                  Follio
                </Link>
              </p>
            </div>
          </footer>
        )}
      </div>
    </MotionConfig>
  );
}
