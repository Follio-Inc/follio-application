'use client';

import {
  AlertTriangle,
  ArrowLeft,
  Briefcase,
  Calendar,
  Clock,
  ExternalLink,
  Eye,
  FolderGit2,
  GraduationCap,
  ImageIcon,
  Link2,
  Loader2,
  Mail,
  Shield,
  ShieldOff,
  Star,
  Upload,
  Users,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { cn, formatDate } from '@/lib/utils';

const CONFIRM_TEXT = 'CONFIRM';

/* ────────────────────────── Types ────────────────────────── */

interface ContentCounts {
  workExperiences: number;
  educations: number;
  skills: number;
  projects: number;
  links: number;
  photos: number;
  blogPosts: number;
  youtubeVideos: number;
  certifications: number;
  awards: number;
  dataSourceConnections: number;
  generatedPortfolios: number;
}

interface DataSource {
  source: string;
  status: string;
  lastImportedAt: string | null;
  itemsImported: number | null;
}

interface GitHubProfile {
  username: string;
  publicRepos: number;
  followers: number;
  totalStars: number;
}

interface ProfileData {
  id: string;
  handle: string;
  resumeTitle: string | null;
  firstName: string | null;
  lastName: string | null;
  headline: string | null;
  avatarUrl: string | null;
  status: string;
  portfolioVisibility: string;
  resumeVisibility: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  _count: ContentCounts;
  dataSourceConnections: DataSource[];
  githubProfile: GitHubProfile | null;
}

interface ImportSession {
  id: string;
  source: string;
  status: string;
  proposedCount: number | null;
  appliedCount: number | null;
  createdAt: string;
}

interface ShareToken {
  id: string;
  token: string;
  viewCount: number;
  maxViews: number | null;
  expiresAt: string | null;
  createdAt: string;
}

interface UserDetail {
  id: string;
  clerkId: string;
  email: string;
  isAdmin: boolean;
  mainPurpose: string | null;
  lastSignInAt: string | null;
  createdAt: string;
  updatedAt: string;
  profiles: ProfileData[];
  importSessions: ImportSession[];
  shareTokens: ShareToken[];
  _count: {
    profiles: number;
    importSessions: number;
    importJobs: number;
    importLogs: number;
    shareTokens: number;
  };
}

/* ────────────────────────── Helpers ────────────────────────── */

function Badge({
  children,
  variant = 'default',
}: {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}) {
  const colors = {
    default: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
    success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
    warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
    danger: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',
    info: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        colors[variant]
      )}
    >
      {children}
    </span>
  );
}

function visibilityVariant(v: string): 'success' | 'warning' | 'danger' {
  if (v === 'PUBLIC') return 'success';
  if (v === 'PRIVATE') return 'danger';
  return 'warning';
}

function statusVariant(s: string): 'success' | 'warning' | 'info' | 'default' {
  if (s === 'COMPLETE') return 'success';
  if (s === 'DRAFT' || s === 'INCOMPLETE') return 'warning';
  if (s === 'PUBLISHED') return 'info';
  return 'default';
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{value ?? '—'}</span>
    </div>
  );
}

/* ────────────────────────── Component ────────────────────────── */

export function UserDetailClient({
  user,
  currentAdminId,
}: {
  user: UserDetail;
  currentAdminId: string;
}) {
  const router = useRouter();
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [roleLoading, setRoleLoading] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);

  const isSelf = user.id === currentAdminId;
  const isAdmin = user.isAdmin;
  const action = isAdmin ? 'demote' : 'promote';

  const handleRoleChange = async () => {
    if (confirmInput !== CONFIRM_TEXT) return;
    setRoleLoading(true);
    setRoleError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRoleError(data.error?.message ?? 'Failed to change role');
        return;
      }
      setShowRoleDialog(false);
      setConfirmInput('');
      router.refresh();
    } catch {
      setRoleError('Network error. Please try again.');
    } finally {
      setRoleLoading(false);
    }
  };
  const primaryProfile = user.profiles[0];
  const displayName = primaryProfile
    ? [primaryProfile.firstName, primaryProfile.lastName].filter(Boolean).join(' ') ||
      primaryProfile.handle
    : user.email;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Back link */}
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to users
      </Link>

      {/* Header */}
      <div className="flex items-center gap-4">
        {primaryProfile?.avatarUrl ? (
          <Image
            src={primaryProfile.avatarUrl}
            alt={displayName}
            width={64}
            height={64}
            className="rounded-full"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-xl font-semibold text-muted-foreground">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold">{displayName}</h1>
          <div className="mt-1 flex items-center gap-2">
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{user.email}</span>
            {user.isAdmin && (
              <Badge variant="warning">
                <Shield className="mr-1 h-3 w-3" />
                Admin
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Role Management */}
      <Section title="Role Management">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">
                Current status:{' '}
                <Badge variant={isAdmin ? 'warning' : 'default'}>
                  {isAdmin && <Shield className="mr-1 h-3 w-3" />}
                  {isAdmin ? 'Admin' : 'Regular User'}
                </Badge>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {isAdmin
                  ? 'This user has full admin access to the platform.'
                  : 'This is a regular user with no admin privileges.'}
              </p>
            </div>
            {isSelf ? (
              <p className="text-xs italic text-muted-foreground">
                You cannot change your own role
              </p>
            ) : (
              <button
                onClick={() => {
                  setShowRoleDialog(true);
                  setConfirmInput('');
                  setRoleError(null);
                }}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                  isAdmin
                    ? 'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900'
                    : 'bg-orange-50 text-orange-700 hover:bg-orange-100 dark:bg-orange-950 dark:text-orange-400 dark:hover:bg-orange-900'
                )}
              >
                {isAdmin ? (
                  <>
                    <ShieldOff className="h-4 w-4" /> Revoke Admin
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4" /> Make Admin
                  </>
                )}
              </button>
            )}
          </div>

          {/* Confirmation Dialog */}
          {showRoleDialog && (
            <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                      {isAdmin
                        ? `Remove admin access from ${user.email}?`
                        : `Grant admin access to ${user.email}?`}
                    </p>
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                      {isAdmin
                        ? 'This user will lose all admin privileges and can no longer access the admin panel.'
                        : 'This user will gain full admin access including the ability to manage other users and view all platform data.'}
                    </p>
                  </div>
                  <div>
                    <label
                      htmlFor="confirm-role"
                      className="mb-1 block text-xs font-medium text-amber-700 dark:text-amber-300"
                    >
                      Type <span className="font-mono font-bold">CONFIRM</span> to proceed
                    </label>
                    <input
                      id="confirm-role"
                      type="text"
                      value={confirmInput}
                      onChange={(e) => setConfirmInput(e.target.value)}
                      className="h-9 w-full max-w-xs rounded-md border border-amber-300 bg-white px-3 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 dark:border-amber-700 dark:bg-amber-900 dark:text-amber-100"
                      placeholder="CONFIRM"
                      autoComplete="off"
                    />
                  </div>
                  {roleError && (
                    <p className="text-xs font-medium text-red-600 dark:text-red-400">
                      {roleError}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={handleRoleChange}
                      disabled={confirmInput !== CONFIRM_TEXT || roleLoading}
                      className={cn(
                        'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50',
                        isAdmin
                          ? 'bg-red-600 hover:bg-red-700'
                          : 'bg-orange-600 hover:bg-orange-700'
                      )}
                    >
                      {roleLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : isAdmin ? (
                        'Revoke Admin'
                      ) : (
                        'Grant Admin'
                      )}
                    </button>
                    <button
                      onClick={() => setShowRoleDialog(false)}
                      className="rounded-md px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* Account info */}
      <Section title="Account">
        <div className="divide-y">
          <InfoRow label="User ID" value={<code className="text-xs">{user.id}</code>} />
          <InfoRow label="Clerk ID" value={<code className="text-xs">{user.clerkId}</code>} />
          <InfoRow label="Role" value={<Badge>{user.isAdmin ? 'Admin' : 'User'}</Badge>} />
          <InfoRow label="Purpose" value={user.mainPurpose?.replace(/_/g, ' ') ?? '—'} />
          <InfoRow
            label="Joined"
            value={
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                {formatDate(user.createdAt)}
              </span>
            }
          />
          <InfoRow
            label="Last sign in"
            value={
              user.lastSignInAt ? (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  {formatDate(user.lastSignInAt)}
                </span>
              ) : (
                '—'
              )
            }
          />
          <InfoRow label="Profiles" value={user._count.profiles} />
          <InfoRow label="Import sessions" value={user._count.importSessions} />
          <InfoRow label="Share tokens" value={user._count.shareTokens} />
        </div>
      </Section>

      {/* Profiles */}
      {user.profiles.map((profile) => (
        <Section key={profile.id} title={`Profile: ${profile.handle}`}>
          <div className="space-y-4">
            {/* Profile meta */}
            <div className="flex flex-wrap gap-2">
              <Badge variant={statusVariant(profile.status)}>{profile.status}</Badge>
              <Badge variant={visibilityVariant(profile.portfolioVisibility)}>
                Portfolio: {profile.portfolioVisibility}
              </Badge>
              <Badge variant={visibilityVariant(profile.resumeVisibility)}>
                Resume: {profile.resumeVisibility}
              </Badge>
              {profile.isArchived && <Badge variant="danger">Archived</Badge>}
            </div>

            {/* Public view links */}
            {(profile.portfolioVisibility === 'PUBLIC' ||
              profile.resumeVisibility === 'PUBLIC') && (
              <div className="flex flex-wrap gap-2">
                {profile.portfolioVisibility === 'PUBLIC' && (
                  <a
                    href={`/u/${profile.handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View Portfolio
                  </a>
                )}
                {profile.resumeVisibility === 'PUBLIC' && (
                  <a
                    href={`/u/${profile.handle}/resume`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View Resume
                  </a>
                )}
              </div>
            )}

            {/* Profile info */}
            <div className="divide-y">
              {profile.headline && <InfoRow label="Headline" value={profile.headline} />}
              {profile.resumeTitle && <InfoRow label="Resume title" value={profile.resumeTitle} />}
              <InfoRow label="Created" value={formatDate(profile.createdAt)} />
              <InfoRow label="Updated" value={formatDate(profile.updatedAt)} />
              {profile.publishedAt && (
                <InfoRow label="Published" value={formatDate(profile.publishedAt)} />
              )}
            </div>

            {/* Content counts */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {[
                { label: 'Work', count: profile._count.workExperiences, icon: Briefcase },
                { label: 'Education', count: profile._count.educations, icon: GraduationCap },
                { label: 'Skills', count: profile._count.skills, icon: Star },
                { label: 'Projects', count: profile._count.projects, icon: FolderGit2 },
                { label: 'Links', count: profile._count.links, icon: Link2 },
                { label: 'Photos', count: profile._count.photos, icon: ImageIcon },
                { label: 'Blog posts', count: profile._count.blogPosts, icon: ExternalLink },
                { label: 'Videos', count: profile._count.youtubeVideos, icon: Eye },
                { label: 'Certs', count: profile._count.certifications, icon: Shield },
                { label: 'Awards', count: profile._count.awards, icon: Star },
                {
                  label: 'Portfolios',
                  count: profile._count.generatedPortfolios,
                  icon: ExternalLink,
                },
              ].map(({ label, count, icon: Icon }) => (
                <div
                  key={label}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">{label}</span>
                  <span className="ml-auto font-semibold">{count}</span>
                </div>
              ))}
            </div>

            {/* GitHub profile */}
            {profile.githubProfile && (
              <div className="rounded-lg border p-4">
                <h3 className="mb-2 text-sm font-medium">GitHub</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="text-center">
                    <div className="text-lg font-semibold">{profile.githubProfile.username}</div>
                    <div className="text-xs text-muted-foreground">Username</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold">{profile.githubProfile.publicRepos}</div>
                    <div className="text-xs text-muted-foreground">Repos</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold">{profile.githubProfile.followers}</div>
                    <div className="text-xs text-muted-foreground">Followers</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold">{profile.githubProfile.totalStars}</div>
                    <div className="text-xs text-muted-foreground">Stars</div>
                  </div>
                </div>
              </div>
            )}

            {/* Data sources */}
            {profile.dataSourceConnections.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium">Data Sources</h3>
                <div className="space-y-1">
                  {profile.dataSourceConnections.map((ds, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{ds.source}</span>
                        <Badge variant={ds.status === 'CONNECTED' ? 'success' : 'default'}>
                          {ds.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {ds.itemsImported != null && `${ds.itemsImported} items`}
                        {ds.lastImportedAt && ` · ${formatDate(ds.lastImportedAt)}`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>
      ))}

      {/* Import sessions */}
      {user.importSessions.length > 0 && (
        <Section title="Recent Imports">
          <div className="space-y-1">
            {user.importSessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{session.source}</span>
                  <Badge
                    variant={
                      session.status === 'COMPLETED'
                        ? 'success'
                        : session.status === 'FAILED'
                          ? 'danger'
                          : 'warning'
                    }
                  >
                    {session.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {session.proposedCount != null && <span>{session.proposedCount} proposed</span>}
                  {session.appliedCount != null && <span>{session.appliedCount} applied</span>}
                  <span>{formatDate(session.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Share tokens */}
      {user.shareTokens.length > 0 && (
        <Section title="Share Tokens">
          <div className="space-y-1">
            {user.shareTokens.map((token) => (
              <div
                key={token.id}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <code className="text-xs">{token.token}</code>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>
                    {token.viewCount} views{token.maxViews != null && ` / ${token.maxViews} max`}
                  </span>
                  {token.expiresAt && <span>Expires {formatDate(token.expiresAt)}</span>}
                  <span>{formatDate(token.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
