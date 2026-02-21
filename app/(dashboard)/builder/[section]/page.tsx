import { auth } from '@clerk/nextjs/server';
import { notFound, redirect } from 'next/navigation';

import { db } from '@/lib/db';
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
  github: 'GITHUB', // GitHub projects management
  links: 'LINKS',
  awards: 'AWARDS',
  certifications: 'CERTIFICATIONS',
  publications: 'PUBLICATIONS',
  volunteering: 'VOLUNTEERING',
  languages: 'LANGUAGES',
  interests: 'INTERESTS',
  share: 'SHARE', // Share & Publish section
  settings: 'SETTINGS', // Account settings
};

interface PageProps {
  params: Promise<{ section: string }>;
}

export default async function SectionPage({ params }: PageProps) {
  const { section: sectionSlug } = await params;

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
          blogPosts: { orderBy: { createdAt: 'desc' } },
          youtubeVideos: { orderBy: { createdAt: 'desc' } },
          photos: { orderBy: { sortOrder: 'asc' } },
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

  // Handle SHARE section — redirects to top-level /share page
  if (sectionSlug === 'share') {
    redirect('/share');
  }

  // Handle GITHUB section - redirect to unified Data Sources page
  if (sectionSlug === 'github') {
    redirect('/data-sources');
  }

  // Handle import-sync - redirect to unified Data Sources page
  if (sectionSlug === 'import-sync') {
    redirect('/data-sources');
  }

  // Handle SETTINGS section — redirects to top-level /settings page
  if (sectionSlug === 'settings') {
    redirect('/settings');
  }

  // Determine section type from slug
  let sectionType = SLUG_TO_SECTION[sectionSlug];
  let customSectionId: string | null = null;

  // Handle custom sections (custom-{id})
  if (!sectionType && sectionSlug.startsWith('custom-')) {
    customSectionId = sectionSlug.replace('custom-', '');
    sectionType = 'CUSTOM';
  }

  if (!sectionType) {
    notFound();
  }

  // Find the section configuration
  const section = serializedProfile.sections.find(
    (s) => s.type === sectionType && (sectionType !== 'CUSTOM' || s.id === customSectionId)
  );

  return (
    <SectionEditor
      profile={serializedProfile}
      sectionType={sectionType}
      section={section || null}
      customSectionId={customSectionId}
    />
  );
}
