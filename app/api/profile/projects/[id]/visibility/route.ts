import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';

/**
 * Validation schema for project visibility updates
 */
const VisibilitySchema = z.object({
  isVisible: z.boolean().optional(),
  showOnPortfolio: z.boolean().optional(),
  showOnResume: z.boolean().optional(),
  showStats: z.boolean().optional(),
  showReadme: z.boolean().optional(),
  customDescription: z.string().optional().nullable(),
});

/**
 * PATCH /api/profile/projects/[id]/visibility
 * Update project visibility settings
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const validatedData = VisibilitySchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validatedData.error.flatten() },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { profile: true },
    });

    if (!user || !user.profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Verify the project belongs to the user's profile
    const existingProject = await db.project.findFirst({
      where: {
        id,
        profileId: user.profile.id,
      },
    });

    if (!existingProject) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Build update data only with provided fields
    const updateData: Record<string, boolean | string | null | Date> = {
      updatedAt: new Date(),
    };

    if (validatedData.data.isVisible !== undefined) {
      updateData.isVisible = validatedData.data.isVisible;
    }
    if (validatedData.data.showOnPortfolio !== undefined) {
      updateData.showOnPortfolio = validatedData.data.showOnPortfolio;
    }
    if (validatedData.data.showOnResume !== undefined) {
      updateData.showOnResume = validatedData.data.showOnResume;
    }
    if (validatedData.data.showStats !== undefined) {
      updateData.showStats = validatedData.data.showStats;
    }
    if (validatedData.data.showReadme !== undefined) {
      updateData.showReadme = validatedData.data.showReadme;
    }
    if (validatedData.data.customDescription !== undefined) {
      updateData.customDescription = validatedData.data.customDescription;
    }

    const project = await db.project.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, project });
  } catch (error) {
    console.error('Error updating project visibility:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/profile/projects/[id]/visibility
 * Get project visibility settings
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { profile: true },
    });

    if (!user || !user.profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const project = await db.project.findFirst({
      where: {
        id,
        profileId: user.profile.id,
      },
      select: {
        id: true,
        title: true,
        isVisible: true,
        showOnPortfolio: true,
        showOnResume: true,
        showStats: true,
        showReadme: true,
        customDescription: true,
      },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, visibility: project });
  } catch (error) {
    console.error('Error getting project visibility:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
