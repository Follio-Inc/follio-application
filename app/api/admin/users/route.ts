/**
 * GET /api/admin/users
 * Returns a paginated, searchable list of all users.
 *
 * Query params:
 *   - page: number (default 1)
 *   - limit: number (default 20, max 100)
 *   - search: string (optional, searches email/name)
 *   - sort: 'newest' | 'oldest' | 'email' (default 'newest')
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { handleApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';

const UsersQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
  sort: z.enum(['newest', 'oldest', 'email']).default('newest'),
});

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const query = UsersQuerySchema.parse(searchParams);

    const where = query.search
      ? {
          OR: [
            { email: { contains: query.search, mode: 'insensitive' as const } },
            {
              profiles: {
                some: {
                  OR: [
                    { firstName: { contains: query.search, mode: 'insensitive' as const } },
                    { lastName: { contains: query.search, mode: 'insensitive' as const } },
                    { handle: { contains: query.search, mode: 'insensitive' as const } },
                  ],
                },
              },
            },
          ],
        }
      : {};

    const orderBy =
      query.sort === 'oldest'
        ? { createdAt: 'asc' as const }
        : query.sort === 'email'
          ? { email: 'asc' as const }
          : { createdAt: 'desc' as const };

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          clerkId: true,
          email: true,
          mainPurpose: true,
          lastSignInAt: true,
          createdAt: true,
          updatedAt: true,
          profiles: {
            where: { isArchived: false },
            select: {
              id: true,
              handle: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
              status: true,
              portfolioVisibility: true,
              resumeVisibility: true,
            },
          },
          _count: {
            select: {
              profiles: true,
              importSessions: true,
              shareTokens: true,
            },
          },
        },
      }),
      db.user.count({ where }),
    ]);

    // Look up which of these users are admins (from the separate Admin table)
    const adminClerkIds = new Set(
      (await db.admin.findMany({ select: { clerkId: true } })).map((a) => a.clerkId)
    );

    const usersWithAdminFlag = users.map((u) => ({
      ...u,
      isAdmin: adminClerkIds.has(u.clerkId),
    }));

    const totalPages = Math.ceil(total / query.limit);

    logger.info('Admin users list fetched', {
      source: 'admin',
      page: query.page,
      total,
    });

    return NextResponse.json({
      success: true,
      users: usersWithAdminFlag,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages,
        hasNext: query.page < totalPages,
        hasPrev: query.page > 1,
      },
    });
  } catch (error) {
    return handleApiError(error, { path: '/api/admin/users', method: 'GET' });
  }
}
