import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { AppError, ErrorCode, handleApiError } from '@/lib/errors';
import type { SectionType } from '@/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/profile/sections/[id] - Get a single section
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      throw new AppError('Unauthorized', ErrorCode.UNAUTHORIZED, 401);
    }

    const { id } = await params;

    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { profile: true },
    });

    if (!user?.profile) {
      throw new AppError('Profile not found', ErrorCode.NOT_FOUND, 404);
    }

    const section = await db.profileSection.findFirst({
      where: {
        id,
        profileId: user.profile.id,
      },
    });

    if (!section) {
      throw new AppError('Section not found', ErrorCode.NOT_FOUND, 404);
    }

    return NextResponse.json(section);
  } catch (error) {
    return handleApiError(error);
  }
}

// PATCH /api/profile/sections/[id] - Update a single section
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      throw new AppError('Unauthorized', ErrorCode.UNAUTHORIZED, 401);
    }

    const { id } = await params;

    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { profile: true },
    });

    if (!user?.profile) {
      throw new AppError('Profile not found', ErrorCode.NOT_FOUND, 404);
    }

    const body = await request.json();
    const { title, isVisible, sortOrder, customContent, contentType } = body;

    const section = await db.profileSection.update({
      where: {
        id,
        profileId: user.profile.id,
      },
      data: {
        ...(title !== undefined && { title }),
        ...(isVisible !== undefined && { isVisible }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(customContent !== undefined && { customContent }),
        ...(contentType !== undefined && { contentType }),
      },
    });

    return NextResponse.json(section);
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE /api/profile/sections/[id] - Delete a section
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      throw new AppError('Unauthorized', ErrorCode.UNAUTHORIZED, 401);
    }

    const { id } = await params;

    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: {
        profile: {
          include: {
            workExperiences: true,
            educations: true,
            skills: true,
            projects: true,
            links: true,
            awards: true,
            certifications: true,
          },
        },
      },
    });

    if (!user?.profile) {
      throw new AppError('Profile not found', ErrorCode.NOT_FOUND, 404);
    }

    // Find the section first to check its type
    const section = await db.profileSection.findFirst({
      where: {
        id,
        profileId: user.profile.id,
      },
    });

    if (!section) {
      throw new AppError('Section not found', ErrorCode.NOT_FOUND, 404);
    }

    // Don't allow deleting BASIC_INFO section
    if (section.type === 'BASIC_INFO') {
      throw new AppError('Cannot delete Basic Info section', ErrorCode.BAD_REQUEST, 400);
    }

    // Check if section has content
    const hasContent = checkSectionHasContent(section.type, user.profile, section);
    if (hasContent) {
      throw new AppError(
        'Cannot delete section with content. Please remove all items first or hide the section instead.',
        ErrorCode.BAD_REQUEST,
        400
      );
    }

    await db.profileSection.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}

// Helper function to check if a section has content
function checkSectionHasContent(
  type: SectionType,
  profile: {
    workExperiences: { id: string }[];
    educations: { id: string }[];
    skills: { id: string }[];
    projects: { id: string }[];
    links: { id: string }[];
    awards: { id: string }[];
    certifications: { id: string }[];
  },
  section: { customContent: unknown }
): boolean {
  switch (type) {
    case 'EXPERIENCE':
      return profile.workExperiences.length > 0;
    case 'EDUCATION':
      return profile.educations.length > 0;
    case 'SKILLS':
      return profile.skills.length > 0;
    case 'PROJECTS':
      return profile.projects.length > 0;
    case 'LINKS':
      return profile.links.length > 0;
    case 'AWARDS':
      return profile.awards.length > 0;
    case 'CERTIFICATIONS':
      return profile.certifications.length > 0;
    case 'CUSTOM':
      // Check if customContent has any items
      if (section.customContent) {
        const content = section.customContent as { items?: unknown[]; content?: string };
        if (content.items && content.items.length > 0) return true;
        if (content.content && content.content.trim().length > 0) return true;
      }
      return false;
    default:
      return false;
  }
}
