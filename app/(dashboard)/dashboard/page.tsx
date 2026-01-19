import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { db } from '@/lib/db';
import { DashboardClient } from './dashboard-client';

export default async function DashboardPage() {
  let userId: string | null = null;

  try {
    const authResult = await auth();
    userId = authResult?.userId ?? null;
  } catch {
    redirect('/sign-in');
  }

  if (!userId) {
    redirect('/sign-in');
  }

  const user = await currentUser();

  if (!user) {
    redirect('/sign-in');
  }

  // Get or create user record
  let dbUser = await db.user.findUnique({
    where: { clerkId: userId },
    include: {
      profile: {
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
          sections: { orderBy: { sortOrder: 'asc' } },
        },
      },
    },
  });

  // Create user if doesn't exist
  if (!dbUser) {
    dbUser = await db.user.create({
      data: {
        clerkId: userId,
        email: user.emailAddresses[0]?.emailAddress || '',
      },
      include: {
        profile: {
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
            sections: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });

    // If no profile exists, redirect to onboarding
    if (!dbUser.profile) {
      redirect('/onboarding');
    }
  }

  const profile = dbUser?.profile;

  // If no profile exists, redirect to onboarding
  if (!profile) {
    redirect('/onboarding');
  }

  return <DashboardClient initialProfile={profile} />;
}
