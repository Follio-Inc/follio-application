/**
 * Account Management API
 * Handles account-level operations including permanent deletion
 */

import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { AccountDeletionError, deleteAccountCompletely } from '@/lib/account/delete-account';
import { db } from '@/lib/db';

/**
 * DELETE /api/account
 * Permanently delete the user's account from both Clerk and database
 *
 * This is an irreversible operation that:
 * 1. Deletes the user from Clerk authentication (required — must succeed)
 * 2. Deletes all user data from the database (cascades to profile, experiences, etc.)
 *
 * Clerk is deleted first so the user cannot sign back in and recreate an account
 * if database cleanup fails. The user must be authenticated.
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

    console.log(`[DELETE /api/account] Starting account deletion for clerkId: ${clerkId}`);

    const clerk = await clerkClient();
    const result = await deleteAccountCompletely(clerkId, (id) =>
      clerk.users.deleteUser(id).then(() => undefined)
    );

    console.log(
      `[DELETE /api/account] Deleted account — clerkId: ${clerkId}, userId: ${result.userId}, dbDeleted: ${result.databaseDeleted}`
    );

    return NextResponse.json({
      success: true,
      message: 'Your account has been permanently deleted',
    });
  } catch (error) {
    console.error('[DELETE /api/account] Error deleting account:', error);

    if (error instanceof AccountDeletionError) {
      return NextResponse.json(
        {
          error: error.code,
          message: error.message,
        },
        { status: 500 }
      );
    }

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
