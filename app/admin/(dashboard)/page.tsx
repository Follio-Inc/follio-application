import { requireAdmin } from '@/lib/admin';
import { db } from '@/lib/db';

import { AdminOverviewClient } from './overview-client';

export const metadata = {
  title: 'Admin Overview - Follio',
};

export default async function AdminOverviewPage() {
  await requireAdmin();

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    totalUsers,
    totalProfiles,
    totalPublishedPortfolios,
    totalProjects,
    signupsToday,
    signupsThisWeek,
    signupsThisMonth,
    recentUsers,
    purposeGroups,
    profileStatusGroups,
    dataSourceGroups,
    last30DaysUsers,
    totalWorkExperiences,
    totalEducations,
  ] = await Promise.all([
    db.user.count(),
    db.profile.count({ where: { isArchived: false } }),
    db.profile.count({
      where: { portfolioVisibility: 'PUBLIC', isArchived: false },
    }),
    db.project.count(),
    db.user.count({ where: { createdAt: { gte: startOfToday } } }),
    db.user.count({ where: { createdAt: { gte: startOfWeek } } }),
    db.user.count({ where: { createdAt: { gte: startOfMonth } } }),
    db.user.findMany({
      take: 8,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        createdAt: true,
        mainPurpose: true,
        profile: {
          select: { id: true, handle: true, firstName: true, middleName: true, lastName: true },
        },
      },
    }),
    db.user.groupBy({
      by: ['mainPurpose'],
      _count: { id: true },
    }),
    db.profile.groupBy({
      by: ['status'],
      where: { isArchived: false },
      _count: { id: true },
    }),
    db.dataSourceConnection.groupBy({
      by: ['source'],
      _count: { id: true },
    }),
    db.user.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    db.workExperience.count(),
    db.education.count(),
  ]);

  // Build signup chart data
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

  const stats = {
    totalUsers,
    totalProfiles,
    totalPublishedPortfolios,
    totalProjects,
    totalWorkExperiences,
    totalEducations,
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
      name: u.profile
        ? [u.profile.firstName, u.profile.middleName, u.profile.lastName]
            .filter(Boolean)
            .join(' ') || null
        : null,
      handle: u.profile?.handle ?? null,
    })),
  };

  return <AdminOverviewClient stats={stats} />;
}
