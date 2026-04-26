import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { resolveActiveProfileContextOrNull } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { BuilderLayoutClient } from './builder-layout-client';

import type { SectionType } from '@prisma/client';

import type { FullProfile } from '@/types';

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

// Single source of truth for the include shape so we don't duplicate it.
const PROFILE_INCLUDE = {
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
} as const;

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
    include: PROFILE_INCLUDE,
  });

  if (!profile) {
    redirect('/onboarding');
  }

  // Auto-create any missing default sections in a single transaction so
  // we don't pay for a second `findUnique` round-trip with 14 relations.
  const existingTypes = new Set(profile.sections.map((s) => s.type));
  const missingSections = DEFAULT_SECTION_CONFIGS.filter(
    (config) => !existingTypes.has(config.type)
  );

  if (missingSections.length > 0) {
    // Compute the desired final ordering in memory first so the DB writes
    // can run as a single batch and we can build the in-memory result
    // without re-fetching.
    const linksIdx = profile.sections.findIndex((s) => s.type === 'LINKS');
    const maxOrder = profile.sections.reduce((max, s) => Math.max(max, s.sortOrder), -1);

    const provisionalNewSections = missingSections.map((config, i) => {
      const sortOrder =
        profile.sections.length === 0
          ? // Brand new profile \u2014 use the default config order
            DEFAULT_SECTION_CONFIGS.findIndex((c) => c.type === config.type)
          : config.type === 'SUMMARY' && linksIdx >= 0
            ? profile.sections[linksIdx].sortOrder + 0.5
            : maxOrder + 1 + i;

      return {
        profileId: profile.id,
        type: config.type,
        title: config.title,
        sortOrder,
        isVisible: true,
      };
    });

    const createdSections = await db.$transaction(async (tx) => {
      // Create all missing sections \u2014 use individual creates so we get the
      // generated rows back (createMany doesn't return data on all DBs).
      const created = await Promise.all(
        provisionalNewSections.map((data) => tx.profileSection.create({ data }))
      );

      // Re-normalize sort orders to dense indices across all sections.
      const merged = [...profile.sections, ...created].sort((a, b) => a.sortOrder - b.sortOrder);
      const normalized = merged.map((s, idx) => ({ ...s, sortOrder: idx }));

      // Only update rows whose sortOrder actually changed.
      await Promise.all(
        normalized
          .filter((s, idx) => merged[idx].sortOrder !== idx)
          .map((s) =>
            tx.profileSection.update({
              where: { id: s.id },
              data: { sortOrder: s.sortOrder },
            })
          )
      );

      return normalized;
    });

    // Patch the in-memory profile with the freshly-created + normalized
    // sections so we can hand it directly to the client without re-fetching.
    profile.sections = createdSections;
  }

  // Next.js RSC serializes Date objects natively over the wire \u2014 no need
  // for `JSON.parse(JSON.stringify(...))` (which actually corrupts Date
  // typings by silently turning them into strings).
  return (
    <BuilderLayoutClient profile={profile as unknown as FullProfile}>
      {children}
    </BuilderLayoutClient>
  );
}
