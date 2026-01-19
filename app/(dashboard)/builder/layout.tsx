import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { db } from '@/lib/db';
import { BuilderLayoutClient } from './builder-layout-client';

export default async function BuilderLayout({ children }: { children: React.ReactNode }) {
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

  if (!user || !user.profile) {
    redirect('/onboarding');
  }

  return <BuilderLayoutClient profile={user.profile}>{children}</BuilderLayoutClient>;
}
