import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { ensurePrimaryProfile, makeProfilePortfolioReady } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { isPortfolioEnabled } from '@/lib/features';
import { getFollioVisibility } from '@/lib/follio-identity';
import { setExclusiveResumeVisibility } from '@/lib/public-resume';
import { resolveResumePageLayout } from '@/lib/resume/page-layout';
import type { ResumeDesign } from '@/types';

import { DashboardClient, type DashboardData } from './dashboard-client';

export const metadata = {
  title: 'Dashboard - Follio',
  description: 'Your resumes — each one opens as a traditional resume or a Follio view.',
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
      primaryProfile: { select: { id: true } },
    },
  });

  if (!user) {
    redirect('/onboarding');
  }

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
      middleName: true,
      lastName: true,
      headline: true,
      avatarUrl: true,
      location: true,
      summary: true,
      updatedAt: true,
      createdAt: true,
      resumeDesign: true,
    },
  });

  let primaryProfileId = user.primaryProfile?.id ?? null;
  let identityProfile = rawProfiles.find((p) => p.id === primaryProfileId) ?? null;

  if (!identityProfile) {
    primaryProfileId = await ensurePrimaryProfile(db, user.id, user.profile?.id);
    identityProfile = rawProfiles.find((p) => p.id === primaryProfileId) ?? rawProfiles[0] ?? null;
  }

  if (!identityProfile) {
    redirect('/onboarding');
  }

  const identityProfileId = identityProfile.id;

  if (isPortfolioEnabled()) {
    const resolveCurrentTemplateId = async (): Promise<string | null> => {
      const portfolio = await db.generatedPortfolio
        .findFirst({
          where: {
            profileId: identityProfileId,
            isActive: true,
            status: { in: ['PUBLISHED', 'DRAFT'] },
          },
          orderBy: { version: 'desc' },
          select: { plan: true },
        })
        .catch(() => null);

      const templateId = (portfolio?.plan as Record<string, unknown> | null)?.templateId;
      return typeof templateId === 'string' ? templateId : null;
    };

    let currentTemplateId = await resolveCurrentTemplateId();

    if (!currentTemplateId || identityProfile.status === 'DRAFT') {
      try {
        await makeProfilePortfolioReady(identityProfileId);
        currentTemplateId = await resolveCurrentTemplateId();
      } catch {
        // Leave the dashboard usable.
      }
    }
  }

  const visibility = getFollioVisibility(identityProfile);
  const resumeMatches = identityProfile.resumeVisibility === visibility;
  const statusShouldBePublic = visibility === 'PUBLIC';
  const statusMatches = statusShouldBePublic
    ? identityProfile.status === 'PUBLIC'
    : identityProfile.status !== 'PUBLIC';

  if (!resumeMatches || !statusMatches) {
    try {
      await setExclusiveResumeVisibility(identityProfile.id, visibility);
      identityProfile = {
        ...identityProfile,
        resumeVisibility: visibility,
        status: statusShouldBePublic ? 'PUBLIC' : 'PRIVATE',
      };
    } catch {
      // Leave the dashboard usable; the next visibility save will heal.
    }
  }

  const resumes = rawProfiles.map((r) => ({
    id: r.id,
    handle: r.handle,
    resumeTitle: r.resumeTitle,
    status: r.id === identityProfile.id ? identityProfile.status : r.status,
    resumeVisibility:
      r.id === identityProfile.id ? identityProfile.resumeVisibility : r.resumeVisibility,
    firstName: r.firstName,
    middleName: r.middleName,
    lastName: r.lastName,
    headline: r.headline,
    updatedAt: r.updatedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    pageLayout: resolveResumePageLayout((r.resumeDesign as ResumeDesign | null) ?? null),
  }));

  const data: DashboardData = {
    resumes,
    activeProfileId: user.profile?.id ?? null,
    primaryProfileId: identityProfile.id,
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <DashboardClient data={data} />
    </div>
  );
}
