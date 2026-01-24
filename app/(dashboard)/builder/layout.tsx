import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { db } from '@/lib/db';
import { BuilderLayoutClient } from './builder-layout-client';

// Helper to serialize data for client components (converts Date objects to ISO strings)
function serializeForClient<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

export default async function BuilderLayout({ children }: { children: React.ReactNode }) {
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

  // Serialize the profile data to convert Date objects to strings for client component
  const serializedProfile = serializeForClient(user.profile);

  return <BuilderLayoutClient profile={serializedProfile}>{children}</BuilderLayoutClient>;
}
