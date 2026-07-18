import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { ensurePrimaryProfile, makeProfilePortfolioReady } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { isPortfolioEnabled } from '@/lib/features';

import { DashboardClient, type DashboardData } from './dashboard-client';

export const metadata = {
  title: 'Dashboard - Follio',
  description: 'Your Follio workspace — edit your profile, manage your sites, and share.',
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
      middleName: true,
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

  // The Portfolio surface is backed by the stable "primary" profile, which is
  // decoupled from whichever resume is currently active in the builder. This
  // keeps the portfolio link and snapshot intact when new resumes are created.
  let primaryProfileId = user.primaryProfile?.id ?? null;
  let portfolioProfile = rawProfiles.find((p) => p.id === primaryProfileId) ?? null;

  if (!portfolioProfile) {
    // Lazily assign a primary profile (prefer the active one, else the oldest)
    // for users created before primary profiles existed, or whose primary was
    // archived/removed.
    primaryProfileId = await ensurePrimaryProfile(db, user.id, user.profile?.id);
    portfolioProfile = rawProfiles.find((p) => p.id === primaryProfileId) ?? rawProfiles[0] ?? null;
  }

  if (!portfolioProfile) {
    redirect('/onboarding');
  }

  // Resolve the template currently powering the portfolio (primary profile).
  // Skip when portfolio product is disabled — no public portfolio to heal.
  if (isPortfolioEnabled()) {
    const resolveCurrentTemplateId = async (): Promise<string | null> => {
      const portfolio = await db.generatedPortfolio
        .findFirst({
          where: {
            profileId: portfolioProfile.id,
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

    // Self-heal: a primary profile can reach this page without a renderable
    // portfolio (e.g. legacy data, or a resume whose generation hasn't finished).
    // Repair it on the owner's own dashboard so the public link never 404s. Guard
    // against failures so a generation error can never break the dashboard.
    if (!currentTemplateId || portfolioProfile.status === 'DRAFT') {
      try {
        await makeProfilePortfolioReady(portfolioProfile.id);
        currentTemplateId = await resolveCurrentTemplateId();
      } catch {
        // Leave the dashboard usable; the portfolio simply stays as-is for now.
      }
    }
  }

  // Serialize for client
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
  }));

  const data: DashboardData = {
    portfolioProfile: {
      id: portfolioProfile.id,
      handle: portfolioProfile.handle,
      firstName: portfolioProfile.firstName,
      lastName: portfolioProfile.lastName,
      headline: portfolioProfile.headline,
      avatarUrl: portfolioProfile.avatarUrl,
      portfolioVisibility: portfolioProfile.portfolioVisibility,
      resumeVisibility: portfolioProfile.resumeVisibility,
    },
    resumes,
    activeProfileId: user.profile?.id ?? null,
    primaryProfileId: portfolioProfile.id,
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
      <DashboardClient data={data} />
    </div>
  );
}
