import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { resolveActiveProfileContextOrNull } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { resolveResumePageLayout } from '@/lib/resume/page-layout';
import type { ResumeDesign } from '@/types';

import { ResumeDashboardClient, type ResumeItem } from './resumes-client';

export const metadata = {
  title: 'My Resumes - Follio',
  description: 'Manage your resumes — create, rename, clone, or delete.',
};

export default async function ResumesPage() {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    redirect('/sign-in');
  }

  // Match /dashboard: a User row without a Profile is still incomplete.
  const context = await resolveActiveProfileContextOrNull(clerkId);
  if (!context) {
    redirect('/onboarding');
  }

  const user = await db.user.findUnique({
    where: { id: context.userId },
    select: {
      id: true,
      profile: { select: { id: true } },
      primaryProfile: { select: { id: true } },
    },
  });

  if (!user) {
    redirect('/onboarding');
  }

  const rawResumes = await db.profile.findMany({
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
      firstName: true,
      middleName: true,
      lastName: true,
      headline: true,
      updatedAt: true,
      createdAt: true,
      resumeDesign: true,
    },
  });

  // Serialize Date objects to ISO strings for client
  const resumes: ResumeItem[] = rawResumes.map((r) => ({
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

  const activeProfileId = user.profile?.id ?? null;
  const primaryProfileId = user.primaryProfile?.id ?? null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
      <ResumeDashboardClient
        initialResumes={resumes}
        initialActiveProfileId={activeProfileId}
        initialPrimaryProfileId={primaryProfileId}
      />
    </div>
  );
}
