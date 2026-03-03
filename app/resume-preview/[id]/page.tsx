import { auth } from '@clerk/nextjs/server';
import { notFound } from 'next/navigation';

import { CleanResumeView } from '@/app/u/[handle]/views/clean-resume-view';
import { db } from '@/lib/db';

import type { PublicProfile } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * Minimal resume preview page used as an iframe source for dashboard thumbnails.
 *
 * - Authenticates the user and verifies ownership of the profile.
 * - Loads the full profile with all relations (same query as the builder).
 * - Renders CleanResumeView with zero surrounding chrome.
 * - Works for all statuses (DRAFT, PRIVATE, PUBLIC) since the owner is viewing.
 */

// Helper to serialize data for client components (converts Date objects to ISO strings)
function serializeForClient<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

interface ResumePreviewPageProps {
  params: Promise<{ id: string }>;
}

export default async function ResumePreviewPage({ params }: ResumePreviewPageProps) {
  const { id } = await params;
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    notFound();
  }

  // Verify the authenticated user owns this profile
  const profile = await db.profile.findUnique({
    where: { id },
    include: {
      user: { select: { clerkId: true } },
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

  if (!profile || profile.user.clerkId !== clerkId) {
    notFound();
  }

  // Strip sensitive fields and serialize for client rendering
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { userId: _uid, user: _user, ...publicFields } = profile;

  const publicContactInfo = profile.contactInfo
    ? {
        email: profile.contactInfo.email,
        phone: profile.contactInfo.phone,
        website: profile.contactInfo.website,
        headerFieldsOrder: Array.isArray(profile.contactInfo.headerFieldsOrder)
          ? (profile.contactInfo.headerFieldsOrder as string[])
          : null,
      }
    : null;

  const publicProfile = serializeForClient({
    ...publicFields,
    contactInfo: publicContactInfo,
  }) as unknown as PublicProfile;

  return (
    <div className="bg-white" style={{ overflow: 'hidden' }}>
      <main className="mx-auto max-w-5xl py-6">
        <div className="[&>.resume-actions]:hidden">
          <CleanResumeView profile={publicProfile} />
        </div>
      </main>
    </div>
  );
}
