import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { resolveActiveProfileContextOrNull } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { SettingsPageClient } from './settings-page-client';

// Helper to serialize data for client components (converts Date objects to ISO strings)
function serializeForClient<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

export const metadata = {
  title: 'Settings - Follio',
  description: 'Manage your Follio account settings, data sources, and preferences',
};

export default async function SettingsPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  const context = await resolveActiveProfileContextOrNull(userId);
  if (!context) {
    redirect('/onboarding');
  }

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

  const serializedProfile = serializeForClient(profile);

  return <SettingsPageClient profile={serializedProfile} />;
}
