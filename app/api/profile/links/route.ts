import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { resolveActiveProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { LinkSchema } from '@/lib/validations';

/**
 * GET /api/profile/links
 * Get all links for the current user's profile
 */
export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const context = await resolveActiveProfileContext(userId);
    const links = await db.link.findMany({
      where: { profileId: context.profileId },
      orderBy: { sortOrder: 'asc' },
    });

    return NextResponse.json({ links });
  } catch (error) {
    console.error('Error fetching links:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/profile/links
 * Create a new link
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = LinkSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validatedData.error.flatten() },
        { status: 400 }
      );
    }

    const context = await resolveActiveProfileContext(userId);

    // Check for duplicate URL (skip blanks — multiple new header rows start empty)
    if (validatedData.data.url) {
      const existingLink = await db.link.findFirst({
        where: {
          profileId: context.profileId,
          url: { equals: validatedData.data.url, mode: 'insensitive' },
        },
      });

      if (existingLink) {
        return NextResponse.json(
          { error: 'This URL already exists in your links' },
          { status: 400 }
        );
      }
    }

    // Get the highest sortOrder
    const lastLink = await db.link.findFirst({
      where: { profileId: context.profileId },
      orderBy: { sortOrder: 'desc' },
    });

    const link = await db.link.create({
      data: {
        profileId: context.profileId,
        ...validatedData.data,
        sortOrder: (lastLink?.sortOrder ?? -1) + 1,
        source: 'MANUAL',
      },
    });

    return NextResponse.json({ success: true, link }, { status: 201 });
  } catch (error) {
    console.error('Error creating link:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
