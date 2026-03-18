'use client';

import { Briefcase, FolderGit2, GraduationCap, TrendingUp, UserPlus, Users } from 'lucide-react';
import Link from 'next/link';

import { cn, formatDate } from '@/lib/utils';

/* ────────────────────────── Types ────────────────────────── */

interface SignupDay {
  date: string;
  count: number;
}

interface BreakdownItem {
  purpose?: string;
  status?: string;
  source?: string;
  count: number;
}

interface RecentSignup {
  id: string;
  email: string;
  createdAt: string;
  mainPurpose: string | null;
  name: string | null;
  handle: string | null;
}

interface OverviewStats {
  totalUsers: number;
  totalProfiles: number;
  totalPublishedPortfolios: number;
  totalProjects: number;
  totalWorkExperiences: number;
  totalEducations: number;
  signupsToday: number;
  signupsThisWeek: number;
  signupsThisMonth: number;
  signupsByDay: SignupDay[];
  purposeBreakdown: BreakdownItem[];
  profileStatusBreakdown: BreakdownItem[];
  dataSourceBreakdown: BreakdownItem[];
  recentSignups: RecentSignup[];
}

/* ────────────────────────── Helpers ────────────────────────── */

function StatCard({
  label,
  value,
  icon: Icon,
  subtext,
  className,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  subtext?: string;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl border bg-card p-5 shadow-sm', className)}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground/60" />
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      {subtext && <p className="mt-1 text-xs text-muted-foreground">{subtext}</p>}
    </div>
  );
}

function SignupChart({ data }: { data: SignupDay[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold">Signups — Last 30 Days</h3>
      <div className="flex items-end gap-[3px]" style={{ height: 120 }}>
        {data.map((day) => {
          const height = Math.max((day.count / max) * 100, 2);
          return (
            <div
              key={day.date}
              className="group relative flex-1"
              title={`${day.date}: ${day.count}`}
            >
              <div
                className="w-full rounded-t bg-primary/70 transition-colors group-hover:bg-primary"
                style={{ height: `${height}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
        <span>{data[0]?.date.slice(5)}</span>
        <span>{data[data.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}

function BreakdownCard({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; count: number }>;
}) {
  const total = items.reduce((sum, i) => sum + i.count, 0) || 1;

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <div className="space-y-2.5">
        {items.map((item) => {
          const pct = Math.round((item.count / total) * 100);
          return (
            <div key={item.label}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{formatLabel(item.label)}</span>
                <span className="font-medium">
                  {item.count} ({pct}%)
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary/60" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatLabel(raw: string): string {
  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace('Not Set', 'Not Set');
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(dateStr);
}

/* ────────────────────────── Main ────────────────────────── */

export function AdminOverviewClient({ stats }: { stats: OverviewStats }) {
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Platform Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Real-time snapshot of Follio&apos;s usage and growth.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Users"
          value={stats.totalUsers}
          icon={Users}
          subtext={`${stats.signupsToday} today · ${stats.signupsThisWeek} this week`}
        />
        <StatCard
          label="Published Portfolios"
          value={stats.totalPublishedPortfolios}
          icon={TrendingUp}
          subtext={`${stats.totalProfiles} total profiles`}
        />
        <StatCard
          label="This Month"
          value={`+${stats.signupsThisMonth}`}
          icon={UserPlus}
          subtext="new signups"
        />
        <StatCard label="Total Projects" value={stats.totalProjects} icon={FolderGit2} />
      </div>

      {/* Content stats row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Work Experiences" value={stats.totalWorkExperiences} icon={Briefcase} />
        <StatCard label="Education Entries" value={stats.totalEducations} icon={GraduationCap} />
        <StatCard label="Profiles Created" value={stats.totalProfiles} icon={Users} />
      </div>

      {/* Signup chart */}
      <SignupChart data={stats.signupsByDay} />

      {/* Breakdowns */}
      <div className="grid gap-4 md:grid-cols-3">
        <BreakdownCard
          title="User Purpose"
          items={stats.purposeBreakdown.map((i) => ({
            label: i.purpose ?? 'NOT_SET',
            count: i.count,
          }))}
        />
        <BreakdownCard
          title="Profile Status"
          items={stats.profileStatusBreakdown.map((i) => ({
            label: i.status ?? 'UNKNOWN',
            count: i.count,
          }))}
        />
        <BreakdownCard
          title="Data Sources"
          items={stats.dataSourceBreakdown.map((i) => ({
            label: i.source ?? 'UNKNOWN',
            count: i.count,
          }))}
        />
      </div>

      {/* Recent signups */}
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Recent Signups</h3>
          <Link href="/admin/users" className="text-xs text-primary hover:underline">
            View all users →
          </Link>
        </div>
        <div className="space-y-3">
          {stats.recentSignups.map((user) => (
            <Link
              key={user.id}
              href={`/admin/users/${user.id}`}
              className="flex items-center justify-between rounded-lg px-3 py-2 transition-colors hover:bg-muted/50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user.name || user.email}</p>
                {user.name && (
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {user.handle && (
                  <span className="hidden rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground sm:inline">
                    @{user.handle}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">{timeAgo(user.createdAt)}</span>
              </div>
            </Link>
          ))}
          {stats.recentSignups.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">No users yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
