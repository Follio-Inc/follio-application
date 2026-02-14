'use client';

import { useClerk, useUser } from '@clerk/nextjs';
import {
  Check,
  ChevronDown,
  Copy,
  Edit,
  FileText,
  Globe,
  Link2,
  Lock,
  LogOut,
  Settings,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { Logo } from '@/components/Logo';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  getLinksPath,
  getLinksUrl,
  getPortfolioPath,
  getPortfolioUrl,
  getResumePath,
  getResumeUrl,
} from '@/lib/url';

type AuthState = 'owner' | 'authenticated' | 'anonymous';

interface ProfileNavbarProps {
  authState: AuthState;
  profileHandle?: string;
}

export function ProfileNavbar({ authState, profileHandle }: ProfileNavbarProps) {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center justify-between px-4 sm:px-6 lg:px-8">
        <Logo href="/" size="md" />
        <div className="flex items-center gap-3">
          {authState === 'owner' && <OwnerControls profileHandle={profileHandle} />}
          {authState === 'authenticated' && <AuthenticatedControls />}
          {authState === 'anonymous' && <AnonymousControls />}
        </div>
      </div>
    </header>
  );
}

// --- Owner: sees edit button + their avatar menu ---
function OwnerControls({ profileHandle }: { profileHandle?: string }) {
  return (
    <>
      <Link href="/builder">
        <Button variant="outline" size="sm" className="gap-2">
          <Edit className="h-4 w-4" />
          <span className="hidden sm:inline">Edit Profile</span>
        </Button>
      </Link>
      <ProfileMenu profileHandle={profileHandle} />
    </>
  );
}

// --- Authenticated visitor: sees their own avatar menu (no edit controls) ---
function AuthenticatedControls() {
  return <ProfileMenu />;
}

// --- Anonymous: subtle sign in / sign up ---
function AnonymousControls() {
  return (
    <>
      <Link href="/sign-in">
        <Button variant="ghost" size="sm">
          Sign in
        </Button>
      </Link>
      <Link href="/sign-up">
        <Button size="sm">Sign up</Button>
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
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [resumeVisibility, setResumeVisibility] = useState<string | null>(null);
  const [portfolioVisibility, setPortfolioVisibility] = useState<string | null>(null);
  const [linksVisibility, setLinksVisibility] = useState<string | null>(null);
  const [copiedType, setCopiedType] = useState<'portfolio' | 'resume' | 'links' | null>(null);

  const fetchHandle = useCallback(async () => {
    try {
      const res = await fetch('/api/profile');
      if (res.ok) {
        const data = await res.json();
        setHandle(data.profile?.handle || null);
        setProfileStatus(data.profile?.status || null);
        setResumeVisibility(data.profile?.resumeVisibility || 'UNLISTED');
        setPortfolioVisibility(data.profile?.portfolioVisibility || 'PUBLIC');
        setLinksVisibility(data.profile?.linksVisibility || 'PUBLIC');
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

  const linksUrl = handle ? getLinksUrl(handle) : null;

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
          className="group relative flex items-center gap-1 rounded-full py-1 pl-1 pr-1.5 ring-2 ring-transparent transition-all duration-300 hover:bg-muted/50 hover:ring-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="User menu"
        >
          <Avatar className="h-8 w-8 shadow-sm">
            <AvatarImage src={user.imageUrl} alt={displayName} />
            <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 text-xs font-semibold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <ChevronDown className="h-3 w-3 text-muted-foreground/60 transition-transform duration-200 group-data-[state=open]:rotate-180" />
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

              {/* Portfolio Link */}
              <button
                onClick={() => handleCopyLink(follioUrl, 'portfolio')}
                className="group relative mb-2 w-full overflow-hidden rounded-lg border border-border/60 bg-gradient-to-r from-muted/30 to-muted/10 p-3 text-left transition-all duration-300 hover:border-primary/30 hover:from-primary/5 hover:to-transparent hover:shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-300 ${
                      portfolioVisibility === 'PUBLIC'
                        ? 'bg-emerald-500/10 text-emerald-500'
                        : 'bg-amber-500/10 text-amber-500'
                    }`}
                  >
                    <Globe className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[13px] font-medium tracking-tight text-foreground">
                      {handle}.follio.me
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Portfolio &middot; {portfolioVisibility === 'PUBLIC' ? 'Public' : 'Unlisted'}
                    </span>
                  </div>
                  <div
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-300 ${
                      copiedType === 'portfolio'
                        ? 'bg-emerald-500/10 text-emerald-600'
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

              {/* Resume Link */}
              <button
                onClick={() => resumeUrl && handleCopyLink(resumeUrl, 'resume')}
                className="group relative w-full overflow-hidden rounded-lg border border-border/60 bg-gradient-to-r from-muted/30 to-muted/10 p-3 text-left transition-all duration-300 hover:border-primary/30 hover:from-primary/5 hover:to-transparent hover:shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-300 ${
                      resumeVisibility === 'UNLISTED'
                        ? 'bg-amber-500/10 text-amber-500'
                        : 'bg-emerald-500/10 text-emerald-500'
                    }`}
                  >
                    {resumeVisibility === 'UNLISTED' ? (
                      <Lock className="h-4 w-4" />
                    ) : (
                      <Globe className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[13px] font-medium tracking-tight text-foreground">
                      {handle}.follio.me/r
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Resume &middot; {resumeVisibility === 'UNLISTED' ? 'Unlisted' : 'Public'}
                    </span>
                  </div>
                  <div
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-300 ${
                      copiedType === 'resume'
                        ? 'bg-emerald-500/10 text-emerald-600'
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

              {/* Links Link */}
              <button
                onClick={() => linksUrl && handleCopyLink(linksUrl, 'links')}
                className="group relative w-full overflow-hidden rounded-lg border border-border/60 bg-gradient-to-r from-muted/30 to-muted/10 p-3 text-left transition-all duration-300 hover:border-primary/30 hover:from-primary/5 hover:to-transparent hover:shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-300 ${
                      linksVisibility === 'UNLISTED'
                        ? 'bg-amber-500/10 text-amber-500'
                        : 'bg-emerald-500/10 text-emerald-500'
                    }`}
                  >
                    {linksVisibility === 'UNLISTED' ? (
                      <Lock className="h-4 w-4" />
                    ) : (
                      <Globe className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[13px] font-medium tracking-tight text-foreground">
                      {handle}.follio.me/l
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Links &middot; {linksVisibility === 'UNLISTED' ? 'Unlisted' : 'Public'}
                    </span>
                  </div>
                  <div
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-300 ${
                      copiedType === 'links'
                        ? 'bg-emerald-500/10 text-emerald-600'
                        : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
                    }`}
                  >
                    {copiedType === 'links' ? (
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

        {/* Navigation */}
        <DropdownMenuGroup className="p-2">
          {handle && (
            <>
              <DropdownMenuItem asChild>
                <Link
                  href={getPortfolioPath(handle)}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Portfolio</span>
                    <span className="text-[11px] text-muted-foreground">View your portfolio</span>
                  </div>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  href={getResumePath(handle)}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Resume</span>
                    <span className="text-[11px] text-muted-foreground">View your resume</span>
                  </div>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  href={getLinksPath(handle)}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50">
                    <Link2 className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Links</span>
                    <span className="text-[11px] text-muted-foreground">View your links page</span>
                  </div>
                </Link>
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem asChild>
            <Link
              href="/builder"
              className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50">
                <Edit className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium">Edit Profile</span>
                <span className="text-[11px] text-muted-foreground">Update your information</span>
              </div>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link
              href="/builder/settings"
              className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50">
                <Settings className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium">Settings</span>
                <span className="text-[11px] text-muted-foreground">Preferences & account</span>
              </div>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator className="my-0 opacity-50" />

        {/* Sign Out */}
        <div className="p-2">
          <DropdownMenuItem
            className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-muted-foreground transition-all duration-200 focus:bg-destructive/5 focus:text-destructive"
            onClick={handleSignOut}
            disabled={isSigningOut}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50">
              <LogOut className="h-4 w-4" />
            </div>
            <span className="text-sm font-medium">
              {isSigningOut ? 'Signing out...' : 'Sign out'}
            </span>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
