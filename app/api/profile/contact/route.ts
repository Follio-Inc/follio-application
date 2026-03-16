import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { resolveActiveProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { ContactInfoSchema } from '@/lib/validations';

/**
 * GET /api/profile/contact
 * Get contact info for the current user's profile
 */
export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const context = await resolveActiveProfileContext(userId);
    const contactInfo = await db.contactInfo.findUnique({
      where: { profileId: context.profileId },
    });

    return NextResponse.json({ contactInfo });
  } catch (error) {
    console.error('Error fetching contact info:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/profile/contact
 * Update contact info for the current user's profile
 */
export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = ContactInfoSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validatedData.error.flatten() },
        { status: 400 }
      );
    }

    const context = await resolveActiveProfileContext(userId);

    const existingContactInfo = await db.contactInfo.findUnique({
      where: { profileId: context.profileId },
      select: { id: true },
    });

    let contactInfo;

    if (existingContactInfo) {
      // Update existing contact info
      contactInfo = await db.contactInfo.update({
        where: { id: existingContactInfo.id },
        data: {
          ...validatedData.data,
          updatedAt: new Date(),
        },
      });
    } else {
      // Create contact info if it doesn't exist
      contactInfo = await db.contactInfo.create({
        data: {
          profileId: context.profileId,
          ...validatedData.data,
        },
      });
    }

    return NextResponse.json({ success: true, contactInfo });
  } catch (error) {
    console.error('Error updating contact info:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
