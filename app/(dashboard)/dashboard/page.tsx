import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { db } from '@/lib/db';

import { DashboardClient, type DashboardData } from './dashboard-client';

export const metadata = {
  title: 'Dashboard - Follio',
  description: 'Your Follio command center — manage resumes, portfolio, and more.',
};

export default async function DashboardPage() {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    redirect('/sign-in');
  }

  const user = await db.user.findUnique({
    where: { clerkId },
    select: {
      id: true,
      email: true,
      createdAt: true,
      profile: { select: { id: true } },
    },
  });

  if (!user) {
    redirect('/onboarding');
  }

  // Fetch all non-archived profiles (resumes) for the user
  const rawProfiles = await db.profile.findMany({
    where: {
      userId: user.id,
      isArchived: false,
    },
    orderBy: [{ updatedAt: 'desc' }],
    select: {
      id: true,
      handle: true,
      resumeTitle: true,
      status: true,
      resumeVisibility: true,
      portfolioVisibility: true,
      firstName: true,
      lastName: true,
      headline: true,
      avatarUrl: true,
      summary: true,
      updatedAt: true,
      createdAt: true,
      _count: {
        select: {
          workExperiences: true,
          educations: true,
          skills: true,
          projects: true,
          links: true,
          dataSourceConnections: true,
        },
      },
    },
  });

  // The "active" profile is the one used for the builder / portfolio
  const activeProfile = rawProfiles.find((p) => p.id === user.profile?.id) ?? rawProfiles[0];

  if (!activeProfile) {
    redirect('/onboarding');
  }

  // Serialize for client
  const resumes = rawProfiles.map((r) => ({
    id: r.id,
    handle: r.handle,
    resumeTitle: r.resumeTitle,
    status: r.status,
    resumeVisibility: r.resumeVisibility,
    firstName: r.firstName,
    lastName: r.lastName,
    headline: r.headline,
    updatedAt: r.updatedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  }));

  const data: DashboardData = {
    activeProfile: {
      id: activeProfile.id,
      handle: activeProfile.handle,
      firstName: activeProfile.firstName,
      lastName: activeProfile.lastName,
      headline: activeProfile.headline,
      avatarUrl: activeProfile.avatarUrl,
      portfolioVisibility: activeProfile.portfolioVisibility,
      resumeVisibility: activeProfile.resumeVisibility,
    },
    resumes,
    activeProfileId: user.profile?.id ?? null,
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <DashboardClient data={data} />
    </div>
  );
}
