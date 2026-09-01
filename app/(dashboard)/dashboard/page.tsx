import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { ensurePrimaryProfile, makeProfilePortfolioReady } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { isPortfolioEnabled } from '@/lib/features';
import { buildFollioIdentity, canShowResumeDoor, canShowWorkDoor } from '@/lib/follio-identity';
import { renderQrSvg } from '@/lib/follio-identity/qr';
import { resolveResumePageLayout } from '@/lib/resume/page-layout';
import { getFollioUrl, getDisplayHost } from '@/lib/url';
import { getPublicProfile } from '@/services/profile.service';
import type { ResumeDesign } from '@/types';

import { DashboardClient, type DashboardData } from './dashboard-client';

export const metadata = {
  title: 'Dashboard - Follio',
  description: 'Your Follio — share one link, and keep your resume current.',
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

  if (isPortfolioEnabled()) {
    const resolveCurrentTemplateId = async (): Promise<string | null> => {
      const portfolio = await db.generatedPortfolio
        .findFirst({
          where: {
            profileId: identityProfile.id,
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
        await makeProfilePortfolioReady(identityProfile.id);
        currentTemplateId = await resolveCurrentTemplateId();
      } catch {
        // Leave the dashboard usable.
      }
    }
  }

  const publicProfile = await getPublicProfile(identityProfile.handle);
  const identity = publicProfile
    ? buildFollioIdentity(publicProfile, {
        showResume: canShowResumeDoor(identityProfile.resumeVisibility, 'owner', true),
        showWork: canShowWorkDoor(
          isPortfolioEnabled(),
          identityProfile.portfolioVisibility,
          'owner',
          true
        ),
      })
    : null;

  const resumes = rawProfiles.map((r) => ({
    id: r.id,
    handle: r.handle,
    resumeTitle: r.resumeTitle,
    status: r.status,
    resumeVisibility: r.resumeVisibility,
    firstName: r.firstName,
    middleName: r.middleName,
    lastName: r.lastName,
    headline: r.headline,
    updatedAt: r.updatedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    pageLayout: resolveResumePageLayout((r.resumeDesign as ResumeDesign | null) ?? null),
  }));

  const follioUrl = getFollioUrl(identityProfile.handle);

  const data: DashboardData = {
    follio: {
      id: identityProfile.id,
      handle: identityProfile.handle,
      status: identityProfile.status,
      displayHost: getDisplayHost(identityProfile.handle),
      url: follioUrl,
      identity,
      qrSvg: renderQrSvg(follioUrl),
    },
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
