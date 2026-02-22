import { auth } from '@clerk/nextjs/server';
import { notFound, redirect } from 'next/navigation';

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { SectionEditor } from './section-editor';

// Helper to serialize data for client components (converts Date objects to ISO strings)
function serializeForClient<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

// Map URL slugs to section types
const SLUG_TO_SECTION: Record<string, string> = {
  'basic-info': 'BASIC_INFO',
  contact: 'CONTACT',
  photos: 'PHOTOS',
  summary: 'SUMMARY',
  experience: 'EXPERIENCE',
  education: 'EDUCATION',
  skills: 'SKILLS',
  projects: 'PROJECTS',
  github: 'GITHUB',
  links: 'LINKS',
  awards: 'AWARDS',
  certifications: 'CERTIFICATIONS',
  publications: 'PUBLICATIONS',
  volunteering: 'VOLUNTEERING',
  languages: 'LANGUAGES',
  interests: 'INTERESTS',
  share: 'SHARE',
  settings: 'SETTINGS',
};

interface PageProps {
  params: Promise<{ section: string }>;
}

export default async function SectionPage({ params }: PageProps) {
  const { section: sectionSlug } = await params;

  // Handle redirects before any DB queries
  if (sectionSlug === 'share') redirect('/share');
  if (sectionSlug === 'github') redirect('/data-sources');
  if (sectionSlug === 'import-sync') redirect('/data-sources');
  if (sectionSlug === 'settings') redirect('/settings');

  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  // Determine section type from slug
  let sectionType = SLUG_TO_SECTION[sectionSlug];
  let customSectionId: string | null = null;

  if (!sectionType && sectionSlug.startsWith('custom-')) {
    customSectionId = sectionSlug.replace('custom-', '');
    sectionType = 'CUSTOM';
  }

  if (!sectionType) {
    notFound();
  }

  // Lightweight query: only fetch the profileId and sections.
  // The SectionEditor reads the full profile from the zustand store
  // (populated by the layout), so we don't need the full profile here.
  const user = await db.user.findUnique({
    where: { clerkId: userId },
    select: {
      profile: {
        select: {
          id: true,
          sections: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      },
    },
  });

  if (!user?.profile) {
    logger.warn('SectionPage: no profile found, redirecting to onboarding', { userId });
    redirect('/onboarding');
  }

  const sections = serializeForClient(user.profile.sections);

  // Find the section configuration
  const section = sections.find(
    (s) => s.type === sectionType && (sectionType !== 'CUSTOM' || s.id === customSectionId)
  );

  return (
    <SectionEditor
      key={`${sectionType}-${customSectionId ?? 'default'}`}
      sectionType={sectionType}
      section={section ?? null}
    />
  );
}
