/**
 * The resume fields AI edits and skill reads work from, loaded the same way
 * everywhere so refs like "E1.2" and "K3" mean the same line in each.
 */

import type { Prisma } from '@prisma/client';

import { db } from '@/lib/db';
import { Errors } from '@/lib/errors';

const EDIT_SOURCE_SELECT = {
  headline: true,
  summary: true,
  workExperiences: {
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      company: true,
      role: true,
      startDate: true,
      endDate: true,
      isCurrent: true,
      bullets: true,
      bulletsHtml: true,
      isVisible: true,
    },
  },
  skills: { orderBy: { sortOrder: 'asc' }, select: { name: true } },
  educations: {
    orderBy: { sortOrder: 'asc' },
    select: { institution: true, degree: true, fieldOfStudy: true },
  },
  certifications: { orderBy: { sortOrder: 'asc' }, select: { name: true, issuer: true } },
  projects: {
    orderBy: { sortOrder: 'asc' },
    select: { title: true, description: true, techStack: true },
  },
} satisfies Prisma.ProfileSelect;

export async function loadEditSource(profileId: string) {
  const profile = await db.profile.findUnique({
    where: { id: profileId },
    select: EDIT_SOURCE_SELECT,
  });
  if (!profile) throw Errors.notFound('Resume');
  return profile;
}
