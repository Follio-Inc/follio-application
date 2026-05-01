/**
 * GET /api/admin/stats
 * Returns platform-wide statistics for the admin dashboard.
 */

import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { handleApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';

interface PlatformStats {
  totalUsers: number;
  totalProfiles: number;
  totalPublishedPortfolios: number;
  totalResumes: number;
  totalProjects: number;
  totalWorkExperiences: number;
  totalEducations: number;
  totalImportSessions: number;
  signupsToday: number;
  signupsThisWeek: number;
  signupsThisMonth: number;
  signupsByDay: Array<{ date: string; count: number }>;
  purposeBreakdown: Array<{ purpose: string; count: number }>;
  profileStatusBreakdown: Array<{ status: string; count: number }>;
  dataSourceBreakdown: Array<{ source: string; count: number }>;
  recentSignups: Array<{
    id: string;
    email: string;
    createdAt: string;
    mainPurpose: string | null;
    hasProfile: boolean;
  }>;
}

export async function GET() {
  try {
    await requireAdmin();

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Run all independent queries in parallel
    const [
      totalUsers,
      totalProfiles,
      totalPublishedPortfolios,
      totalResumes,
      totalProjects,
      totalWorkExperiences,
      totalEducations,
      totalImportSessions,
      signupsToday,
      signupsThisWeek,
      signupsThisMonth,
      recentUsers,
      purposeGroups,
      profileStatusGroups,
      dataSourceGroups,
      last30DaysUsers,
    ] = await Promise.all([
      db.user.count(),
      db.profile.count({ where: { isArchived: false } }),
      db.profile.count({
        where: { portfolioVisibility: 'PUBLIC', isArchived: false },
      }),
      db.profile.count({ where: { isArchived: false } }),
      db.project.count(),
      db.workExperience.count(),
      db.education.count(),
      db.importSession.count(),
      db.user.count({ where: { createdAt: { gte: startOfToday } } }),
      db.user.count({ where: { createdAt: { gte: startOfWeek } } }),
      db.user.count({ where: { createdAt: { gte: startOfMonth } } }),

      // Recent signups (last 10)
      db.user.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          createdAt: true,
          mainPurpose: true,
          profile: { select: { id: true } },
        },
      }),

      // Purpose breakdown
      db.user.groupBy({
        by: ['mainPurpose'],
        _count: { id: true },
      }),

      // Profile status breakdown
      db.profile.groupBy({
        by: ['status'],
        where: { isArchived: false },
        _count: { id: true },
      }),

      // Data source connection breakdown
      db.dataSourceConnection.groupBy({
        by: ['source'],
        _count: { id: true },
      }),

      // Users from last 30 days for signup chart
      db.user.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Aggregate signups by day for the chart
    const signupsByDayMap = new Map<string, number>();
    for (let d = new Date(thirtyDaysAgo); d <= now; d.setDate(d.getDate() + 1)) {
      signupsByDayMap.set(d.toISOString().split('T')[0], 0);
    }
    for (const user of last30DaysUsers) {
      const day = user.createdAt.toISOString().split('T')[0];
      signupsByDayMap.set(day, (signupsByDayMap.get(day) ?? 0) + 1);
    }
    const signupsByDay = Array.from(signupsByDayMap.entries()).map(([date, count]) => ({
      date,
      count,
    }));

    const stats: PlatformStats = {
      totalUsers,
      totalProfiles,
      totalPublishedPortfolios,
      totalResumes,
      totalProjects,
      totalWorkExperiences,
      totalEducations,
      totalImportSessions,
      signupsToday,
      signupsThisWeek,
      signupsThisMonth,
      signupsByDay,
      purposeBreakdown: purposeGroups.map((g) => ({
        purpose: g.mainPurpose ?? 'NOT_SET',
        count: g._count.id,
      })),
      profileStatusBreakdown: profileStatusGroups.map((g) => ({
        status: g.status,
        count: g._count.id,
      })),
      dataSourceBreakdown: dataSourceGroups.map((g) => ({
        source: g.source,
        count: g._count.id,
      })),
      recentSignups: recentUsers.map((u) => ({
        id: u.id,
        email: u.email,
        createdAt: u.createdAt.toISOString(),
        mainPurpose: u.mainPurpose,
        hasProfile: !!u.profile,
      })),
    };

    logger.info('Admin stats fetched', { source: 'admin' });

    return NextResponse.json({ success: true, stats });
  } catch (error) {
    return handleApiError(error, { path: '/api/admin/stats', method: 'GET' });
  }
}
