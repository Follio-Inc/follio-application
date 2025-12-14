import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { db } from '@/lib/db';
import { BuilderClient } from './builder-client';

export default async function BuilderPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  const user = await db.user.findUnique({
    where: { clerkId: userId },
    include: {
      profile: {
        include: {
          contactInfo: true,
          links: { orderBy: { sortOrder: 'asc' } },
          workExperiences: { orderBy: { sortOrder: 'asc' } },
          educations: { orderBy: { sortOrder: 'asc' } },
          skills: { orderBy: { sortOrder: 'asc' } },
          skillGroups: { include: { skills: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } },
          projects: { orderBy: { sortOrder: 'asc' } },
          awards: { orderBy: { sortOrder: 'asc' } },
          certifications: { orderBy: { sortOrder: 'asc' } },
        },
      },
    },
  });

  if (!user || !user.profile) {
    redirect('/onboarding');
  }

  return <BuilderClient initialProfile={user.profile} />;
}
