import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { resolveActiveProfileContextOrNull } from '@/lib/active-profile';
import { db } from '@/lib/db';

import type { TemplatePortfolio } from '@/lib/portfolio/templates/types';
import type { PublicProfile } from '@/types';

import { PortfolioBuilder } from './portfolio-builder';

export const metadata = {
  title: 'Portfolio Builder - Follio',
  description: 'Design and customize your portfolio',
};

// Helper to serialize data for client components (converts Date objects to ISO strings)
function serializeForClient<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

export default async function PortfolioPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect('/sign-in');
  }

  const context = await resolveActiveProfileContextOrNull(userId);
  if (!context) {
    redirect('/onboarding');
  }

  // Fetch profile with all relations
  const profile = await db.profile.findUnique({
    where: { id: context.profileId },
    include: {
      contactInfo: true,
      links: { orderBy: { sortOrder: 'asc' } },
      workExperiences: { orderBy: { sortOrder: 'asc' } },
      educations: { orderBy: { sortOrder: 'asc' } },
      skills: { orderBy: { sortOrder: 'asc' } },
      skillGroups: {
        include: { skills: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { sortOrder: 'asc' },
      },
      projects: { orderBy: { sortOrder: 'asc' } },
      awards: { orderBy: { sortOrder: 'asc' } },
      certifications: { orderBy: { sortOrder: 'asc' } },
      blogPosts: { orderBy: { createdAt: 'desc' } },
      youtubeVideos: { orderBy: { createdAt: 'desc' } },
      photos: { orderBy: { sortOrder: 'asc' } },
      sections: { orderBy: { sortOrder: 'asc' } },
    },
  });

  if (!profile) {
    redirect('/onboarding');
  }

  // Fetch active generated portfolio
  const generatedPortfolio = await db.generatedPortfolio.findFirst({
    where: {
      profileId: context.profileId,
      isActive: true,
      status: { in: ['PUBLISHED', 'DRAFT'] },
    },
    orderBy: { version: 'desc' },
    select: {
      id: true,
      plan: true,
      status: true,
      version: true,
      createdAt: true,
    },
  });

  // Check if it's a template portfolio
  const plan = generatedPortfolio?.plan as Record<string, unknown> | null;
  const isTemplatePortfolio = plan && typeof plan.templateId === 'string';

  // Fetch GitHub profile for template rendering
  let githubProfile = null;
  try {
    githubProfile = await db.gitHubProfile.findUnique({
      where: { profileId: context.profileId },
      select: {
        username: true,
        avatarUrl: true,
        bio: true,
        publicRepos: true,
        followers: true,
        totalStars: true,
        primaryLanguages: true,
      },
    });
  } catch {
    // Optional
  }

  const serializedProfile = serializeForClient(profile);

  return (
    <PortfolioBuilder
      profile={serializedProfile as unknown as PublicProfile}
      templatePortfolio={
        isTemplatePortfolio ? serializeForClient(plan as unknown as TemplatePortfolio) : null
      }
      portfolioId={generatedPortfolio?.id ?? null}
      githubProfile={githubProfile ? serializeForClient(githubProfile) : null}
      handle={profile.handle}
    />
  );
}
