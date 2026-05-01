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
  User,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { getDisplayHost, getPortfolioPath, getPortfolioUrl } from '@/lib/url';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function UserMenu() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [copied, setCopied] = useState(false);
  const [handle, setHandle] = useState<string | null>(null);
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchHandle = useCallback(async () => {
    try {
      const res = await fetch('/api/profile');
      if (res.ok) {
        const data = await res.json();
        setHandle(data.profile?.handle || null);
        setProfileStatus(data.profile?.status || null);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    if (user) fetchHandle();
  }, [user, fetchHandle]);

  // Render a stable placeholder during SSR and initial hydration to prevent mismatch.
  // After hydration, useEffect sets `mounted` to true and the real UI renders.
  if (!mounted || !user) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-9 w-[58px] animate-pulse rounded-full bg-muted" />
      </div>
    );
  }

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

  const handleCopyLink = async () => {
    if (!follioUrl) return;
    try {
      await navigator.clipboard.writeText(follioUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="group relative inline-flex h-9 items-center gap-1 rounded-full pl-0.5 pr-2 transition-all duration-200 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 data-[state=open]:bg-muted"
            aria-label="Open account menu"
          >
            <Avatar className="h-8 w-8 ring-1 ring-border/60 transition-all group-hover:ring-border group-data-[state=open]:ring-foreground/30">
              <AvatarImage src={user.imageUrl} alt={displayName} />
              <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 text-xs font-semibold text-primary">
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
          className="w-80 overflow-hidden rounded-xl border-border/50 bg-background/95 p-0 shadow-xl backdrop-blur-xl"
          align="end"
          sideOffset={8}
        >
          {/* Profile Header */}
          <div className="bg-gradient-to-br from-primary/5 via-transparent to-transparent px-4 py-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12 shadow-md ring-2 ring-background">
                <AvatarImage src={user.imageUrl} alt={displayName} />
                <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 text-sm font-semibold text-primary">
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
                <div className="mb-2 flex items-center gap-2">
                  <div className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
                  <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
                    Share
                  </span>
                  <div className="h-px flex-1 bg-gradient-to-l from-border to-transparent" />
                </div>
                <button
                  onClick={handleCopyLink}
                  className="group relative w-full overflow-hidden rounded-lg border border-border/60 bg-gradient-to-r from-muted/30 to-muted/10 p-3 text-left transition-all duration-300 hover:border-primary/30 hover:from-primary/5 hover:to-transparent hover:shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-300 ${
                        profileStatus === 'PUBLIC'
                          ? 'bg-emerald-500/10 text-emerald-500'
                          : 'bg-amber-500/10 text-amber-500'
                      }`}
                    >
                      {profileStatus === 'PUBLIC' ? (
                        <Globe className="h-4 w-4" />
                      ) : (
                        <Lock className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[13px] font-medium tracking-tight text-foreground">
                        {getDisplayHost(handle)}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {profileStatus === 'PUBLIC' ? 'Public profile' : 'Private link'}
                      </span>
                    </div>
                    <div
                      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-300 ${
                        copied
                          ? 'bg-emerald-500/10 text-emerald-600'
                          : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
                      }`}
                    >
                      {copied ? (
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

          <DropdownMenuSeparator className="my-0 opacity-50" />

          {/* Primary navigation — the two surfaces a signed-in user
              actually moves between from anywhere in the app. */}
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
            {handle && (
              <DropdownMenuItem asChild>
                <Link
                  href={getPortfolioPath(handle)}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">View profile</span>
                    <span className="text-[11px] text-muted-foreground">See your public page</span>
                  </div>
                </Link>
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>

          <DropdownMenuSeparator className="my-0 opacity-50" />

          {/* Footer — quieter, account-level actions. Settings and
              sign-out share the same compact row treatment so neither
              competes with the primary nav above. */}
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
    </div>
  );
}
