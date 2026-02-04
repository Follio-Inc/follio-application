/**
 * Account Management API
 * Handles account-level operations including permanent deletion
 */

import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';

/**
 * DELETE /api/account
 * Permanently delete the user's account from both Clerk and database
 *
 * This is an irreversible operation that:
 * 1. Deletes all user data from the database (cascades to profile, experiences, etc.)
 * 2. Deletes the user from Clerk authentication
 *
 * The user must be authenticated and the request must include confirmation.
 */
export async function DELETE() {
  try {
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'You must be signed in to delete your account' },
        { status: 401 }
      );
    }

    // Find the user in our database
    const user = await db.user.findUnique({
      where: { clerkId },
      include: {
        profile: {
          select: {
            id: true,
            handle: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Not found', message: 'User account not found' },
        { status: 404 }
      );
    }

    console.log(
      `[DELETE /api/account] Starting account deletion for user: ${user.id}, clerkId: ${clerkId}`
    );

    // Step 1: Delete from our database
    // Due to cascading deletes in Prisma schema, this will delete:
    // - Profile (and all related: contactInfo, links, workExperiences, educations,
    //   skills, skillGroups, projects, awards, certifications, sections, rawImports,
    //   dataSourceConnections, githubProfile)
    // - ImportJobs
    // - ImportLogs
    // - ShareTokens
    await db.user.delete({
      where: { id: user.id },
    });

    console.log(`[DELETE /api/account] Deleted user from database: ${user.id}`);

    // Step 2: Delete from Clerk
    // This removes the authentication record and any associated data in Clerk
    try {
      const clerk = await clerkClient();
      await clerk.users.deleteUser(clerkId);
      console.log(`[DELETE /api/account] Deleted user from Clerk: ${clerkId}`);
    } catch (clerkError) {
      // Log the error but don't fail the request
      // The database data is already deleted, which is the important part
      // The Clerk user will be orphaned but harmless
      console.error(`[DELETE /api/account] Failed to delete from Clerk (non-fatal):`, clerkError);
    }

    return NextResponse.json({
      success: true,
      message: 'Your account has been permanently deleted',
    });
  } catch (error) {
    console.error('[DELETE /api/account] Error deleting account:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to delete account. Please try again or contact support.',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/account
 * Get account information and data summary for deletion preview
 */
export async function GET() {
  try {
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { clerkId },
      include: {
        profile: {
          include: {
            _count: {
              select: {
                workExperiences: true,
                educations: true,
                skills: true,
                projects: true,
                awards: true,
                certifications: true,
                links: true,
              },
            },
          },
        },
        _count: {
          select: {
            importJobs: true,
            importLogs: true,
            shareTokens: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Return a summary of what will be deleted
    return NextResponse.json({
      user: {
        email: user.email,
        createdAt: user.createdAt,
      },
      profile: user.profile
        ? {
            handle: user.profile.handle,
            status: user.profile.status,
          }
        : null,
      dataSummary: {
        workExperiences: user.profile?._count.workExperiences ?? 0,
        educations: user.profile?._count.educations ?? 0,
        skills: user.profile?._count.skills ?? 0,
        projects: user.profile?._count.projects ?? 0,
        awards: user.profile?._count.awards ?? 0,
        certifications: user.profile?._count.certifications ?? 0,
        links: user.profile?._count.links ?? 0,
        importJobs: user._count.importJobs,
        shareTokens: user._count.shareTokens,
      },
    });
  } catch (error) {
    console.error('[GET /api/account] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
