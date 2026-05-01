'use client';

import { ChevronLeft, ChevronRight, Search, SortAsc } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { cn, formatDate } from '@/lib/utils';

/* ────────────────────────── Types ────────────────────────── */

interface UserRow {
  id: string;
  email: string;
  isAdmin: boolean;
  mainPurpose: string | null;
  lastSignInAt: string | null;
  createdAt: string;
  profile: {
    handle: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
    status: string;
    portfolioVisibility: string;
  } | null;
  counts: {
    profiles: number;
    importSessions: number;
  };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface Props {
  users: UserRow[];
  pagination: Pagination;
  currentSearch: string;
  currentSort: string;
}

/* ────────────────────────── Helpers ────────────────────────── */

function getUserDisplayName(user: UserRow): string {
  if (user.profile?.firstName || user.profile?.lastName) {
    return [user.profile.firstName, user.profile.lastName].filter(Boolean).join(' ');
  }
  return user.email.split('@')[0];
}

function buildUrl(params: Record<string, string | number>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value !== undefined) {
      searchParams.set(key, String(value));
    }
  }
  return `/admin/users?${searchParams.toString()}`;
}

/* ────────────────────────── Component ────────────────────────── */

export function AdminUsersClient({ users, pagination, currentSearch, currentSort }: Props) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState(currentSearch);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      router.push(buildUrl({ search: searchInput, sort: currentSort, page: 1 }));
    },
    [searchInput, currentSort, router]
  );

  const handleSortChange = useCallback(
    (sort: string) => {
      router.push(buildUrl({ search: currentSearch, sort, page: 1 }));
    },
    [currentSearch, router]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">
            {pagination.total} total user{pagination.total !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search email, name, handle…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="h-9 w-64 rounded-lg border bg-background pl-9 pr-3 text-sm outline-none ring-ring focus:ring-2"
            />
          </form>

          {/* Sort */}
          <div className="relative">
            <select
              value={currentSort}
              onChange={(e) => handleSortChange(e.target.value)}
              className="h-9 appearance-none rounded-lg border bg-background pl-8 pr-6 text-sm outline-none ring-ring focus:ring-2"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="email">Email A-Z</option>
            </select>
            <SortAsc className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>
      </div>

      {/* User list */}
      <div className="rounded-xl border bg-card shadow-sm">
        {/* Header */}
        <div className="hidden border-b px-5 py-3 sm:grid sm:grid-cols-12 sm:gap-4">
          <span className="col-span-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            User
          </span>
          <span className="col-span-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Handle
          </span>
          <span className="col-span-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Status
          </span>
          <span className="col-span-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Joined
          </span>
          <span className="col-span-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Content
          </span>
        </div>

        {/* Rows */}
        {users.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">
            {currentSearch ? 'No users match your search.' : 'No users found.'}
          </div>
        ) : (
          <div className="divide-y">
            {users.map((user) => (
              <Link
                key={user.id}
                href={`/admin/users/${user.id}`}
                className="block px-5 py-3.5 transition-colors hover:bg-muted/50 sm:grid sm:grid-cols-12 sm:items-center sm:gap-4"
              >
                {/* User info */}
                <div className="col-span-4 flex min-w-0 items-center gap-3">
                  {user.profile?.avatarUrl ? (
                    <Image
                      src={user.profile.avatarUrl}
                      alt=""
                      width={32}
                      height={32}
                      className="h-8 w-8 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                      {getUserDisplayName(user).charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{getUserDisplayName(user)}</p>
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  </div>
                </div>

                {/* Handle */}
                <div className="col-span-2 mt-1 sm:mt-0">
                  {user.profile?.handle ? (
                    <span className="font-mono text-xs text-muted-foreground">
                      @{user.profile.handle}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground/50">—</span>
                  )}
                </div>

                {/* Status */}
                <div className="col-span-2 mt-1 sm:mt-0">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
                      user.profile?.portfolioVisibility === 'PUBLIC'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : user.profile?.status === 'DRAFT'
                          ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                    )}
                  >
                    {user.profile?.portfolioVisibility === 'PUBLIC'
                      ? 'Published'
                      : (user.profile?.status ?? 'No profile')}
                  </span>
                  {user.isAdmin && (
                    <span className="ml-1.5 inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                      Admin
                    </span>
                  )}
                </div>

                {/* Joined date */}
                <div className="col-span-2 mt-1 sm:mt-0">
                  <span className="text-xs text-muted-foreground">
                    {formatDate(user.createdAt, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>

                {/* Content counts */}
                <div className="col-span-2 mt-1 text-right sm:mt-0">
                  <span className="text-xs text-muted-foreground">
                    {user.counts.profiles} resume{user.counts.profiles !== 1 ? 's' : ''}
                    {user.counts.importSessions > 0 && (
                      <>
                        {' '}
                        · {user.counts.importSessions} import
                        {user.counts.importSessions !== 1 ? 's' : ''}
                      </>
                    )}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(pagination.page - 1) * pagination.limit + 1}–
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
          </p>
          <div className="flex items-center gap-2">
            {pagination.page > 1 ? (
              <Link
                href={buildUrl({
                  search: currentSearch,
                  sort: currentSort,
                  page: pagination.page - 1,
                })}
                className="flex h-8 w-8 items-center justify-center rounded-lg border text-sm transition-colors hover:bg-muted"
              >
                <ChevronLeft className="h-4 w-4" />
              </Link>
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border text-sm opacity-40">
                <ChevronLeft className="h-4 w-4" />
              </span>
            )}

            <span className="px-2 text-sm font-medium">
              {pagination.page} / {pagination.totalPages}
            </span>

            {pagination.page < pagination.totalPages ? (
              <Link
                href={buildUrl({
                  search: currentSearch,
                  sort: currentSort,
                  page: pagination.page + 1,
                })}
                className="flex h-8 w-8 items-center justify-center rounded-lg border text-sm transition-colors hover:bg-muted"
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border text-sm opacity-40">
                <ChevronRight className="h-4 w-4" />
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
