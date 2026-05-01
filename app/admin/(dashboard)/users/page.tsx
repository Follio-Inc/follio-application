import { requireAdmin } from '@/lib/admin';
import { db } from '@/lib/db';

import { AdminUsersClient } from './users-client';

export const metadata = {
  title: 'Users - Admin - Follio',
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  await requireAdmin();

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
  const search = typeof params.search === 'string' ? params.search : undefined;
  const sort = (['newest', 'oldest', 'email'] as const).includes(params.sort as 'newest')
    ? (params.sort as 'newest' | 'oldest' | 'email')
    : 'newest';

  const where = search
    ? {
        OR: [
          { email: { contains: search, mode: 'insensitive' as const } },
          {
            profiles: {
              some: {
                OR: [
                  { firstName: { contains: search, mode: 'insensitive' as const } },
                  { lastName: { contains: search, mode: 'insensitive' as const } },
                  { handle: { contains: search, mode: 'insensitive' as const } },
                ],
              },
            },
          },
        ],
      }
    : {};

  const orderBy =
    sort === 'oldest'
      ? { createdAt: 'asc' as const }
      : sort === 'email'
        ? { email: 'asc' as const }
        : { createdAt: 'desc' as const };

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        clerkId: true,
        email: true,
        mainPurpose: true,
        lastSignInAt: true,
        createdAt: true,
        profiles: {
          where: { isArchived: false },
          take: 1,
          orderBy: { createdAt: 'asc' },
          select: {
            handle: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            status: true,
            portfolioVisibility: true,
          },
        },
        _count: {
          select: {
            profiles: true,
            importSessions: true,
          },
        },
      },
    }),
    db.user.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  // Look up which of these users are admins (from the separate Admin table)
  const adminClerkIds = new Set(
    (await db.admin.findMany({ select: { clerkId: true } })).map((a) => a.clerkId)
  );

  const serializedUsers = users.map((u) => ({
    id: u.id,
    email: u.email,
    isAdmin: adminClerkIds.has(u.clerkId),
    mainPurpose: u.mainPurpose,
    lastSignInAt: u.lastSignInAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    profile: u.profiles[0]
      ? {
          handle: u.profiles[0].handle,
          firstName: u.profiles[0].firstName,
          lastName: u.profiles[0].lastName,
          avatarUrl: u.profiles[0].avatarUrl,
          status: u.profiles[0].status,
          portfolioVisibility: u.profiles[0].portfolioVisibility,
        }
      : null,
    counts: {
      profiles: u._count.profiles,
      importSessions: u._count.importSessions,
    },
  }));

  return (
    <AdminUsersClient
      users={serializedUsers}
      pagination={{ page, limit, total, totalPages }}
      currentSearch={search ?? ''}
      currentSort={sort}
    />
  );
}
