'use client';

import { useClerk, useUser } from '@clerk/nextjs';
import {
  Check,
  ChevronDown,
  Copy,
  Globe,
  LayoutDashboard,
  Lock,
  LogOut,
  Settings,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { AppHeader } from '@/components/app-header';
import { UserMenu } from '@/components/auth/user-menu';
import { DashboardTopbar } from '@/components/dashboard-sidebar';
import { Logo } from '@/components/Logo';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { isPortfolioEnabled } from '@/lib/features';
import { getDisplayHost, getPortfolioUrl, getResumeUrl } from '@/lib/url';

import type { TemplateNavbarTheme } from '@/lib/portfolio/templates/types';

type AuthState = 'owner' | 'authenticated' | 'anonymous';

interface ProfileNavbarProps {
  authState: AuthState;
  profileHandle?: string;
  /** When provided, forces the navbar into the template's color mode */
  navbarTheme?: TemplateNavbarTheme | null;
}

/**
 * Public profile chrome for the Links route.
 *
 * Mirrors `<SiteHeader>` so the links page behaves the same way every
 * other public surface does: a logged-in viewer sees their workspace
 * nav (so they never lose their context), an anonymous viewer sees a
 * quiet brand + sign-up chrome, and a templated portfolio gets the
 * minimal chrome so the template's design isn't fought.
 */
export function ProfileNavbar({ authState, profileHandle, navbarTheme }: ProfileNavbarProps) {
  // Templated chrome — stay out of the design's way.
  if (navbarTheme) {
    return (
      <AppHeader
        navbarTheme={navbarTheme}
        left={<Logo href="/" size="md" />}
        right={<OwnerOrAuthControls authState={authState} profileHandle={profileHandle} />}
      />
    );
  }

  // Logged-in viewer — their workspace nav travels with them.
  if (authState !== 'anonymous') {
    return (
      <DashboardTopbar>
        <UserMenu />
      </DashboardTopbar>
    );
  }

  // Anonymous — brand + the two doors in.
  return <AppHeader left={<Logo href="/" size="md" />} right={<AnonymousControls />} />;
}

/**
 * Right-aligned auth/owner control cluster.
 *
 * Reused by `SiteHeader` so that the new slim chrome and the legacy
 * `ProfileNavbar` share a single source of truth for the avatar menu,
 * dashboard button, and signed-out CTAs.
 */
export function OwnerOrAuthControls({
  authState,
  profileHandle,
}: {
  authState: AuthState;
  profileHandle?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {authState === 'owner' && <OwnerControls profileHandle={profileHandle} />}
      {authState === 'authenticated' && <AuthenticatedControls />}
      {authState === 'anonymous' && <AnonymousControls />}
    </div>
  );
}

// --- Owner: just the avatar menu. Dashboard lives inside that menu, so
// surfacing a separate "Dashboard" pill here was a redundant second
// path — it's gone. ---
function OwnerControls({ profileHandle }: { profileHandle?: string }) {
  return <ProfileMenu profileHandle={profileHandle} />;
}

// --- Authenticated visitor: sees their own avatar menu (no edit controls) ---
function AuthenticatedControls() {
  return <ProfileMenu />;
}

// --- Anonymous: subtle, modern sign-in / sign-up pair ---
function AnonymousControls() {
  return (
    <>
      <Link
        href="/sign-in"
        className="hidden h-8 items-center rounded-full px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:inline-flex"
      >
        Sign in
      </Link>
      <Link
        href="/sign-up"
        className="inline-flex h-8 items-center rounded-full bg-foreground px-3.5 text-[13px] font-medium text-background shadow-sm transition-all hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        Get started
      </Link>
    </>
  );
}

// --- Shared avatar dropdown menu ---
function ProfileMenu({ profileHandle }: { profileHandle?: string } = {}) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [handle, setHandle] = useState<string | null>(profileHandle ?? null);
  const [resumeVisibility, setResumeVisibility] = useState<string | null>(null);
  const [portfolioVisibility, setPortfolioVisibility] = useState<string | null>(null);
  const [copiedType, setCopiedType] = useState<'portfolio' | 'resume' | 'links' | null>(null);

  const fetchHandle = useCallback(async () => {
    try {
      const res = await fetch('/api/profile');
      if (res.ok) {
        const data = await res.json();
        setHandle(data.profile?.handle || null);
        setResumeVisibility(data.profile?.resumeVisibility || 'PRIVATE');
        setPortfolioVisibility(data.profile?.portfolioVisibility || 'PUBLIC');
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    if (user) fetchHandle();
  }, [user, fetchHandle]);

  if (!user) return null;

  const initials =
    [user.firstName?.[0], user.lastName?.[0]].filter(Boolean).join('').toUpperCase() ||
    user.emailAddresses[0]?.emailAddress?.[0]?.toUpperCase() ||
    '?';

  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(' ') ||
    user.emailAddresses[0]?.emailAddress ||
    'User';

  const email = user.emailAddresses[0]?.emailAddress || '';

  const follioUrl = handle ? getPortfolioUrl(handle) : null;

  const resumeUrl = handle ? getResumeUrl(handle) : null;

  const handleCopyLink = async (url: string, type: 'portfolio' | 'resume' | 'links') => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 2000);
    } catch {
      // fallback
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut({ redirectUrl: '/' });
    } catch {
      setIsSigningOut(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="group relative inline-flex h-9 items-center gap-1 rounded-full pl-0.5 pr-2 transition-all duration-200 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 data-[state=open]:bg-muted"
          aria-label="Open account menu"
        >
          <Avatar className="h-8 w-8 ring-1 ring-border/60 transition-all group-hover:ring-border group-data-[state=open]:ring-foreground/30">
            <AvatarImage src={user.imageUrl} alt={displayName} />
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <ChevronDown
            className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-hover:text-foreground group-data-[state=open]:rotate-180 group-data-[state=open]:text-foreground"
            strokeWidth={2.25}
            aria-hidden
          />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="w-72 overflow-hidden rounded-xl border border-border/60 bg-background p-0 shadow-lg"
        align="end"
        sideOffset={8}
      >
        {/* Profile Header */}
        <div className="border-b border-border/60 px-4 py-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-11 w-11 ring-1 ring-border/60">
              <AvatarImage src={user.imageUrl} alt={displayName} />
              <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col overflow-hidden">
              <p className="truncate text-sm font-semibold tracking-tight">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{email}</p>
            </div>
          </div>
        </div>

        {/* Share your Follio */}
        {follioUrl && handle && (
          <>
            <div className="px-4 py-3">
              <p className="text-eyebrow mb-2">Your links</p>

              {isPortfolioEnabled() && (
                <button
                  onClick={() => handleCopyLink(follioUrl, 'portfolio')}
                  className="group mb-2 w-full rounded-lg border border-border/60 bg-muted/20 p-3 text-left transition-colors hover:border-border hover:bg-muted/40"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <Globe className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[13px] font-medium tracking-tight text-foreground">
                        {getDisplayHost(handle)}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        Portfolio &middot;{' '}
                        {portfolioVisibility === 'PUBLIC' ? 'Public' : 'Unlisted'}
                      </span>
                    </div>
                    <div
                      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                        copiedType === 'portfolio'
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
                      }`}
                    >
                      {copiedType === 'portfolio' ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              )}

              {/* Resume Link */}
              <button
                onClick={() => resumeUrl && handleCopyLink(resumeUrl, 'resume')}
                className="group w-full rounded-lg border border-border/60 bg-muted/20 p-3 text-left transition-colors hover:border-border hover:bg-muted/40"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    {resumeVisibility === 'UNLISTED' ? (
                      <Lock className="h-4 w-4" />
                    ) : (
                      <Globe className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[13px] font-medium tracking-tight text-foreground">
                      {getDisplayHost(handle, '/r')}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Resume &middot; {resumeVisibility === 'UNLISTED' ? 'Unlisted' : 'Public'}
                    </span>
                  </div>
                  <div
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      copiedType === 'resume'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
                    }`}
                  >
                    {copiedType === 'resume' ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </div>
                </div>
              </button>
            </div>
          </>
        )}

        <DropdownMenuSeparator className="my-0 bg-border/60" />

        {/* Primary navigation — the workspace surface a signed-in
            visitor or owner needs to reach from any profile page. */}
        <DropdownMenuGroup className="p-2">
          <DropdownMenuItem asChild>
            <Link
              href="/dashboard"
              className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50">
                <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium">Dashboard</span>
                <span className="text-[11px] text-muted-foreground">Manage your resumes</span>
              </div>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator className="my-0 bg-border/60" />

        {/* Footer — quieter, account-level actions. Settings and
            sign-out share the same compact row treatment so they sit
            beneath the primary nav without competing with it. */}
        <DropdownMenuGroup className="p-2">
          <DropdownMenuItem asChild>
            <Link
              href="/settings"
              className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:text-foreground"
            >
              <Settings className="h-4 w-4" />
              <span className="text-sm font-medium">Settings</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors focus:bg-destructive/5 focus:text-destructive"
            onClick={handleSignOut}
            disabled={isSigningOut}
          >
            <LogOut className="h-4 w-4" />
            <span className="text-sm font-medium">
              {isSigningOut ? 'Signing out…' : 'Sign out'}
            </span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
