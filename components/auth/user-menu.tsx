'use client';

import { useClerk, useUser } from '@clerk/nextjs';
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  LayoutDashboard,
  LogOut,
  Settings,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { AppThemeModeSwitch } from '@/components/app-theme-mode-switch';
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
import { resolvePublicResumeLink, type PublicResumeLink } from '@/lib/shareable-resume-link';
import { getDisplayHost, getPortfolioPath, getPortfolioUrl } from '@/lib/url';

type PublicPortfolioLink = {
  kind: 'public';
  url: string;
  href: string;
  displayHost: string;
  label: string;
};

type AccountPublicLink = PublicResumeLink | PublicPortfolioLink;

export function UserMenu() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [copied, setCopied] = useState(false);
  const [portfolioShare, setPortfolioShare] = useState<PublicPortfolioLink | null>(null);
  const [resumeShare, setResumeShare] = useState<PublicResumeLink | null>(null);
  // null = still checking; false = incomplete onboarding (no Profile yet)
  const [hasWorkspaceAccess, setHasWorkspaceAccess] = useState<boolean | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchShareState = useCallback(async () => {
    try {
      const res = await fetch('/api/profile');
      if (res.ok) {
        const data = await res.json();
        const profile = data.profile;
        setHasWorkspaceAccess(Boolean(profile));

        if (profile?.portfolioVisibility === 'PUBLIC' && profile?.handle) {
          setPortfolioShare({
            kind: 'public',
            url: getPortfolioUrl(profile.handle),
            href: getPortfolioPath(profile.handle),
            displayHost: getDisplayHost(profile.handle),
            label: 'Public profile',
          });
        } else {
          setPortfolioShare(null);
        }

        setResumeShare(
          resolvePublicResumeLink({
            hasPublicResume: Boolean(data.hasPublicResume),
            vanityUsername: data.vanityUsername,
            activeHandle: profile?.handle,
          })
        );
      } else {
        setPortfolioShare(null);
        setResumeShare(null);
        setHasWorkspaceAccess(false);
      }
    } catch {
      setHasWorkspaceAccess(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchShareState();
  }, [user, fetchShareState]);

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

  const portfolioEnabled = isPortfolioEnabled();
  const activeShare: AccountPublicLink | null = portfolioEnabled ? portfolioShare : resumeShare;
  const showShareSection = hasWorkspaceAccess === true;

  const handleCopyLink = async () => {
    if (!activeShare) return;
    try {
      await navigator.clipboard.writeText(activeShare.url);
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

          {/* Public link only — omit entirely when nothing is public. */}
          {showShareSection && activeShare ? (
            <div className="px-4 py-3">
              <p className="text-eyebrow mb-2">Your link</p>
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Globe className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="break-all font-mono text-[13px] font-medium leading-snug tracking-tight text-foreground">
                      {activeShare.displayHost}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{activeShare.label}</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                      copied
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary'
                    }`}
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </>
                    )}
                  </button>
                  <Link
                    href={activeShare.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View
                  </Link>
                </div>
              </div>
            </div>
          ) : null}

          {/* Workspace links only after onboarding created a Profile.
              Incomplete accounts stay on /onboarding — no escape hatches
              into an empty dashboard shell. */}
          {hasWorkspaceAccess ? (
            <>
              <DropdownMenuSeparator className="my-0 bg-border/60" />

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
                      <span className="text-[11px] text-muted-foreground">
                        {portfolioEnabled ? 'Your portfolio overview' : 'Your workspace overview'}
                      </span>
                    </div>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    href="/resumes"
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">Resumes</span>
                      <span className="text-[11px] text-muted-foreground">
                        Create and manage resumes
                      </span>
                    </div>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          ) : null}

          <DropdownMenuSeparator className="my-0 bg-border/60" />

          <AppThemeModeSwitch />

          <DropdownMenuSeparator className="my-0 bg-border/60" />

          {/* Footer — quieter, account-level actions. Settings (when
              onboarded) and sign-out share the same compact row treatment. */}
          <DropdownMenuGroup className="p-2">
            {hasWorkspaceAccess ? (
              <DropdownMenuItem asChild>
                <Link
                  href="/settings"
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Settings className="h-4 w-4" />
                  <span className="text-sm font-medium">Settings</span>
                </Link>
              </DropdownMenuItem>
            ) : null}
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
