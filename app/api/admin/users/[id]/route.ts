/**
 * GET /api/admin/users/[id]
 * Returns detailed information about a specific user for the admin view.
 */

import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { Errors, handleApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();

    const { id } = await params;

    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        clerkId: true,
        email: true,
        mainPurpose: true,
        lastSignInAt: true,
        createdAt: true,
        updatedAt: true,
        profiles: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            handle: true,
            resumeTitle: true,
            firstName: true,
            middleName: true,
            lastName: true,
            headline: true,
            avatarUrl: true,
            status: true,
            portfolioVisibility: true,
            resumeVisibility: true,
            isArchived: true,
            createdAt: true,
            updatedAt: true,
            publishedAt: true,
            _count: {
              select: {
                workExperiences: true,
                educations: true,
                skills: true,
                projects: true,
                links: true,
                photos: true,
                blogPosts: true,
                youtubeVideos: true,
                certifications: true,
                awards: true,
                dataSourceConnections: true,
                generatedPortfolios: true,
              },
            },
            dataSourceConnections: {
              select: {
                source: true,
                status: true,
                lastImportedAt: true,
                itemsImported: true,
              },
            },
            githubProfile: {
              select: {
                username: true,
                publicRepos: true,
                followers: true,
                totalStars: true,
              },
            },
          },
        },
        importSessions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            source: true,
            status: true,
            proposedCount: true,
            appliedCount: true,
            createdAt: true,
          },
        },
        shareTokens: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            token: true,
            viewCount: true,
            maxViews: true,
            expiresAt: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            profiles: true,
            importSessions: true,
            importJobs: true,
            importLogs: true,
            shareTokens: true,
          },
        },
      },
    });

    if (!user) {
      throw Errors.notFound('User');
    }

    // Check admin status from the separate Admin table
    const adminRecord = await db.admin.findUnique({
      where: { clerkId: user.clerkId },
      select: { id: true },
    });

    const userWithAdminFlag = {
      ...user,
      isAdmin: !!adminRecord,
    };

    logger.info('Admin user detail fetched', {
      source: 'admin',
      userId: user.id,
    });

    return NextResponse.json({ success: true, user: userWithAdminFlag });
  } catch (error) {
    return handleApiError(error, { path: '/api/admin/users/[id]', method: 'GET' });
  }
}
