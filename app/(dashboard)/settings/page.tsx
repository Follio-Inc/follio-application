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
  description: 'Manage your Follio account settings',
};

export default async function SettingsPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  // Only fetch the data settings actually needs — not the entire profile graph
  const context = await resolveActiveProfileContextOrNull(userId);
  if (!context) {
    redirect('/onboarding');
  }

  const profile = await db.profile.findUnique({
    where: { id: context.profileId },
    include: {
      contactInfo: true,
    },
  });

  if (!profile) {
    redirect('/onboarding');
  }

  const serializedProfile = serializeForClient(profile);

  return <SettingsPageClient profile={serializedProfile} />;
}
