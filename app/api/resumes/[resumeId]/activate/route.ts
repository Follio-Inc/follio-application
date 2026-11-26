import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { AppError, handleApiError } from '@/lib/errors';
import { activateResume } from '@/services/resume-activate.service';

interface RouteContext {
  params: Promise<{ resumeId: string }>;
}

export async function PATCH(_request: Request, context: RouteContext) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { resumeId } = await context.params;

    const user = await db.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Shared with the MCP open_in_builder tool.
    let activated;
    try {
      activated = await activateResume(user.id, resumeId);
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 404) {
        return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
      }
      throw error;
    }

    return NextResponse.json({ success: true, activeProfileId: activated.id });
  } catch (error) {
    return handleApiError(error, {
      method: 'PATCH',
      path: '/api/resumes/[resumeId]/activate',
    });
  }
}
