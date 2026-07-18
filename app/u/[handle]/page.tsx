import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { db } from '@/lib/db';
import { isPortfolioEnabled } from '@/lib/features';
import { getPortfolioUrl, getResumePath } from '@/lib/url';
import { getPublicProfile, validateUnlistedKey } from '@/services/profile.service';

import { getViewerAuthState, validateShareToken } from './access';
import { ProfileViewer } from './profile-viewer';

import type { TemplatePortfolio } from '@/lib/portfolio/templates/types';
import type { PortfolioPlan, PortfolioUserOverrides } from '@/types/portfolio';

interface ProfilePageProps {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ token?: string; key?: string; preview?: string }>;
}

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const { handle } = await params;

  if (!isPortfolioEnabled()) {
    return {
      title: 'Resume | Follio',
      robots: { index: false, follow: false },
    };
  }

  const profile = await getPublicProfile(handle);

  if (!profile) {
    return {
      title: 'Profile Not Found | Follio',
    };
  }

  const title = `${profile.firstName} ${profile.lastName} | Follio`;
  const description =
    profile.summary ||
    `${profile.headline || 'Professional'} based in ${profile.location || 'Unknown'}`;

  const portfolioVisibility = profile.portfolioVisibility || 'PUBLIC';

  return {
    title,
    description,
    // Unlisted/private portfolios should not be indexed
    robots:
      portfolioVisibility === 'UNLISTED' || portfolioVisibility === 'PRIVATE'
        ? { index: false, follow: false }
        : undefined,
    openGraph: {
      title,
      description,
      type: 'profile',
      firstName: profile.firstName,
      lastName: profile.lastName || undefined,
      url: getPortfolioUrl(handle),
      siteName: 'Follio',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    alternates: {
      canonical: getPortfolioUrl(handle),
    },
  };
}

export const dynamic = 'force-dynamic';

export default async function ProfilePage({ params, searchParams }: ProfilePageProps) {
  const { handle } = await params;

  // Resume-only mode: keep existing portfolio URLs working by sending visitors
  // to the resume page instead of a hard 404.
  if (!isPortfolioEnabled()) {
    redirect(getResumePath(handle));
  }

  const { token, key, preview } = await searchParams;

  const [profile, authState] = await Promise.all([
    getPublicProfile(handle),
    getViewerAuthState(handle),
  ]);

  if (!profile || profile.status === 'DRAFT') {
    notFound();
  }

  // For PRIVATE (Unlisted) profiles, require a valid share token or unlisted key (unless owner)
  if (profile.status === 'PRIVATE' && authState !== 'owner') {
    const isValidToken = token ? await validateShareToken(handle, token, 'portfolio') : false;
    const isValidKey = key ? await validateUnlistedKey(handle, key) : false;
    if (!isValidToken && !isValidKey) {
      notFound();
    }
  }

  // Check portfolio-specific visibility
  const portfolioVisibility = profile.portfolioVisibility || 'PUBLIC';
  if (portfolioVisibility === 'PRIVATE' && authState !== 'owner') {
    notFound();
  }
  if (portfolioVisibility === 'UNLISTED' && authState !== 'owner') {
    const isValidToken = token ? await validateShareToken(handle, token, 'portfolio') : false;
    const isValidKey = key ? await validateUnlistedKey(handle, key) : false;
    if (!isValidToken && !isValidKey) {
      notFound();
    }
  }

  // Determine resume visibility for the cross-link button
  const resumeVisibility = profile.resumeVisibility || 'PRIVATE';

  // Fetch generated portfolio + GitHub profile in parallel using the
  // already-loaded profile id (avoids two extra `db.profile.findFirst`
  // round-trips that the previous implementation performed).
  const [generatedPortfolio, githubProfile] = await Promise.all([
    db.generatedPortfolio
      .findFirst({
        where: {
          profileId: profile.id,
          isActive: true,
          status: { in: ['PUBLISHED', 'DRAFT'] },
        },
        orderBy: { version: 'desc' },
        select: {
          plan: true,
          userOverrides: true,
          status: true,
        },
      })
      // Migration may not yet be applied in some envs \u2014 fall back gracefully.
      .catch(() => null),
    db.gitHubProfile
      .findUnique({
        where: { profileId: profile.id },
        select: {
          username: true,
          avatarUrl: true,
          bio: true,
          publicRepos: true,
          followers: true,
          totalStars: true,
          primaryLanguages: true,
        },
      })
      .catch(() => null),
  ]);

  let generatedPlan: PortfolioPlan | null = null;
  let generatedOverrides: PortfolioUserOverrides | null = null;
  let templatePortfolio: TemplatePortfolio | null = null;

  // Only show published portfolios to non-owners.
  if (generatedPortfolio) {
    const isPublished = generatedPortfolio.status === 'PUBLISHED';
    if (isPublished || authState === 'owner') {
      const plan = generatedPortfolio.plan as Record<string, unknown> | null;

      // Detect template-based portfolio: plan has a `templateId` field.
      if (plan && typeof plan.templateId === 'string') {
        templatePortfolio = plan as unknown as TemplatePortfolio;
      } else if (plan) {
        // Legacy AI-generated portfolio plan
        generatedPlan = plan as unknown as PortfolioPlan;
        generatedOverrides =
          generatedPortfolio.userOverrides as unknown as PortfolioUserOverrides | null;
      }
    }
  }

  return (
    <ProfileViewer
      profile={profile}
      authState={authState}
      profileHandle={handle}
      resumeVisibility={resumeVisibility}
      embed={preview === 'true'}
      generatedPlan={generatedPlan}
      generatedOverrides={generatedOverrides}
      templatePortfolio={templatePortfolio}
      githubProfile={templatePortfolio ? githubProfile : null}
    />
  );
}
