import { auth } from '@clerk/nextjs/server';
import { notFound, redirect } from 'next/navigation';

import { db } from '@/lib/db';
import { SectionEditor } from './section-editor';

// Map URL slugs to section types
const SLUG_TO_SECTION: Record<string, string> = {
  'basic-info': 'BASIC_INFO',
  experience: 'EXPERIENCE',
  education: 'EDUCATION',
  skills: 'SKILLS',
  projects: 'PROJECTS',
  links: 'LINKS',
  awards: 'AWARDS',
  certifications: 'CERTIFICATIONS',
  publications: 'PUBLICATIONS',
  volunteering: 'VOLUNTEERING',
  languages: 'LANGUAGES',
  interests: 'INTERESTS',
  share: 'SHARE', // Share & Publish section
};

interface PageProps {
  params: Promise<{ section: string }>;
}

export default async function SectionPage({ params }: PageProps) {
  const { section: sectionSlug } = await params;

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

  // Handle SHARE section separately (not a profile section)
  if (sectionSlug === 'share') {
    return (
      <SectionEditor
        profile={user.profile}
        sectionType="SHARE"
        section={null}
        customSectionId={null}
      />
    );
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
  const section = user.profile.sections.find(
    (s) => s.type === sectionType && (sectionType !== 'CUSTOM' || s.id === customSectionId)
  );

  return (
    <SectionEditor
      profile={user.profile}
      sectionType={sectionType}
      section={section || null}
      customSectionId={customSectionId}
    />
  );
}
