import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { resolveActiveProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { AppError, ErrorCode, handleApiError } from '@/lib/errors';

import type { SectionType } from '@prisma/client';

// Default sections for new users
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

// GET /api/profile/sections - Get all sections for user's profile
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      throw new AppError('Unauthorized', ErrorCode.UNAUTHORIZED, 401);
    }

    const context = await resolveActiveProfileContext(userId);
    const sections = await db.profileSection.findMany({
      where: { profileId: context.profileId },
      orderBy: { sortOrder: 'asc' },
    });

    // If no sections exist, create default sections
    if (sections.length === 0) {
      const defaultSections = await Promise.all(
        DEFAULT_SECTION_CONFIGS.map((config, index) =>
          db.profileSection.create({
            data: {
              profileId: context.profileId,
              type: config.type,
              title: config.title,
              sortOrder: index,
              isVisible: true,
            },
          })
        )
      );
      return NextResponse.json(defaultSections);
    }

    // Auto-add any missing default sections for existing users
    const existingTypes = new Set(sections.map((s) => s.type));
    const missingSections = DEFAULT_SECTION_CONFIGS.filter(
      (config) => !existingTypes.has(config.type)
    );

    if (missingSections.length > 0) {
      const maxOrder = sections.reduce((max, s) => Math.max(max, s.sortOrder), -1);

      // For SUMMARY, insert it right after LINKS (top of body) instead of at the end
      const linksIdx = sections.findIndex((s) => s.type === 'LINKS');
      // Find the first body section position (right after last header section)
      const insertAfterIdx = linksIdx;

      const newSections = await Promise.all(
        missingSections.map((config, i) => {
          // Place SUMMARY right after header sections; others at the end
          const sortOrder =
            config.type === 'SUMMARY' && insertAfterIdx >= 0
              ? sections[insertAfterIdx].sortOrder + 0.5
              : maxOrder + 1 + i;

          return db.profileSection.create({
            data: {
              profileId: context.profileId,
              type: config.type,
              title: config.title,
              sortOrder,
              isVisible: true,
            },
          });
        })
      );

      // Re-normalize sort orders
      const allSections = [...sections, ...newSections].sort((a, b) => a.sortOrder - b.sortOrder);
      await Promise.all(
        allSections.map((s, idx) =>
          db.profileSection.update({
            where: { id: s.id },
            data: { sortOrder: idx },
          })
        )
      );

      // Re-fetch with correct order
      const updatedSections = await db.profileSection.findMany({
        where: { profileId: context.profileId },
        orderBy: { sortOrder: 'asc' },
      });

      return NextResponse.json(updatedSections);
    }

    return NextResponse.json(sections);
  } catch (error) {
    return handleApiError(error);
  }
}

// POST /api/profile/sections - Add a new section
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      throw new AppError('Unauthorized', ErrorCode.UNAUTHORIZED, 401);
    }

    const context = await resolveActiveProfileContext(userId);

    const existingSections = await db.profileSection.findMany({
      where: { profileId: context.profileId },
      orderBy: { sortOrder: 'asc' },
    });

    const body = await request.json();
    const { type, customName, title } = body;

    if (!type) {
      throw new AppError('Section type is required', ErrorCode.BAD_REQUEST, 400);
    }

    // Check if section already exists (except for CUSTOM)
    if (type !== 'CUSTOM') {
      const existingSection = existingSections.find((s) => s.type === type);
      if (existingSection) {
        throw new AppError('Section already exists', ErrorCode.BAD_REQUEST, 400);
      }
    }

    // Get max sortOrder
    const maxOrder = existingSections.reduce((max, s) => Math.max(max, s.sortOrder), -1);

    const newSection = await db.profileSection.create({
      data: {
        profileId: context.profileId,
        type: type as SectionType,
        customName: type === 'CUSTOM' ? customName : null,
        title:
          title ||
          customName ||
          type
            .replace(/_/g, ' ')
            .toLowerCase()
            .replace(/^\w/, (c: string) => c.toUpperCase()),
        sortOrder: maxOrder + 1,
        isVisible: true,
      },
    });

    return NextResponse.json(newSection, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

// PATCH /api/profile/sections - Bulk update section order/visibility
export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      throw new AppError('Unauthorized', ErrorCode.UNAUTHORIZED, 401);
    }

    const context = await resolveActiveProfileContext(userId);

    const body = await request.json();
    const { sections } = body as {
      sections: { id: string; sortOrder: number; isVisible?: boolean }[];
    };

    // Update each section
    await Promise.all(
      sections.map((s) =>
        db.profileSection.update({
          where: { id: s.id, profileId: context.profileId },
          data: {
            sortOrder: s.sortOrder,
            ...(s.isVisible !== undefined && { isVisible: s.isVisible }),
          },
        })
      )
    );

    // Return updated sections
    const updatedSections = await db.profileSection.findMany({
      where: { profileId: context.profileId },
      orderBy: { sortOrder: 'asc' },
    });

    return NextResponse.json(updatedSections);
  } catch (error) {
    return handleApiError(error);
  }
}
