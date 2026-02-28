import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { resolveActiveProfileContextOrNull } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { BuilderLayoutClient } from './builder-layout-client';

import type { SectionType } from '@prisma/client';

// Default sections that every profile should have
const DEFAULT_SECTION_CONFIGS: { type: SectionType; title: string }[] = [
  { type: 'BASIC_INFO', title: 'Header' },
  { type: 'PHOTOS', title: 'Photos' },
  { type: 'SUMMARY', title: 'Summary' },
  { type: 'EXPERIENCE', title: 'Experience' },
  { type: 'EDUCATION', title: 'Education' },
  { type: 'SKILLS', title: 'Skills' },
  { type: 'PROJECTS', title: 'Projects' },
  { type: 'LINKS', title: 'Links' },
  { type: 'AWARDS', title: 'Awards' },
  { type: 'CERTIFICATIONS', title: 'Certifications' },
];

// Helper to serialize data for client components (converts Date objects to ISO strings)
function serializeForClient<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

export default async function BuilderLayout({ children }: { children: React.ReactNode }) {
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

  // Auto-create any missing default sections
  const existingTypes = new Set(profile.sections.map((s) => s.type));
  const missingSections = DEFAULT_SECTION_CONFIGS.filter(
    (config) => !existingTypes.has(config.type)
  );

  if (missingSections.length > 0) {
    if (profile.sections.length === 0) {
      // Brand new profile — create all defaults
      await Promise.all(
        DEFAULT_SECTION_CONFIGS.map((config, index) =>
          db.profileSection.create({
            data: {
              profileId: profile.id,
              type: config.type,
              title: config.title,
              sortOrder: index,
              isVisible: true,
            },
          })
        )
      );
    } else {
      // Existing profile missing some sections — add them
      const maxOrder = profile.sections.reduce((max, s) => Math.max(max, s.sortOrder), -1);
      const linksIdx = profile.sections.findIndex((s) => s.type === 'LINKS');
      const insertAfterIdx = linksIdx;

      const newSections = await Promise.all(
        missingSections.map((config, i) => {
          const sortOrder =
            config.type === 'SUMMARY' && insertAfterIdx >= 0
              ? profile.sections[insertAfterIdx].sortOrder + 0.5
              : maxOrder + 1 + i;

          return db.profileSection.create({
            data: {
              profileId: profile.id,
              type: config.type,
              title: config.title,
              sortOrder,
              isVisible: true,
            },
          });
        })
      );

      // Re-normalize sort orders
      const allSections = [...profile.sections, ...newSections].sort(
        (a, b) => a.sortOrder - b.sortOrder
      );
      await Promise.all(
        allSections.map((s, idx) =>
          db.profileSection.update({
            where: { id: s.id },
            data: { sortOrder: idx },
          })
        )
      );
    }

    // Re-fetch the profile with updated sections
    const refreshed = await db.profile.findUnique({
      where: { id: profile.id },
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

    if (refreshed) {
      const serializedProfile = serializeForClient(refreshed);
      return <BuilderLayoutClient profile={serializedProfile}>{children}</BuilderLayoutClient>;
    }
  }

  // Serialize the profile data to convert Date objects to strings for client component
  const serializedProfile = serializeForClient(profile);

  return <BuilderLayoutClient profile={serializedProfile}>{children}</BuilderLayoutClient>;
}
