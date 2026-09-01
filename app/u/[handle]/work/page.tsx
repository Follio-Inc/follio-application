import { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { db } from '@/lib/db';
import { isPortfolioEnabled } from '@/lib/features';
import { getPortfolioUrl } from '@/lib/url';
import { getPublicProfile, validateUnlistedKey } from '@/services/profile.service';

import { getViewerAuthState, validateShareToken } from '../access';
import { ProfileViewer } from '../profile-viewer';

import type { TemplatePortfolio } from '@/lib/portfolio/templates/types';
import type { PortfolioPlan, PortfolioUserOverrides } from '@/types/portfolio';

interface WorkPageProps {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ token?: string; key?: string; preview?: string }>;
}

export async function generateMetadata({ params }: WorkPageProps): Promise<Metadata> {
  const { handle } = await params;

  if (!isPortfolioEnabled()) {
    return {
      title: 'Work | Follio',
      robots: { index: false, follow: false },
    };
  }

  const profile = await getPublicProfile(handle);

  if (!profile) {
    return {
      title: 'Work not found | Follio',
    };
  }

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || handle;
  const title = `${fullName} — Work | Follio`;
  const description =
    profile.summary ||
    `${profile.headline || 'Professional'} based in ${profile.location || 'Unknown'}`;

  const portfolioVisibility = profile.portfolioVisibility || 'PUBLIC';

  return {
    title,
    description,
    robots:
      portfolioVisibility === 'UNLISTED' || portfolioVisibility === 'PRIVATE'
        ? { index: false, follow: false }
        : undefined,
    openGraph: {
      title,
      description,
      type: 'profile',
      firstName: profile.firstName || undefined,
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

export default async function WorkPage({ params, searchParams }: WorkPageProps) {
  const { handle } = await params;

  if (!isPortfolioEnabled()) {
    notFound();
  }

  const { token, key, preview } = await searchParams;

  const [profile, authState] = await Promise.all([
    getPublicProfile(handle),
    getViewerAuthState(handle),
  ]);

  if (!profile || profile.status === 'DRAFT') {
    notFound();
  }

  if (profile.status === 'PRIVATE' && authState !== 'owner') {
    const isValidToken = token ? await validateShareToken(handle, token, 'portfolio') : false;
    const isValidKey = key ? await validateUnlistedKey(handle, key) : false;
    if (!isValidToken && !isValidKey) {
      notFound();
    }
  }

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

  const resumeVisibility = profile.resumeVisibility || 'PRIVATE';

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

  if (generatedPortfolio) {
    const isPublished = generatedPortfolio.status === 'PUBLISHED';
    if (isPublished || authState === 'owner') {
      const plan = generatedPortfolio.plan as Record<string, unknown> | null;

      if (plan && typeof plan.templateId === 'string') {
        templatePortfolio = plan as unknown as TemplatePortfolio;
      } else if (plan) {
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
